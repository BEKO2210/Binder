import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { pushCopy, type PushKind } from "./copy.ts";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_SEND_BATCH = 100;
const MAX_RECEIPT_BATCH = 300;

type ClaimedDelivery = {
  delivery_id: number;
  token: string;
  kind: PushKind;
  match_id: string | null;
  route: "chat" | "matches" | "profile";
  // The English wording, kept as the fallback for a recipient whose language
  // is not known. Never anything a person wrote — the words are generic by
  // design and identical for everyone who gets this kind of notification.
  title: string;
  body: string;
  sound: boolean;
  vibration: boolean;
  language: string | null;
};

type ClaimedReceipt = { delivery_id: number; ticket_id: string };
type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

function firstKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return raw;
  }
}

function requireEnvironment() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = firstKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
  const dispatchSecret = Deno.env.get("BINDER_PUSH_DISPATCH_SECRET");
  if (!url || !secret || !dispatchSecret) throw new Error("Push dispatcher environment is incomplete.");
  return { url, secret, dispatchSecret, expoAccessToken: Deno.env.get("EXPO_ACCESS_TOKEN") ?? null };
}

function expoHeaders(accessToken: string | null): HeadersInit {
  return {
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {}),
  };
}

function retryableExpoError(code: string | null, httpStatus?: number): boolean {
  if (httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500)) return true;
  return code === "MessageRateExceeded" || code === "ExpoServerError" || code === "ProviderError";
}

function channelId(job: ClaimedDelivery): string {
  const behavior = `${job.sound ? "sound" : "silent"}_${job.vibration ? "vibrate" : "steady"}`;
  return `binder_${job.kind}_${behavior}_v1`;
}

function expoMessage(job: ClaimedDelivery) {
  // Fifteen languages are advertised, so a notification is written in the one
  // the recipient reads. The claim carries the English text for a row with no
  // language yet, and `pushCopy` falls back to the same English if a locale is
  // unknown, so there is no path that produces an empty notification.
  const copy = job.language ? pushCopy(job.language, job.kind) : { title: job.title, body: job.body };
  return {
    to: job.token,
    title: copy.title,
    body: copy.body,
    data: {
      category: job.kind,
      route: job.route,
      ...(job.match_id ? { matchId: job.match_id } : {}),
    },
    priority: job.kind === "safety_alert" || job.kind === "new_message" ? "high" : "default",
    sound: job.sound ? "default" : null,
    channelId: channelId(job),
  };
}

async function recordTicket(
  client: SupabaseClient,
  workerId: string,
  deliveryId: number,
  ticketId: string | null,
  code: string | null,
  message: string | null,
  retryable: boolean,
) {
  const { error } = await client.rpc("record_push_ticket", {
    p_delivery_id: deliveryId,
    p_worker_id: workerId,
    p_ticket_id: ticketId,
    p_error_code: code,
    p_error_message: message,
    p_retryable: retryable,
  });
  if (error) throw new Error(`Could not record push ticket for delivery ${deliveryId}: ${error.message}`);
}

async function sendDeliveries(client: SupabaseClient, workerId: string, accessToken: string | null) {
  const { data, error } = await client.rpc("claim_push_deliveries", { p_worker_id: workerId, p_limit: MAX_SEND_BATCH });
  if (error) throw new Error(`Could not claim push deliveries: ${error.message}`);
  const jobs = (data ?? []) as ClaimedDelivery[];
  if (jobs.length === 0) return { claimed: 0, ticketed: 0, failed: 0 };

  let response: Response;
  try {
    response = await fetch(EXPO_SEND_URL, {
      method: "POST",
      headers: expoHeaders(accessToken),
      body: JSON.stringify(jobs.map(expoMessage)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expo push request failed";
    await Promise.all(jobs.map((job) => recordTicket(client, workerId, job.delivery_id, null, "NetworkError", message, true)));
    return { claimed: jobs.length, ticketed: 0, failed: jobs.length };
  }

  if (!response.ok) {
    const message = (await response.text()).slice(0, 500) || `Expo HTTP ${response.status}`;
    await Promise.all(jobs.map((job) => recordTicket(client, workerId, job.delivery_id, null, `ExpoHTTP${response.status}`, message, retryableExpoError(null, response.status))));
    return { claimed: jobs.length, ticketed: 0, failed: jobs.length };
  }

  const payload = await response.json() as { data?: ExpoTicket[] };
  const tickets = payload.data ?? [];
  let ticketed = 0;
  let failed = 0;
  await Promise.all(jobs.map(async (job, index) => {
    const ticket = tickets[index];
    if (!ticket) {
      failed += 1;
      await recordTicket(client, workerId, job.delivery_id, null, "MalformedExpoResponse", "Missing aligned Expo push ticket", true);
      return;
    }
    if (ticket.status === "ok") {
      ticketed += 1;
      await recordTicket(client, workerId, job.delivery_id, ticket.id, null, null, false);
      return;
    }
    failed += 1;
    const code = ticket.details?.error ?? "ExpoTicketError";
    await recordTicket(client, workerId, job.delivery_id, null, code, ticket.message ?? code, retryableExpoError(code));
  }));
  return { claimed: jobs.length, ticketed, failed };
}

async function recordReceipt(
  client: SupabaseClient,
  workerId: string,
  deliveryId: number,
  ok: boolean,
  code: string | null,
  message: string | null,
  retryable: boolean,
) {
  const { error } = await client.rpc("record_push_receipt", {
    p_delivery_id: deliveryId,
    p_worker_id: workerId,
    p_ok: ok,
    p_error_code: code,
    p_error_message: message,
    p_retryable: retryable,
  });
  if (error) throw new Error(`Could not record push receipt for delivery ${deliveryId}: ${error.message}`);
}

async function checkReceipts(client: SupabaseClient, workerId: string, accessToken: string | null) {
  const { data, error } = await client.rpc("claim_push_receipts", { p_worker_id: workerId, p_limit: MAX_RECEIPT_BATCH });
  if (error) throw new Error(`Could not claim push receipts: ${error.message}`);
  const claims = (data ?? []) as ClaimedReceipt[];
  if (claims.length === 0) return { claimed: 0, delivered: 0, failed: 0, pending: 0 };

  let response: Response;
  try {
    response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: expoHeaders(accessToken),
      body: JSON.stringify({ ids: claims.map((claim) => claim.ticket_id) }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expo receipt request failed";
    await Promise.all(claims.map((claim) => recordReceipt(client, workerId, claim.delivery_id, false, "ReceiptUnavailable", message, false)));
    return { claimed: claims.length, delivered: 0, failed: 0, pending: claims.length };
  }

  if (!response.ok) {
    const message = (await response.text()).slice(0, 500) || `Expo receipt HTTP ${response.status}`;
    await Promise.all(claims.map((claim) => recordReceipt(client, workerId, claim.delivery_id, false, "ReceiptUnavailable", message, false)));
    return { claimed: claims.length, delivered: 0, failed: 0, pending: claims.length };
  }

  const payload = await response.json() as { data?: Record<string, ExpoReceipt> };
  const receipts = payload.data ?? {};
  let delivered = 0;
  let failed = 0;
  let pending = 0;
  await Promise.all(claims.map(async (claim) => {
    const receipt = receipts[claim.ticket_id];
    if (!receipt) {
      pending += 1;
      await recordReceipt(client, workerId, claim.delivery_id, false, "ReceiptUnavailable", "Expo receipt is not ready", false);
      return;
    }
    if (receipt.status === "ok") {
      delivered += 1;
      await recordReceipt(client, workerId, claim.delivery_id, true, null, null, false);
      return;
    }
    failed += 1;
    const code = receipt.details?.error ?? "ExpoReceiptError";
    await recordReceipt(client, workerId, claim.delivery_id, false, code, receipt.message ?? code, retryableExpoError(code));
  }));
  return { claimed: claims.length, delivered, failed, pending };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  let environment: ReturnType<typeof requireEnvironment>;
  try {
    environment = requireEnvironment();
  } catch {
    return Response.json({ error: "Dispatcher configuration unavailable" }, { status: 500 });
  }
  if (req.headers.get("x-binder-dispatch-secret") !== environment.dispatchSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = crypto.randomUUID();
  const client = createClient(environment.url, environment.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const receipts = await checkReceipts(client, workerId, environment.expoAccessToken);
    const sends = await sendDeliveries(client, workerId, environment.expoAccessToken);
    console.log("Binder push dispatch completed", {
      workerId,
      sends,
      receipts,
    });
    return Response.json({ workerId, sends, receipts }, { status: 200 });
  } catch (error) {
    console.error("Binder push dispatch failed", { workerId, error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "Dispatcher failed", workerId }, { status: 500 });
  }
});
