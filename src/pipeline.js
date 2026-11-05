// The pipeline state machine. Every step updates the 3D office (who's working, handoffs, speech bubbles).
//
// lead.status:  found → audited → skipped | shortlisted → building ⇄ checking → set_aside | seo → awaiting_approval
//               → sent → (replied) → deposit_pending_approval → deposit_link_sent → deposit_paid → invoice_sent → paid
//               side exits: closed (not interested), unsubscribed, error
import { settings, demoMode, loadNiche, loadStudio, loadTeam, listNiches } from "./config.js";
import { db, save, id, now, log, lead as getLead, email as getEmail } from "./store.js";
import * as office from "./office-state.js";
import { sleep } from "./util.js";
import * as llm from "./providers/llm/index.js";
import * as mail from "./providers/email/index.js";
import { payments, isSimulated } from "./providers/payments/index.js";
import * as misso from "./agents/misso.js";
import * as tom from "./agents/tom.js";
import * as knight from "./agents/knight.js";
import * as snowBell from "./agents/snow-bell.js";
import * as sherlock from "./agents/sherlock.js";
import * as writer from "./agents/writer.js";
import * as scrapper from "./agents/scrapper.js";
import * as fluffy from "./agents/fluffy.js";
import { DEMO_TOWN } from "./demo/businesses.js";

const MAX_ROUNDS = 3;
const base = () => settings.publicUrl || `http://localhost:${settings.port}`;
const pace = (k = 1) => sleep(settings.pacing.stepMs * k);
const name = (role) => loadTeam().agents[role]?.name || role;
const enabled = (role) => loadTeam().agents[role]?.enabled !== false;
const setStatus = (l, status, extra = {}) => { Object.assign(l, extra, { status, updated: now() }); save(); };
export const stage = (l) => (["paid"].includes(l.status) ? "paid" : ["invoice_sent"].includes(l.status) ? "invoice" : ["deposit_paid"].includes(l.status) ? "deposit"
  : ["sent", "replied", "deposit_pending_approval", "deposit_link_sent", "closed", "unsubscribed"].includes(l.status) && l.emailedAt ? "approved" : ["awaiting_approval"].includes(l.status) ? "concept" : null);

// "dentists in Galway" → { term: "dentists", town: "Galway", niche: "dental" }
export function parseQuery(q, nicheHint) {
  const m = String(q || "").trim().match(/^(.*?)\s+(?:in|near|around)\s+(.+)$/i);
  const term = (m ? m[1] : q).trim(), town = (m ? m[2] : "").trim();
  let niche = nicheHint && listNiches().includes(nicheHint) ? nicheHint : null;
  if (!niche) for (const n of listNiches()) { const s = loadNiche(n).search; if ((s.keywords || []).some((k) => term.toLowerCase().includes(k.toLowerCase()))) { niche = n; break; } }
  return { term, town, niche: niche || listNiches()[0] };
}

// ── runs (one at a time, queued)
let queue = Promise.resolve();
export function startRun(query, nicheHint) {
  const p = parseQuery(query, nicheHint);
  if (!p.town && !demoMode) throw new Error('Say where, e.g. "dentists in Galway"');
  const run = { id: id("r"), query: String(query).slice(0, 120), niche: p.niche, town: demoMode ? DEMO_TOWN : p.town, demo: demoMode, status: "queued", cost_usd: 0, created: now(), counts: {} };
  db.runs.unshift(run); save();
  queue = queue.then(() => execute(run)).catch(() => {});
  return run;
}

async function execute(run) {
  const niche = loadNiche(run.niche);
  run.status = "running"; save();
  try {
    // the team walks from the nap lounge to their desks first
    office.say("finder", `New job: ${run.query}. Everyone to your desks!`);
    await pace(demoMode ? 3 : 1);
    // 1. Misso finds businesses
    office.working("finder", `Searching for ${niche.search.label} in ${run.town}`);
    office.say("finder", demoMode ? `Demo mode: looking in ${run.town}, a fictional town 🐾` : `Looking for ${niche.search.label} in ${run.town}…`);
    log("finder", `Searching ${demoMode ? "fictional demo data" : settings.search.provider} for ${niche.search.label} in ${run.town}`, { run: run.id });
    await pace();
    const { businesses } = await misso.find({ niche, town: run.town, limit: settings.search.maxResults });
    const fresh = businesses.filter((b) => !db.unsubscribed.includes(hostOf(b.website)));
    const leads = fresh.map((b) => ({ id: id("b"), run: run.id, niche: run.niche, name: b.name, website: b.website, phone: b.phone, address: b.address, email: b.email || null, town: run.town, fictional: !!b.fictional, source: b.source, status: "found", created: now(), updated: now() }));
    db.leads.push(...leads); run.counts.found = leads.length; save();
    office.say("finder", `Found ${leads.length} ${niche.search.label} with a website`);
    log("finder", `Found ${leads.length} businesses with websites`, { run: run.id });
    if (!leads.length) { office.idle("finder"); return finishRun(run, "done", "No businesses with websites found"); }
    office.handoff("finder", "auditor", `${leads.length} websites`);
    await pace(1.5);
    office.idle("finder");

    // 2. Tom audits every site and shortlists the weakest
    for (const l of leads) {
      office.working("auditor", `Auditing ${l.name}`, l.name);
      try {
        const a = await tom.audit(run, niche, l);
        if (!a.ok) { setStatus(l, "skipped", { reason: a.reason }); office.say("auditor", `${l.name}: ${a.reason}`); continue; }
        setStatus(l, "audited", { audit: { score: a.score, issues: a.issues, signals: a.signals, pagespeed: a.pagespeed }, facts: { ...a.facts, town: l.town }, email: a.facts.email || l.email });
        office.say("auditor", `${l.name}: ${a.score}/100 weak${a.issues[0] ? " · " + a.issues[0].label : ""}`);
        log("auditor", `${l.name}: weakness ${a.score}/100 (${a.issues.map((i) => i.label).join(", ") || "no issues"})`, { lead: l.id });
      } catch (e) { if (e instanceof llm.CostCapError) throw e; setStatus(l, "skipped", { reason: e.message.slice(0, 160) }); }
      await pace(0.8);
    }
    const minScore = niche.audit.shortlistMinScore ?? 25;
    const ranked = leads.filter((l) => l.status === "audited").sort((a, b) => b.audit.score - a.audit.score);
    const shortlist = ranked.filter((l) => l.audit.score >= minScore && l.email).slice(0, settings.audit.shortlist);
    for (const l of ranked) if (!shortlist.includes(l)) setStatus(l, "skipped", { reason: !l.email ? "No public email address on the site" : l.audit.score < minScore ? "Website is already decent" : "Not in the shortlist this run" });
    shortlist.forEach((l) => setStatus(l, "shortlisted"));
    run.counts.shortlisted = shortlist.length; save();
    office.say("auditor", shortlist.length ? `Shortlisted the ${shortlist.length} weakest sites` : "Every site looks decent, nothing to fix");
    log("auditor", `Shortlist: ${shortlist.map((l) => l.name).join(", ") || "none"}`, { run: run.id });
    await pace();
    office.idle("auditor");

    // 3–6. per business: Knight ⇄ Snow Bell, Sherlock, Nemo
    if (demoMode && shortlist[0]) shortlist[0].demoSlip = true;
    for (const l of shortlist) {
      office.handoff("auditor", "developer", l.name);
      await pace(1.2);
      await buildAndCheck(run, niche, l);
      if (l.status !== "seo") continue;
      // 5. Sherlock
      office.handoff("checker", "seo", l.name);
      office.working("seo", `SEO note for ${l.name}`, l.name);
      await pace();
      l.seo = await sherlock.note(run, l); save();
      office.say("seo", `Old site misses: ${l.seo.points[0]}`);
      log("seo", `${l.name}: ${l.seo.points.join(" · ")}`, { lead: l.id });
      await pace(0.6);
      office.idle("seo");
      // 6. Nemo writes the email, then it stops for a human
      office.handoff("seo", "sender", l.name);
      office.working("sender", `Writing to ${l.name}`, l.name);
      await pace();
      const vars = writer.studioVars(l, { concept_url: `${base()}/c/${l.id}`, issues: l.seo.points.map((p) => "• " + p).join("\n") });
      const e = await writer.write(run, { role: "sender", kind: "first email", niche, lead: l, vars });
      queueEmail(l, "first", "sender", e);
      setStatus(l, "awaiting_approval");
      office.idle("sender");
      office.say("sender", `Email to ${l.name} is waiting for your approval ✉️`);
      log("sender", `Drafted the email to ${l.name}. Waiting for human approval.`, { lead: l.id });
      await pace(0.6);
    }
    finishRun(run, "done");
  } catch (e) {
    for (const r of ["finder", "auditor", "developer", "checker", "seo", "sender"]) office.idle(r);
    finishRun(run, e instanceof llm.CostCapError ? "stopped" : "error", e.message);
    log("system", `Run stopped: ${e.message}`, { run: run.id });
  }
}

async function buildAndCheck(run, niche, l) {
  let previous = null, issues = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    setStatus(l, "building", { rounds: round });
    office.working("developer", round === 1 ? `Building a concept for ${l.name}` : `Fixing ${issues.length} line${issues.length > 1 ? "s" : ""} for ${l.name} (round ${round})`, l.name);
    await pace();
    const { copy } = await knight.build(run, niche, l, { round, previous, issues });
    l.copy = copy; save();
    office.say("developer", round === 1 ? `Concept for ${l.name} done, over to ${name("checker")}` : `Fixed it. Round ${round}, please check again`);
    office.handoff("developer", "checker", l.name);
    await pace(1.2);
    office.idle("developer");
    setStatus(l, "checking");
    office.working("checker", `Fact-checking ${l.name} (round ${round})`, l.name);
    await pace();
    const res = await snowBell.check(run, niche, l, copy);
    (l.checks ||= []).push({ round, issues: res.issues, at: now() }); save();
    if (res.pass) {
      l.conceptHtml = knight.renderConcept(niche, l, copy);
      setStatus(l, "seo");
      office.say("checker", `Every line of ${l.name} is backed by a fact ✓`);
      log("checker", `${l.name}: passed fact-check in round ${round}`, { lead: l.id });
      office.idle("checker");
      return;
    }
    issues = res.issues; previous = copy;
    office.say("checker", `Sending back: "${issues[0].line.slice(0, 50)}" ✗ ${issues[0].problem.slice(0, 60)}`);
    log("checker", `${l.name}: round ${round} sent back to ${name("developer")}: ${issues.map((i) => `"${i.line}" (${i.problem})`).join("; ")}${l.demoSlip && round === 1 ? " [demo: Knight's first draft had a deliberate slip so you can see the check work]" : ""}`, { lead: l.id });
    if (round < MAX_ROUNDS) office.handoff("checker", "developer", `${l.name}: fix ${issues.length}`);
    await pace(1.2);
    office.idle("checker");
  }
  setStatus(l, "set_aside", { reason: `Still had unsupported lines after ${MAX_ROUNDS} rounds` });
  office.say("checker", `${l.name} set aside after ${MAX_ROUNDS} rounds`);
}

function finishRun(run, status, note) { run.status = status; run.note = note || null; run.finished = now(); save(); }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } }

// ── emails + approval inbox
function queueEmail(l, kind, role, { subject, body }) {
  const studio = loadStudio();
  const e = { id: id("m"), lead: l.id, kind, agent: role, direction: "out", to: l.facts?.email || l.email, from: `${studio.sender?.name || studio.name} <${settings.email.from || studio.sender?.email || "studio@example.com"}>`, subject, body, status: "awaiting_approval", created: now() };
  db.emails.push(e); save();
  return e;
}

export async function approveEmail(eid, edits = {}) {
  const e = getEmail(eid); if (!e || e.status !== "awaiting_approval") throw new Error("Nothing to approve");
  const l = getLead(e.lead);
  if (db.unsubscribed.includes(e.to)) { e.status = "rejected"; e.note = "Recipient unsubscribed"; save(); throw new Error("This address unsubscribed"); }
  if (typeof edits.subject === "string" && edits.subject.trim()) e.subject = edits.subject.slice(0, 200);
  if (typeof edits.body === "string" && edits.body.trim()) e.body = edits.body.slice(0, 10000);
  office.working(e.agent, `Sending to ${l.name}`, l.name);
  const r = await mail.send({ from: e.from, to: e.to, subject: e.subject, text: e.body, headers: { "List-Unsubscribe": `<mailto:${settings.email.from || "studio@example.com"}?subject=unsubscribe>` } });
  Object.assign(e, { status: "sent", sent_at: now(), delivery: r }); save();
  office.say(e.agent, `Approved! Sent to ${l.name} 📨`);
  log(e.agent, `Sent "${e.subject}" to ${l.name} (${r.deliveredTo})`, { lead: l.id });
  if (e.kind === "first") { setStatus(l, "sent", { emailedAt: now() }); office.handoff("sender", "inbox", l.name); }
  if (e.kind === "deposit") setStatus(l, "deposit_link_sent");
  if (e.kind === "followup") l.followups = (l.followups || 0) + 1;
  setTimeout(() => office.idle(e.agent), 2500);
  save();
  return e;
}
export function rejectEmail(eid) {
  const e = getEmail(eid); if (!e || e.status !== "awaiting_approval") throw new Error("Nothing to reject");
  e.status = "rejected"; save();
  const l = getLead(e.lead);
  if (e.kind === "first" && l) setStatus(l, "closed", { reason: "Email rejected by a human" });
  log(e.agent, `Email to ${l?.name} rejected by a human`, { lead: e.lead });
  return e;
}

// ── replies (demo: the reply box; you paste or type what the business wrote back)
export async function receiveReply(lid, text) {
  const l = getLead(lid); if (!l) throw new Error("Unknown business");
  if (!["sent", "deposit_link_sent", "replied"].includes(l.status)) throw new Error("This business hasn't been emailed yet");
  const niche = loadNiche(l.niche), run = db.runs.find((r) => r.id === l.run);
  db.emails.push({ id: id("m"), lead: l.id, kind: "reply", direction: "in", from: l.facts?.email || l.email, subject: "Re: your concept", body: String(text).slice(0, 5000), status: "received", created: now() });
  office.working("inbox", `Reading ${l.name}'s reply`, l.name);
  await pace(0.8);
  const r = await scrapper.read(run, l, text);
  setStatus(l, "replied", { intent: r.intent });
  log("inbox", `${l.name} replied: ${r.intent} (${r.summary})`, { lead: l.id });
  if (r.intent === "unsubscribe") {
    db.unsubscribed.push(l.facts?.email || l.email, hostOf(l.website)); setStatus(l, "unsubscribed");
    db.emails.filter((m) => m.lead === l.id && m.status === "awaiting_approval").forEach((m) => (m.status = "rejected"));
    office.say("inbox", `${l.name} unsubscribed. We won't email them again.`);
  } else if (r.intent === "not_interested") {
    setStatus(l, "closed", { reason: "Not interested" });
    office.say("inbox", `${l.name}: not interested. Closing it politely.`);
  } else if (r.intent === "interested") {
    office.say("inbox", `${l.name} wants it! Making a PayPal deposit link 💳`);
    const studio = loadStudio();
    const deposit = +((studio.conceptPrice * studio.depositPercent) / 100).toFixed(2);
    const order = await payments.createOrder({ amount: deposit, currency: studio.currency, description: `${studio.depositPercent}% deposit: website for ${l.name}`, referenceId: l.id, returnUrl: `${base()}/paypal/return`, cancelUrl: `${base()}/paypal/cancel?lead=${l.id}`, brandName: studio.name });
    db.payments.push({ id: id("p"), lead: l.id, type: "deposit", provider: payments.name, orderId: order.id, amount: deposit, currency: studio.currency, status: "created", approveUrl: order.approveUrl, created: now() });
    l.deposit = { orderId: order.id, amount: deposit, approveUrl: order.approveUrl };
    const vars = writer.studioVars(l, { checkout_url: order.approveUrl, concept_url: `${base()}/c/${l.id}` });
    queueEmail(l, "deposit", "inbox", await writer.write(run, { role: "inbox", kind: "deposit email", niche, lead: l, vars, context: `Their reply: ${text}` }));
    setStatus(l, "deposit_pending_approval");
    log("inbox", `Created PayPal order ${order.id} for the ${studio.depositPercent}% deposit; email waiting for approval`, { lead: l.id });
  } else {
    const vars = writer.studioVars(l, { concept_url: `${base()}/c/${l.id}`, their_message: String(text).slice(0, 600) });
    queueEmail(l, "answer", "inbox", await writer.write(run, { role: "inbox", kind: "reply to a question", niche, lead: l, vars, context: `Their message: ${text}` }));
    office.say("inbox", `${l.name} asked a question. Drafted an answer for approval.`);
  }
  setTimeout(() => office.idle("inbox"), 2500);
  save();
  return r;
}

// ── PayPal: deposit captured → Fluffy invoices the balance
export async function captureDeposit(orderId) {
  const p = db.payments.find((x) => x.orderId === orderId && x.type === "deposit");
  if (!p) throw new Error("Unknown order");
  if (p.status === "captured") return p;
  let cap;
  try { cap = await payments.captureOrder(orderId); }
  catch (e) { const o = await payments.getOrder(orderId).catch(() => null); if (o?.status === "COMPLETED") cap = { status: "COMPLETED", captureId: o.capture?.id }; else throw e; }
  if (cap.status !== "COMPLETED") throw new Error("Payment not completed: " + cap.status);
  await depositConfirmed(p, cap.captureId);
  return p;
}

const inFlight = new Set();
export async function depositConfirmed(p, captureId) {
  if (p.status === "captured" || inFlight.has(p.id)) return;
  inFlight.add(p.id);
  try {
    Object.assign(p, { status: "captured", captureId, paid_at: now() });
    const l = getLead(p.lead);
    l.deposit = { ...l.deposit, captureId, paid_at: now() };
    setStatus(l, "deposit_paid");
    office.money("inbox", `Deposit paid! ${writer.studioVars(l).deposit}`);
    log("inbox", `💰 ${isSimulated() ? "Simulated payment" : "PayPal"} confirmed the deposit for ${l.name} (capture ${captureId})`, { lead: l.id });
    office.handoff("inbox", "followup", l.name);
    await pace(1.5);
    if (!enabled("followup")) return;
    office.working("followup", `Creating the PayPal invoice for ${l.name}`, l.name);
    const run = db.runs.find((r) => r.id === l.run);
    try {
      const inv = await fluffy.invoiceBalance(run, l);
      db.payments.push({ id: id("p"), lead: l.id, type: "invoice", provider: payments.name, invoiceId: inv.invoiceId, number: inv.number, amount: inv.amount, currency: inv.currency, status: "sent", payerUrl: inv.payerUrl, created: now() });
      l.invoice = { id: inv.invoiceId, number: inv.number, amount: inv.amount, payerUrl: inv.payerUrl, calls: inv.calls, official: inv.official, sent_at: now() };
      setStatus(l, "invoice_sent");
      office.say("followup", `Invoice ${inv.number || ""} for the balance sent via PayPal 🧾`);
      log("followup", `Agent tool calls: ${inv.calls.map((c) => c.tool).join(" → ")}${inv.official ? " (PayPal Agent Toolkit)" : ""}. Invoice ${inv.invoiceId} sent for ${writer.studioVars(l).balance}.`, { lead: l.id });
    } catch (e) {
      office.say("followup", `Couldn't create the invoice: ${e.message.slice(0, 80)}`);
      log("followup", `Invoice failed for ${l.name}: ${e.message}`, { lead: l.id });
    }
    setTimeout(() => office.idle("followup"), 3000);
  } finally { inFlight.delete(p.id); save(); }
}

export async function invoicePaid(invoiceId) {
  const p = db.payments.find((x) => x.invoiceId === invoiceId && x.type === "invoice");
  if (!p || p.status === "paid") return p;
  Object.assign(p, { status: "paid", paid_at: now() });
  const l = getLead(p.lead);
  setStatus(l, "paid");
  db.emails.filter((m) => m.lead === l.id && m.kind === "followup" && m.status === "awaiting_approval").forEach((m) => (m.status = "rejected"));
  office.money("followup", `Invoice paid! ${writer.studioVars(l).balance} 🎉`);
  log("followup", `💰 ${l.name} paid the invoice. Time to build the real site!`, { lead: l.id });
  save();
  return p;
}

// Check unpaid invoices (for setups without webhooks) and draft follow-ups when they're overdue.
export async function sweepInvoices() {
  const studio = loadStudio();
  for (const p of db.payments.filter((x) => x.type === "invoice" && x.status === "sent")) {
    const l = getLead(p.lead); if (!l) continue;
    try { const inv = await payments.getInvoice(p.invoiceId); if (["PAID", "MARKED_AS_PAID"].includes(inv.status)) { await invoicePaid(p.invoiceId); continue; } } catch { /* keep going */ }
    const pending = db.emails.some((m) => m.lead === l.id && m.kind === "followup" && m.status === "awaiting_approval");
    const last = Date.parse(l.lastFollowupDraft || l.invoice?.sent_at || p.created);
    if (pending || (l.followups || 0) >= studio.safety.maxFollowups || Date.now() - last < settings.followupAfterMinutes * 60000 || !enabled("followup")) continue;
    l.lastFollowupDraft = now();
    const niche = loadNiche(l.niche), run = db.runs.find((r) => r.id === l.run);
    office.working("followup", `Drafting a friendly reminder for ${l.name}`, l.name);
    const vars = writer.studioVars(l, { invoice_url: p.payerUrl || "", invoice_number: p.number || "" });
    queueEmail(l, "followup", "followup", await writer.write(run, { role: "followup", kind: "follow-up", niche, lead: l, vars }));
    office.say("followup", `Drafted reminder #${(l.followups || 0) + 1} for ${l.name}`);
    setTimeout(() => office.idle("followup"), 2500);
    save();
  }
}

export function resetDemo() {
  db.runs.length = 0; db.leads.length = 0; db.emails.length = 0; db.payments.length = 0; db.log.length = 0; db.unsubscribed.length = 0; db.sim = { orders: {}, invoices: {} };
  save();
}
export { isSimulated };
