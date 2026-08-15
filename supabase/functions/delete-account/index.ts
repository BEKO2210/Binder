import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function firstKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return raw;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const publishable = firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ?? Deno.env.get("SUPABASE_ANON_KEY") ?? null;
  const secret = firstKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
  if (!url || !publishable || !secret) return Response.json({ error: "Server configuration unavailable" }, { status: 500 });

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: "Invalid session" }, { status: 401 });

  const userId = authData.user.id;
  const { error: prepareError } = await userClient.rpc("prepare_account_deletion");
  if (prepareError) return Response.json({ error: "Could not prepare account deletion" }, { status: 409 });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: objects, error: listError } = await admin.storage.from("profile-media").list(userId, { limit: 1000 });
  if (listError) return Response.json({ error: "Could not remove account media" }, { status: 500 });
  const paths = (objects ?? []).filter((object) => object.name).map((object) => `${userId}/${object.name}`);
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from("profile-media").remove(paths);
    if (removeError) return Response.json({ error: "Could not remove account media" }, { status: 500 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
  if (deleteError) return Response.json({ error: "Account deletion failed" }, { status: 500 });

  return Response.json({ deleted: true }, { status: 200 });
});
