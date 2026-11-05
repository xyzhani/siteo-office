// Simulated payments for keyless demos. Same interface as paypal.js; pages live at /sim/checkout/:id and
// /sim/invoice/:id and are clearly marked as simulations. Add PayPal Sandbox keys to use the real thing.
import { db, save, id as newId, now } from "../../store.js";
import { settings } from "../../config.js";

export const name = "simulated";
const base = () => settings.publicUrl || `http://localhost:${settings.port}`;
const sim = () => (db.sim ||= { orders: {}, invoices: {} });

export async function createOrder({ amount, currency, description, referenceId, returnUrl, cancelUrl }) {
  const id = "SIM-ORDER-" + newId().toUpperCase();
  sim().orders[id] = { id, amount, currency, description, referenceId, returnUrl, cancelUrl, status: "CREATED", at: now() };
  save();
  return { id, status: "CREATED", approveUrl: `${base()}/sim/checkout/${id}` };
}
export async function getOrder(id) { const o = sim().orders[id]; if (!o) throw new Error("No such order"); return { id, status: o.status, referenceId: o.referenceId, capture: o.captureId ? { id: o.captureId, status: "COMPLETED" } : null }; }
export async function approveOrder(id) { const o = sim().orders[id]; if (!o) throw new Error("No such order"); if (o.status === "CREATED") o.status = "APPROVED"; save(); return o; }
export async function captureOrder(id) {
  const o = sim().orders[id]; if (!o) throw new Error("No such order");
  if (o.status !== "COMPLETED") { if (o.status !== "APPROVED") throw new Error("Order not approved yet"); o.status = "COMPLETED"; o.captureId = "SIM-CAP-" + newId().toUpperCase(); save(); }
  return { id, status: "COMPLETED", captureId: o.captureId, captureStatus: "COMPLETED", amount: o.amount, referenceId: o.referenceId };
}
export async function createInvoice({ referenceId, currency, items, recipient, note }) {
  const id = "SIM-INV-" + newId().toUpperCase();
  const n = Object.keys(sim().invoices).length + 1;
  sim().invoices[id] = { id, number: "SIM-" + String(n).padStart(4, "0"), referenceId, currency, items, recipient, note, status: "DRAFT", at: now() };
  save();
  return { id, number: sim().invoices[id].number, status: "DRAFT" };
}
export async function sendInvoice(id) { const i = sim().invoices[id]; if (!i) throw new Error("No such invoice"); i.status = "SENT"; save(); return { payerUrl: `${base()}/sim/invoice/${id}` }; }
export async function getInvoice(id) { const i = sim().invoices[id]; if (!i) throw new Error("No such invoice"); return { id, status: i.status, number: i.number, payerUrl: `${base()}/sim/invoice/${id}`, due: i.items.reduce((a, x) => a + Number(x.amount), 0) }; }
export async function payInvoice(id) { const i = sim().invoices[id]; if (!i) throw new Error("No such invoice"); i.status = "PAID"; save(); return i; }
export async function remindInvoice() { return { ok: true }; }
export async function verifyWebhook() { return false; }
export const simOrder = (id) => sim().orders[id];
export const simInvoice = (id) => sim().invoices[id];
