import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const PRODUCTION_ORIGIN = "https://beko2210.github.io";
const DEFAULT_REDIRECT = `${PRODUCTION_ORIGIN}/Binder/admin/`;

function firstKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return raw;
  }
}

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return PRODUCTION_ORIGIN;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(origin)) return origin;
  return null;
}

function respond(req: Request, body: Record<string, unknown>, status: number): Response {
  const origin = allowedOrigin(req);
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin ?? PRODUCTION_ORIGIN,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

type InviteBody = {
  email?: unknown;
  permissions?: {
    reviewMedia?: unknown;
    reviewReports?: unknown;
    suspendAccounts?: unknown;
  };
};

Deno.serve(async (req: Request) => {
  if (!allowedOrigin(req)) return respond(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return respond(req, { ok: true }, 200);
  if (req.method !== "POST") return respond(req, { error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return respond(req, { error: "Authentication required" }, 401);

  let body: InviteBody;
  try {
    body = await req.json() as InviteBody;
  } catch {
    return respond(req, { error: "Invalid request" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const reviewMedia = body.permissions?.reviewMedia !== false;
  const reviewReports = body.permissions?.reviewReports !== false;
  const suspendAccounts = body.permissions?.suspendAccounts === true;
  if (!email || email.length > 254 || (suspendAccounts && !reviewReports)) {
    return respond(req, { error: "Invalid moderator invitation" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishable = firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ??
    Deno.env.get("SUPABASE_ANON_KEY") ?? null;
  const secret = firstKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
  if (!url || !publishable || !secret) {
    return respond(req, { error: "Server configuration unavailable" }, 500);
  }

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return respond(req, { error: "Invalid session" }, 401);

  const { error: claimError } = await userClient.rpc("claim_admin_session");
  if (claimError) return respond(req, { error: "Owner permission required" }, 403);

  const { data: prepared, error: prepareError } = await userClient.rpc(
    "admin_prepare_moderator_invite",
    {
      p_email: email,
      p_can_review_media: reviewMedia,
      p_can_review_reports: reviewReports,
      p_can_suspend_accounts: suspendAccounts,
    },
  );
  if (prepareError) return respond(req, { error: "Owner permission required" }, 403);

  const preparedRow = Array.isArray(prepared) ? prepared[0] : prepared;
  if (!preparedRow?.needs_invite) {
    return respond(req, { status: "active" }, 200);
  }

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectTo = Deno.env.get("BINDER_ADMIN_REDIRECT_URL") ?? DEFAULT_REDIRECT;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    await userClient.rpc("admin_update_moderator", {
      p_email: email,
      p_enabled: false,
      p_can_review_media: reviewMedia,
      p_can_review_reports: reviewReports,
      p_can_suspend_accounts: suspendAccounts,
    });
    return respond(req, { error: "Moderator invitation could not be sent" }, 409);
  }

  return respond(req, { status: "invited" }, 201);
});
