// PayPal REST: Orders v2 (Checkout), Invoicing v2, Webhooks. Sandbox by default (PAYPAL_ENV=sandbox).
// Credentials only from .env / your host's env vars: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET.
import { settings } from "../../config.js";

export const name = "paypal";
const BASE = () => (settings.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
let token = null, tokenExp = 0;

async function accessToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  const auth = Buffer.from(`${settings.paypal.clientId}:${settings.paypal.clientSecret}`).toString("base64");
  const r = await fetch(BASE() + "/v1/oauth2/token", { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status}). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET and PAYPAL_ENV.`);
  const d = await r.json(); token = d.access_token; tokenExp = Date.now() + d.expires_in * 1000;
  return token;
}

export async function api(method, path, body, extraHeaders = {}) {
  const r = await fetch(BASE() + path, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", prefer: "return=representation", ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.details?.map((d) => d.description || d.issue).join("; ") || data?.message || text.slice(0, 200);
    const err = new Error(`PayPal ${method} ${path.split("?")[0]} → ${r.status}: ${msg}`); err.status = r.status; err.data = data; throw err;
  }
  return data;
}
const money = (currency, value) => ({ currency_code: currency, value: Number(value).toFixed(2) });

// ── Orders v2 (the deposit)
export async function createOrder({ amount, currency, description, referenceId, returnUrl, cancelUrl, brandName }) {
  const o = await api("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: referenceId, custom_id: referenceId, description: description.slice(0, 127), amount: money(currency, amount) }],
    payment_source: { paypal: { experience_context: { brand_name: (brandName || "").slice(0, 127) || undefined, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: cancelUrl } } },
  }, { "PayPal-Request-Id": "order-" + referenceId });
  const link = o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  return { id: o.id, status: o.status, approveUrl: link?.href };
}
export async function getOrder(id) { const o = await api("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`); return { id: o.id, status: o.status, referenceId: o.purchase_units?.[0]?.reference_id, capture: o.purchase_units?.[0]?.payments?.captures?.[0] || null }; }
export async function captureOrder(id) {
  const o = await api("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { "PayPal-Request-Id": "capture-" + id });
  const cap = o.purchase_units?.[0]?.payments?.captures?.[0];
  return { id: o.id, status: o.status, captureId: cap?.id, captureStatus: cap?.status, amount: cap?.amount?.value, referenceId: o.purchase_units?.[0]?.reference_id };
}

// ── Invoicing v2 (the balance)
export async function createInvoice({ referenceId, currency, items, recipient, invoicer, note, terms, dueDays = 10 }) {
  const inv = await api("POST", "/v2/invoicing/invoices", {
    detail: { currency_code: currency, reference: referenceId, note, terms_and_conditions: terms, payment_term: { term_type: `NET_${[10, 15, 30, 45, 60, 90].find((d) => d >= dueDays) || 10}` } },
    invoicer: { business_name: invoicer.name, website: invoicer.website || undefined },
    primary_recipients: [{ billing_info: { business_name: recipient.name, email_address: recipient.email } }],
    items: items.map((i) => ({ name: i.name.slice(0, 200), description: (i.description || "").slice(0, 1000), quantity: "1", unit_amount: money(currency, i.amount), unit_of_measure: "AMOUNT" })),
  });
  const id = inv.id || inv.href?.split("/").pop();
  return { id, number: inv.detail?.invoice_number, status: inv.status || "DRAFT" };
}
export async function sendInvoice(id) {
  const r = await api("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, { send_to_invoicer: true, send_to_recipient: true });
  return { payerUrl: r?.href || null };
}
export async function getInvoice(id) {
  const inv = await api("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
  return { id: inv.id, status: inv.status, number: inv.detail?.invoice_number, payerUrl: inv.detail?.metadata?.recipient_view_url || null, due: inv.amount?.value || inv.due_amount?.value };
}
export async function remindInvoice(id, note) {
  await api("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, { subject: "Payment reminder", note: note?.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true });
  return { ok: true };
}

// ── Webhooks: ask PayPal to verify the signature (needs PAYPAL_WEBHOOK_ID)
export async function verifyWebhook(headers, event) {
  if (!settings.paypal.webhookId) return false;
  const r = await api("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"], transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"], transmission_time: headers["paypal-transmission-time"], webhook_id: settings.paypal.webhookId, webhook_event: event,
  });
  return r?.verification_status === "SUCCESS";
}
