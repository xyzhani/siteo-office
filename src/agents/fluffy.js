// Fluffy (follow-ups + invoicing): when the deposit is confirmed, Fluffy creates and sends a PayPal invoice
// for the balance as an AGENT TOOL CALL (tools named like PayPal's Agent Toolkit: create_invoice, send_invoice,
// get_invoice). With PAYPAL_AGENT_TOOLKIT=true and @paypal/agent-toolkit installed, the official toolkit runs them.
import { loadAgentInstructions, loadStudio, settings, paypalReady } from "../config.js";
import { payments } from "../providers/payments/index.js";
import * as llm from "../providers/llm/index.js";

const TOOLS = [
  { name: "create_invoice", description: "Create a draft PayPal invoice for the balance owed by a customer.", input_schema: { type: "object", properties: {
    recipient_name: { type: "string" }, recipient_email: { type: "string" }, item_name: { type: "string" }, item_description: { type: "string" },
    amount: { type: "number", description: "Balance amount, e.g. 400" }, currency_code: { type: "string" }, note: { type: "string" } }, required: ["recipient_name", "recipient_email", "item_name", "amount", "currency_code"] } },
  { name: "send_invoice", description: "Send a draft PayPal invoice to the customer.", input_schema: { type: "object", properties: { invoice_id: { type: "string" } }, required: ["invoice_id"] } },
  { name: "get_invoice", description: "Get a PayPal invoice's status.", input_schema: { type: "object", properties: { invoice_id: { type: "string" } }, required: ["invoice_id"] } },
];

function ourHandlers(lead) {
  const studio = loadStudio();
  return {
    async create_invoice(i) {
      const inv = await payments.createInvoice({
        referenceId: lead.id, currency: i.currency_code || studio.currency,
        items: [{ name: i.item_name, description: i.item_description || "", amount: i.amount }],
        recipient: { name: i.recipient_name, email: i.recipient_email },
        invoicer: { name: studio.name, website: studio.website }, note: i.note || "", terms: studio.invoiceTerms || "",
      });
      return { invoice_id: inv.id, invoice_number: inv.number, status: inv.status };
    },
    async send_invoice(i) { const r = await payments.sendInvoice(i.invoice_id); return { invoice_id: i.invoice_id, status: "SENT", payer_view_url: r.payerUrl }; },
    async get_invoice(i) { return payments.getInvoice(i.invoice_id); },
  };
}

// Optional: the official PayPal Agent Toolkit executes the tool calls (npm install @paypal/agent-toolkit)
async function toolkitHandlers() {
  if (!(paypalReady && /^(1|true|yes)$/i.test(process.env.PAYPAL_AGENT_TOOLKIT || ""))) return null;
  let mod; try { mod = await import("@paypal/agent-toolkit/openai"); } catch { return null; }
  const tk = new mod.PayPalAgentToolkit({ clientId: settings.paypal.clientId, clientSecret: settings.paypal.clientSecret, configuration: { actions: { invoices: { create: true, send: true, list: true } }, context: { sandbox: settings.paypal.env !== "live" } } });
  const tools = tk.getTools().filter((t) => ["create_invoice", "send_invoice", "get_invoice"].includes(t.function.name))
    .map((t) => ({ name: t.function.name, description: t.function.description.slice(0, 1000), input_schema: t.function.parameters }));
  const call = (name) => async (input) => { const r = await tk.handleToolCall({ id: "c" + Date.now(), type: "function", function: { name, arguments: JSON.stringify(input) } }); return typeof r.content === "string" ? r.content : JSON.stringify(r.content); };
  return { tools, handlers: Object.fromEntries(tools.map((t) => [t.name, call(t.name)])), official: true };
}

const findInvoiceId = (x) => (String(typeof x === "string" ? x : JSON.stringify(x)).match(/\b(INV2-[A-Z0-9-]+|SIM-INV-[A-Z0-9]+)\b/) || [])[1];

export async function invoiceBalance(run, lead) {
  const studio = loadStudio();
  const balance = +(studio.conceptPrice - (studio.conceptPrice * studio.depositPercent) / 100).toFixed(2);
  const facts = { recipient_name: lead.name, recipient_email: lead.facts?.email, item_name: `Website build: ${lead.name} (balance)`, item_description: `Balance after the ${studio.depositPercent}% deposit (PayPal capture ${lead.deposit?.captureId || "confirmed"}).`, amount: balance, currency_code: studio.currency, note: `Thank you for your deposit. This invoice is the remaining balance for your new website.` };
  const tk = await toolkitHandlers();
  const tools = tk?.tools || TOOLS, handlers = tk?.handlers || ourHandlers(lead);
  let calls;
  if (llm.available()) {
    const r = await llm.agent(run, {
      system: loadAgentInstructions("followup"), tools, handlers,
      prompt: `The customer paid the deposit. Create a PayPal invoice for the balance with exactly these details, then send it. Do nothing else.\n${JSON.stringify(facts, null, 2)}`,
    });
    calls = r.calls;
  } else {
    // demo: the same tool calls, scripted
    calls = [];
    const created = await handlers.create_invoice(facts); calls.push({ tool: "create_invoice", input: facts, output: created });
    const sent = await handlers.send_invoice({ invoice_id: created.invoice_id }); calls.push({ tool: "send_invoice", input: { invoice_id: created.invoice_id }, output: sent });
  }
  const invoiceId = calls.map((c) => findInvoiceId(c.output)).find(Boolean);
  if (!invoiceId) throw new Error("Fluffy couldn't create the invoice: " + JSON.stringify(calls.at(-1)?.output || "no tool call").slice(0, 300));
  if (!calls.some((c) => c.tool === "send_invoice")) { const o = await handlers.send_invoice({ invoice_id: invoiceId }); calls.push({ tool: "send_invoice", input: { invoice_id: invoiceId }, output: o }); }
  const info = await payments.getInvoice(invoiceId).catch(() => ({}));
  return { invoiceId, number: info.number, payerUrl: info.payerUrl || calls.map((c) => c.output?.payer_view_url).find(Boolean) || null, amount: balance, currency: studio.currency, calls: calls.map((c) => ({ tool: c.tool, input: c.input })), official: !!tk?.official };
}
