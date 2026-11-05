// Siteo Office dashboard: sidebar views (Office, Overview, Approvals, Projects, Inbox, Money, Salary, Activity,
// Settings, Connections), a details drawer, AG Grid tables, and a dark/light theme.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let STATUS = null, STATE = null, office = null, projectsGrid = null, paymentsGrid = null;
const ROLES = ["finder", "auditor", "developer", "checker", "seo", "sender", "inbox", "followup"];

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", "x-admin-token": ls.get("so.admin") || "", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { const t = prompt("This office is locked. Enter the admin token:"); if (t) { ls.set("so.admin", t); return api(path, opts); } }
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
function toast(msg, cls = "") { const el = document.createElement("div"); el.className = "toast " + cls; el.textContent = msg; $("#toasts").appendChild(el); setTimeout(() => el.remove(), cls ? 6000 : 3800); }
function coinRain() { const r = $("#rain"); for (let i = 0; i < 28; i++) { const s = document.createElement("span"); s.textContent = ["💰", "🪙", "💵"][i % 3]; s.style.left = Math.random() * 100 + "vw"; s.style.animationDelay = Math.random() * 0.9 + "s"; r.appendChild(s); setTimeout(() => s.remove(), 4000); } }
const agent = (role) => STATUS?.team?.[role] || { name: role, role: "", color: "#999" };
const cur = () => STATUS?.studio?.currency || "USD";
const money = (n) => (n == null ? "–" : `${cur()} ${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`);

// ── theme
function setTheme(t) {
  document.documentElement.dataset.theme = t; ls.set("so.theme", t);
  $("#theme-btn").textContent = t === "dark" ? "☀️" : "🌙";
  $$(".grid-box").forEach((g) => { g.classList.toggle("ag-theme-quartz-dark", t === "dark"); g.classList.toggle("ag-theme-quartz", t !== "dark"); });
}
$("#theme-btn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

// ── views
const VIEWS = ["office", "overview", "approvals", "projects", "inbox", "money", "salary", "activity", "settings", "connections"];
function show(view) {
  if (!VIEWS.includes(view)) view = "office";
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === "view-" + view));
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  $("#side").classList.remove("open"); $("#menu-btn").setAttribute("aria-expanded", "false");
  if (view === "settings") renderTeach();
  if (STATE) render();
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => show(location.hash.slice(1)));
$("#menu-btn").onclick = () => { const o = $("#side").classList.toggle("open"); $("#menu-btn").setAttribute("aria-expanded", String(o)); };
const go = (view) => { if (location.hash === "#" + view) show(view); else location.hash = view; };

// ── boot
async function boot() {
  setTheme(document.documentElement.dataset.theme || "dark");
  STATUS = await api("/api/status");
  const s = STATUS.studio;
  document.title = `${s.name} · Siteo Office`;
  $("#studio-name").textContent = s.name;
  if (s.logo) $("#logo").src = s.logo;
  if (!s.credit) $("#credit").textContent = "Open source (MIT)";
  const mode = $("#mode-chip");
  mode.textContent = STATUS.demo ? (STATUS.aiMode === "replay" ? "DEMO · recorded AI run" : "DEMO · fictional data") : "LIVE · " + (STATUS.aiMode === "live" ? "Claude" : STATUS.aiMode);
  mode.classList.toggle("live", !STATUS.demo);
  mode.title = STATUS.demo ? "Fictional businesses" : "Real businesses";
  $("#niche").innerHTML = `<option value="">Auto</option>` + STATUS.niches.map((n) => `<option value="${esc(n.id)}">${esc(n.label)}</option>`).join("");
  $("#q").placeholder = STATUS.niches[0]?.example || "dentists in Galway";
  const aiLine = STATUS.aiMode === "replay" ? "<b>Demo: replaying a recorded run of the real AI agents</b> (Claude), step by step, for $0." : STATUS.aiMode === "rules" ? "The agents use their rule-based paths (no AI recording in this copy)." : "";
  $("#run-hint").innerHTML = STATUS.publicDemo
    ? `${aiLine} The businesses are <b>fictional</b>; real searches and live AI are off on this hosted copy. PayPal Sandbox payments are real Sandbox calls. Run your own copy with your keys for real searches.`
    : STATUS.demo ? `Demo mode on <b>fictional</b> businesses in a made-up town. ${aiLine} Add your keys in <code>.env</code> for real runs.`
    : `Live: real businesses via ${esc(STATUS.search)}, AI by Claude (cap $${STATUS.maxUsdPerRun}/run). Nothing is emailed without your approval.`;
  $("#inbox-intro").innerHTML = STATUS.email === "test inbox"
    ? "The <b>test inbox</b>: approved emails land here instead of being sent. Play the business owner: open the links, then reply."
    : `Emails go out by SMTP. Paste a business's reply to hand it to ${esc(agent("inbox").name)}.`;
  $("#buyer-hint").innerHTML = STATUS.payments.startsWith("paypal-sandbox")
    ? `PayPal <b>Sandbox</b>: pay with a sandbox test buyer, never a real card.${STATUS.buyerHint ? " " + esc(STATUS.buyerHint) : ""}`
    : STATUS.payments.startsWith("paypal") ? "PayPal <b>live</b>: real money." : "Payments are <b>simulated</b> (no PayPal keys). Add PayPal Sandbox keys for real Checkout and Invoicing.";
  renderSettings(); renderConnections();
  show(location.hash.slice(1) || "office");
  mountOffice(); initGrids();
  await refresh();
  setInterval(refresh, 2500);
  const p = new URLSearchParams(location.search);
  if (p.get("paid")) { toast("PayPal confirmed the deposit 💰", "money"); coinRain(); history.replaceState(null, "", "/#money"); show("money"); }
  if (p.get("invoicePaid")) { toast("Invoice paid 🎉", "money"); coinRain(); history.replaceState(null, "", "/#money"); show("money"); }
}

async function mountOffice() {
  try {
    const mod = await import("/office.js");
    mod.configureOffice({ team: STATUS.team, people: STATUS.studio.people || {}, brand: { sign: STATUS.studio.officeSign || STATUS.studio.name.toUpperCase().slice(0, 14) } });
    office = mod.mountOffice($("#office"), {
      getState: () => fetch("/api/office").then((r) => r.json()),
      onSelectAgent: (a) => { office.focusAgent(a.id, 2.8); toast(`${a.name} · ${a.role}${a.task ? ": " + a.task : ""}`); },
      onSelectManager: () => go("approvals"),
      onSelectFounder: () => office.focusFounder(2.6),
      onSelectMeeting: () => {},
      onMoney: (e) => { toast(e.text, "money"); coinRain(); },
      pollMs: 1500,
      debug: window.__soDebug,
    });
    $("#office-loading").remove();
    $("#view-reset").onclick = () => office.resetView();
  } catch (e) { $("#office-loading").textContent = "The 3D office couldn't load (" + e.message + "). Everything else still works."; }
}

// ── data
let lastCounts = {};
async function refresh() {
  try { STATE = await api("/api/state"); } catch { return; }
  for (const [k, v] of Object.entries(STATE.counts)) { const el = $(`.funnel [data-stage="${k}"]`); if (!el) continue; if (lastCounts[k] != null && v > lastCounts[k]) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); } el.querySelector("b").textContent = v; }
  lastCounts = STATE.counts;
  $("#n-approvals").textContent = STATE.pending || "";
  $("#n-projects").textContent = STATE.leads.length || "";
  $("#n-inbox").textContent = STATE.emails.filter((e) => e.direction === "in").length || "";
  const busy = STATE.runs.some((r) => ["queued", "running"].includes(r.status));
  $("#live-dot").className = "dot " + (busy ? "busy" : "on");
  $("#live-text").textContent = busy ? "Autopilot running · team at work" : STATE.pending ? `Waiting for you · ${STATE.pending} to approve` : "Office open · cats napping";
  render();
}
function render() {
  const v = $(".view.on")?.id.replace("view-", "");
  renderGrids();
  ({ overview: renderOverview, approvals: renderApprovals, inbox: renderInbox, money: renderMoney, salary: renderSalary, activity: renderActivity }[v] || (() => {}))();
  if (drawerLead) renderDrawer(drawerLead);
}
// only re-render a list when it changed and the user isn't typing in it
function put(sel, html) { const el = $(sel); if (!el || el.dataset.h === html) return; if (el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; el.dataset.h = html; el.innerHTML = html; }
const leadById = (id) => STATE.leads.find((l) => l.id === id);
const STATUS_LABEL = { found: "Found", audited: "Audited", skipped: "Skipped", shortlisted: "Shortlisted", building: "Building", checking: "Fact-checking", set_aside: "Set aside", seo: "SEO note", awaiting_approval: "Waiting for approval", sent: "Emailed", replied: "Replied", deposit_pending_approval: "Deposit email to approve", deposit_link_sent: "Deposit link sent", deposit_paid: "Deposit paid", invoice_sent: "Invoice sent", paid: "Paid", closed: "Closed", unsubscribed: "Unsubscribed", created: "Created", captured: "Captured", rejected: "Rejected" };
const pillCls = (s) => (["paid", "deposit_paid", "invoice_sent", "captured"].includes(s) ? "good" : ["set_aside", "closed", "unsubscribed", "skipped", "rejected"].includes(s) ? "bad" : ["awaiting_approval", "deposit_pending_approval", "created", "sent", "deposit_link_sent"].includes(s) ? "acc" : "");
const pill = (s) => `<span class="pill ${pillCls(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
const fic = (l) => (l?.fictional ? ` <span class="pill fic">fictional</span>` : "");
const tile = (label, value, sub, glow) => `<div class="tile" style="--glow:${glow || "rgba(139,123,255,.3)"}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub || "")}</div></div>`;
const feedHtml = (items) => items.length ? items.map((x) => `<div class="it" style="--c:${x.agent === "system" ? "var(--mut)" : agent(x.agent).color}"><time>${ago(x.at)} ago</time><div><b>${esc(x.agent === "system" ? "System" : agent(x.agent).name)}</b> ${esc(x.text)}</div></div>`).join("") : `<div class="empty">Quiet office. Start a run.</div>`;

// ── overview
function renderOverview() {
  const c = STATE.counts, m = STATE.money;
  put("#ov-tiles", tile("Concepts", c.concept, "fact-checked sites built") + tile("Approved & sent", c.approved, `${STATE.pending} waiting for you`, "rgba(79,209,197,.3)") + tile("Deposits", money(m.deposits), `${c.deposit} paid via PayPal`, "rgba(255,196,107,.3)") + tile("Invoices paid", money(m.paid), `${money(m.invoiced)} invoiced`, "rgba(91,227,163,.3)"));
  const max = Math.max(1, ...Object.values(c));
  put("#ov-funnel", [["concept", "Concepts"], ["approved", "Approved & sent"], ["deposit", "Deposit paid"], ["invoice", "Invoice sent"], ["paid", "Paid"]].map(([k, l]) => `<div class="b"><span>${l}</span><div class="track"><i style="width:${(c[k] / max) * 100}%"></i></div><b>${c[k]}</b></div>`).join(""));
  put("#ov-feed", feedHtml(STATE.log.slice(0, 8)));
  put("#runs", STATE.runs.length ? STATE.runs.map((r) => `<div class="card"><h4>${esc(r.query)} <span class="pill ${r.status === "done" ? "good" : r.status === "running" ? "acc" : r.status === "queued" ? "" : "bad"}">${esc(r.status)}</span>${r.demo ? ' <span class="pill fic">demo</span>' : ""}</h4><div class="meta">${esc(r.niche)} · ${esc(r.town)} · found ${r.counts?.found ?? 0}, shortlisted ${r.counts?.shortlisted ?? 0}${r.demo ? "" : ` · AI $${(r.cost_usd || 0).toFixed(3)}`} · ${ago(r.created)} ago${r.note ? `<br>${esc(r.note)}` : ""}</div></div>`).join("") : `<div class="empty">No runs yet. Go to the Office and start one.</div>`);
}

// ── approvals
function renderApprovals() {
  const pp = STATUS.studio.people || {}, mgr = pp.manager?.enabled === false ? null : pp.manager?.name;
  $("#approvals-sub").textContent = `${agent("sender").name} brings every email${mgr ? ` to ${mgr}'s desk` : ""}. Nothing is sent until ${pp.founder?.name && pp.founder.name !== "You" ? pp.founder.name + " approves" : "you approve"} it. Edit anything first.`;
  const list = STATE.emails.filter((e) => e.status === "awaiting_approval");
  put("#approvals", list.length ? list.map((e) => { const l = leadById(e.lead); return `<div class="card" data-email="${e.id}"><h4><span style="color:${agent(e.agent).color}">${esc(agent(e.agent).name)}</span> → ${esc(l?.name)}${fic(l)} <span class="pill acc">${esc(e.kind)}</span><span class="pill warn">waiting for ${esc(mgr || "you")}</span></h4><div class="meta">To: ${esc(e.to)}${l?.hasConcept ? ` · <a href="/c/${l.id}" target="_blank">view concept</a>` : ""} · <a href="#" data-open="${e.lead}">project details</a></div><input class="subj" value="${esc(e.subject)}" aria-label="Subject"><textarea class="txt" aria-label="Email body">${esc(e.body)}</textarea><div class="acts"><button class="btn good small" data-act="approve">Approve &amp; send</button><button class="btn small ghost" data-act="reject">Skip</button></div></div>`; }).join("")
    : `<div class="panel empty">Nothing waiting. When ${esc(agent("sender").name)} writes an email, it stops here for you.</div>`);
}
$("#approvals").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b) return; const card = b.closest("[data-email]"); b.disabled = true;
  try {
    if (b.dataset.act === "approve") { await api(`/api/emails/${card.dataset.email}/approve`, { method: "POST", body: { subject: $(".subj", card).value, body: $(".txt", card).value } }); toast("Approved and sent ✉️"); }
    else { await api(`/api/emails/${card.dataset.email}/reject`, { method: "POST" }); toast("Skipped. Nothing was sent."); }
    card.remove(); $("#approvals").dataset.h = ""; refresh();
  } catch (e) { toast(e.message); b.disabled = false; }
});

// ── inbox
function renderInbox() {
  const leads = STATE.leads.filter((l) => STATE.emails.some((e) => e.lead === l.id && (e.status === "sent" || e.direction === "in")));
  put("#inbox", leads.length ? leads.map((l) => {
    const msgs = STATE.emails.filter((e) => e.lead === l.id && (e.status === "sent" || e.direction === "in")).slice().reverse();
    const canReply = ["sent", "deposit_link_sent", "replied"].includes(l.status);
    return `<div class="card" data-lead="${l.id}"><h4>${esc(l.name)}${fic(l)} ${pill(l.status)}</h4>${msgs.map((m) => `<div class="mail"><b>${m.direction === "in" ? "↩ From " + esc(l.name) : "→ " + esc(m.subject)}</b>${m.direction === "in" ? "" : `<span class="muted"> · to ${esc(m.to)}</span>`}\n${linkify(m.body)}</div>`).join("")}
    ${canReply ? `<div class="quick"><button data-r="Yes, I want it! Let's go ahead.">“Yes, I want it”</button><button data-r="Looks nice. How much would it cost and how long does it take?">“How much?”</button><button data-r="No thanks, we're happy with our current site.">“No thanks”</button><button data-r="Please unsubscribe me.">“Unsubscribe”</button></div><div class="row mt"><input class="reply" placeholder="Or type a reply as the business owner…"><button class="btn small" data-act="send">Reply</button></div>` : ""}</div>`;
  }).join("") : `<div class="panel empty">Approved emails appear here. In demo mode, you play the business owner and reply.</div>`);
}
$("#inbox").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button"); if (!b || !b.closest("[data-lead]")) return; const card = b.closest("[data-lead]");
  const text = b.dataset.r || $(".reply", card)?.value; if (!text?.trim()) return;
  b.disabled = true;
  try { const r = await api(`/api/leads/${card.dataset.lead}/reply`, { method: "POST", body: { text } }); toast(`${agent("inbox").name}: ${r.summary}`); $("#inbox").dataset.h = ""; refresh(); if (r.intent === "interested" || r.intent === "question") setTimeout(() => go("approvals"), 900); }
  catch (e) { toast(e.message); b.disabled = false; }
});

// ── money
function renderMoney() {
  const m = STATE.money, open = Math.max(0, m.invoiced - m.paid);
  put("#money-tiles", tile("Deposits captured", money(m.deposits), "PayPal Checkout", "rgba(255,196,107,.3)") + tile("Invoiced", money(m.invoiced), "PayPal Invoicing") + tile("Invoices paid", money(m.paid), "confirmed by PayPal", "rgba(91,227,163,.3)") + tile("Still open", money(open), `${STATE.emails.filter((e) => e.kind === "followup" && e.status === "awaiting_approval").length} reminders to approve`, "rgba(255,122,133,.3)"));
  const payable = STATE.payments.filter((p) => !["captured", "paid"].includes(p.status) && (p.type === "deposit" ? p.approveUrl : p.payerUrl));
  put("#payments", payable.map((p) => { const l = leadById(p.lead); return `<div class="card"><h4>${p.type === "deposit" ? "💳 Deposit" : "🧾 Invoice " + esc(p.number || "")} · ${esc(l?.name)}${fic(l)} ${pill(p.status)}</h4><div class="meta">${money(p.amount)} · ${esc(p.provider)}</div><div class="acts"><a class="btn pp small" href="${esc(p.type === "deposit" ? p.approveUrl : p.payerUrl)}" target="_blank" rel="noopener">${p.type === "deposit" ? "Pay deposit as the customer" : "Pay invoice as the customer"}</a></div></div>`; }).join(""));
}
$("#check-btn").onclick = async () => { try { await api("/api/payments/check", { method: "POST" }); toast("Checked PayPal for paid invoices"); refresh(); } catch (e) { toast(e.message); } };

// ── salary
function renderSalary() {
  const sal = STATE.salary || {}, replay = STATUS.aiMode === "replay";
  const rows = ROLES.map((r) => ({ r, ...(sal[r] || {}) }));
  const calls = (x) => (x.calls || 0) + (x.replayedCalls || 0), usd = (x) => (x.usd || 0) + (x.replayedUsd || 0);
  const tot = rows.reduce((a, x) => ({ calls: a.calls + calls(x), usd: a.usd + usd(x), tin: a.tin + (x.in || 0), tout: a.tout + (x.out || 0) }), { calls: 0, usd: 0, tin: 0, tout: 0 });
  const concepts = Math.max(1, STATE.counts.concept);
  $("#salary-sub").innerHTML = replay ? "What each cat's AI work cost <b>when the demo run was recorded</b> (replayed now for $0: <span class='pill fic'>demo</span>)." : STATUS.aiMode === "rules" ? "Rule-based demo: no AI calls, so no salaries yet. Record a real run or add an AI key." : "What each cat costs in AI: calls, tokens and dollars (at your configured per-token prices).";
  put("#salary-tiles", tile("AI calls", tot.calls, replay ? "replayed from the recording" : "this office") + tile("AI cost", "$" + tot.usd.toFixed(3), replay ? "recorded cost, $0 now" : `cap $${STATUS.maxUsdPerRun} per run`, "rgba(255,196,107,.3)") + tile("Per concept", "$" + (tot.usd / concepts).toFixed(3), `${STATE.counts.concept} concepts`, "rgba(79,209,197,.3)") + tile("Tokens", Math.round((tot.tin + tot.tout) / 1000) + "k", replay ? "live calls only" : `${Math.round(tot.tin / 1000)}k in · ${Math.round(tot.tout / 1000)}k out`, "rgba(91,227,163,.3)"));
  put("#salary-table", `<thead><tr><th>Cat</th><th>Job</th><th class="num">Calls</th><th class="num">Tokens in</th><th class="num">Tokens out</th><th class="num">Cost</th></tr></thead><tbody>${rows.map((x) => { const a = agent(x.r); return `<tr><td><span class="catdot" style="--c:${esc(a.color)}"></span>${esc(a.name)}</td><td class="muted">${esc(a.role)}</td><td class="num">${calls(x)}</td><td class="num">${(x.in || 0).toLocaleString()}</td><td class="num">${(x.out || 0).toLocaleString()}</td><td class="num">$${usd(x).toFixed(4)}${x.replayedCalls ? ' <span class="pill fic">demo</span>' : ""}</td></tr>`; }).join("")}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${tot.calls}</td><td class="num">${tot.tin.toLocaleString()}</td><td class="num">${tot.tout.toLocaleString()}</td><td class="num">$${tot.usd.toFixed(4)}</td></tr></tfoot>`);
}

function renderActivity() { put("#activity", feedHtml(STATE.log)); }

// ── settings + connections (from /api/status; values come from the config files)
function renderSettings() {
  const s = STATUS.studio, pp = (s.people || {});
  $("#set-studio").innerHTML = `<h2>Studio <small class="muted">· <code>studio.config.json</code></small></h2><dl class="kv"><dt>Name</dt><dd>${esc(s.name)}</dd><dt>Website</dt><dd>${esc(s.website || "–")}</dd><dt>Sender</dt><dd>${esc(s.sender?.name || "–")}</dd><dt>Signature</dt><dd style="white-space:pre-line">${esc(s.sender?.signature || "–")}</dd><dt>Price</dt><dd>${money(s.conceptPrice)} · deposit ${esc(s.depositPercent)}%</dd><dt>Currency</dt><dd>${esc(s.currency)} · language ${esc(s.language || "en")}</dd><dt>Founder</dt><dd><span class="catdot" style="--c:${esc(pp.founder?.look?.accent || "#8b7bff")}"></span>${esc(pp.founder?.name || "You")} · ${esc(pp.founder?.role || pp.founder?.title || "Founder")}</dd><dt>Manager</dt><dd><span class="catdot" style="--c:${esc(pp.manager?.look?.accent || "#d7262c")}"></span>${esc(pp.manager?.name || "Muffy")} · ${esc(pp.manager?.role || "Approvals")}${pp.manager?.enabled === false ? " (off)" : ""}</dd><dt>Invoice terms</dt><dd>${esc(s.invoiceTerms || "–")}</dd><dt>Safety</dt><dd>Human approval always on · unsubscribe line ${s.safety?.unsubscribeLine ? "on" : "off"} · max ${esc(s.safety?.maxFollowups ?? 3)} reminders</dd><dt>Credit</dt><dd>${s.credit ? "“Built with Siteo Office” shown" : "hidden"}</dd></dl>`;
  $("#set-niches").innerHTML = `<h2>Niche packs <small class="muted">· <code>niches/&lt;id&gt;/</code></small></h2>${STATUS.niches.map((n) => `<div class="card mt"><h4>${esc(n.label)} <span class="pill">${esc(n.id)}</span></h4><div class="meta">Keywords: ${esc((n.keywords || []).join(", "))}<br>OSM tags: ${esc((n.osmTags || []).join(", "))}<br>Facts: ${esc((n.facts || []).join(", "))}<br>${n.forbidden} rules in <code>rules.md</code> · shortlist from weakness ${esc(n.shortlistMinScore)}</div></div>`).join("")}<p class="muted small">Add a niche: copy a folder, edit its 6 files (see docs/niche-packs.md).</p>`;
  $("#set-team").innerHTML = ROLES.map((r) => { const a = agent(r); return `<div class="card"><h4><span class="catdot" style="--c:${esc(a.color)}"></span>${esc(a.name)}${a.enabled === false ? ' <span class="pill bad">off</span>' : ""}</h4><div class="meta">${esc(a.role)}<br>${esc(a.pattern || "")} fur · ${esc(a.accessory || "")}<br><code>${esc(a.instructions || "")}</code></div></div>`; }).join("");
}
async function renderTeach() {
  const list = await api("/api/agents").catch(() => []);
  $("#teach").innerHTML = list.map((a) => `<div class="card" data-role="${a.role}"><h4 style="color:${esc(agent(a.role).color)}">${esc(a.name)} <span class="muted small">agents/${esc(a.file)}</span></h4><textarea aria-label="${esc(a.name)} instructions">${esc(a.text)}</textarea><div class="acts">${STATUS.publicDemo ? `<span class="muted small">Read-only on the hosted demo. Run your own copy to teach your agents.</span>` : `<button class="btn small good" data-act="save">Save</button>`}</div></div>`).join("");
}
$("#teach").addEventListener("click", async (ev) => { const b = ev.target.closest("button[data-act=save]"); if (!b) return; const card = b.closest("[data-role]"); try { await api(`/api/agents/${card.dataset.role}`, { method: "PUT", body: { text: $("textarea", card).value } }); toast("Saved. Used from the next run."); } catch (e) { toast(e.message); } });
function renderConnections() {
  const k = STATUS.keys || {};
  const st = (ok, on = "Connected", off = "Not set") => `<span class="pill ${ok ? "good" : "warn"}">${ok ? on : off}</span>`;
  const card = (ico, name, status, lines) => `<div class="panel conn"><div class="top"><h2><span class="ico">${ico}</span>${esc(name)}</h2>${status}</div>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
  $("#conns").innerHTML = [
    card("🧠", "Claude (AI)", STATUS.aiMode === "live" || STATUS.aiMode === "record" ? st(true, "Live") : STATUS.aiMode === "replay" ? st(true, "Replaying recording") : st(false, "", "Rule-based"),
      [`Key ${k.anthropic ? "set" : "not set"} · model ${k.model ? "set" : "not set"} (<code>ANTHROPIC_API_KEY</code>, <code>CLAUDE_MODEL</code>)`, STATUS.publicDemo ? "Off on the hosted demo by design." : `Cost cap $${STATUS.maxUsdPerRun} per run.`]),
    card("💳", "PayPal", k.paypal ? st(true, k.paypalEnv === "live" ? "Live" : "Sandbox") : st(false, "", "Simulated"),
      [`Orders v2 (deposit) · Invoicing v2 (balance) · <code>PAYPAL_CLIENT_ID</code> / <code>PAYPAL_CLIENT_SECRET</code>`, `Webhook verification ${k.paypalWebhook ? "on" : "off"} (<code>PAYPAL_WEBHOOK_ID</code>) · Agent Toolkit ${k.agentToolkit ? "on" : "off"}`]),
    card("🔎", "Business search", STATUS.demo ? st(true, "Demo data") : st(true, STATUS.searchProvider),
      [`Provider: <b>${esc(STATUS.demo ? "fictional demo businesses" : STATUS.searchProvider)}</b> (<code>SEARCH_PROVIDER</code> = osm · google · apify)`, `Google Places key ${k.google ? "set" : "not set"} · Apify token ${k.apify ? "set" : "not set"} · PageSpeed key ${k.pagespeed ? "set" : "optional"}`]),
    card("✉️", "Email", st(true, STATUS.email === "smtp" ? "SMTP" : "Test inbox"),
      [STATUS.email === "smtp" ? "Approved emails are sent through your SMTP server." : "Approved emails stay in the built-in test inbox. Set <code>EMAIL_PROVIDER=smtp</code> and <code>SMTP_*</code> to send for real.", "A human approves every email; each one carries an unsubscribe line."]),
    card("🔐", "Admin lock", k.admin ? st(true, "On") : st(false, "", "Off"), [k.admin ? "Actions need the admin token." : "Anyone with the URL can use this office. Set <code>ADMIN_TOKEN</code> before adding real keys to a public deployment."]),
    card("☁️", "Hosting", st(true, STATUS.publicDemo ? "Public demo" : "Self-hosted"), [STATUS.publicDemo ? "<code>PUBLIC_DEMO=true</code>: fictional data, live AI and searches off, PayPal Sandbox only." : "Your own instance. See docs/deployment.md for Render and other hosts."]),
  ].join("");
}

// ── AG Grid: Projects + Payments
function initGrids() {
  if (!window.agGrid) { $$(".grid-box").forEach((g) => (g.innerHTML = `<p class="empty">Tables couldn't load (AG Grid CDN unreachable).</p>`)); return; }
  setTheme(document.documentElement.dataset.theme);
  const pillEl = (text, cls) => { const el = document.createElement("span"); el.className = "pill " + cls; el.textContent = text; return el; };
  const base = { defaultColDef: { sortable: true, filter: true, floatingFilter: true, resizable: true, minWidth: 90, enableCellChangeFlash: true }, animateRows: true, getRowId: (p) => p.data.id, rowData: [], rowHeight: 46 };
  projectsGrid = agGrid.createGrid($("#projects-grid"), {
    ...base,
    overlayNoRowsTemplate: "<span>No projects yet. Start a run in the Office.</span>",
    columnDefs: [
      { field: "name", headerName: "Business", flex: 2, minWidth: 300, pinned: "left", cellRenderer: (p) => { const d = document.createElement("span"); d.textContent = p.value; if (p.data.fictional) { d.append(" "); d.appendChild(pillEl("fictional", "fic")); } return d; } },
      { field: "statusLabel", headerName: "Stage", flex: 1.2, minWidth: 170, cellRenderer: (p) => pillEl(p.value, pillCls(p.data.status)) },
      { field: "score", headerName: "Weakness", width: 125, filter: "agNumberColumnFilter", cellRenderer: (p) => { if (p.value == null) return ""; const d = document.createElement("span"); d.textContent = p.value; const b = document.createElement("i"); b.className = "bar"; b.style.width = Math.round(p.value * 0.5) + "px"; d.appendChild(b); return d; } },
      { field: "rounds", headerName: "Snow Bell rounds", width: 160, filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value ? `${p.value}${p.data.sentBack ? ` (${p.data.sentBack} sent back)` : ""}` : "") },
      { field: "deposit", headerName: "Deposit", width: 130, cellRenderer: (p) => (p.value ? pillEl(STATUS_LABEL[p.value] || p.value, pillCls(p.value)) : "") },
      { field: "depositAmount", headerName: "Deposit amt", width: 130, filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value == null ? "" : money(p.value)) },
      { field: "invoice", headerName: "Invoice", width: 120, cellRenderer: (p) => (p.value ? pillEl(STATUS_LABEL[p.value] || p.value, pillCls(p.value)) : "") },
      { field: "invoiceAmount", headerName: "Invoice amt", width: 130, filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value == null ? "" : money(p.value)) },
      { field: "town", headerName: "Town", width: 120 },
      { field: "niche", headerName: "Niche", width: 115 },
      { field: "updated", headerName: "Updated", width: 120, sort: "desc", filter: false, valueFormatter: (p) => (p.value ? ago(p.value) + " ago" : "") },
    ],
    onRowClicked: (e) => openDrawer(e.data.id),
  });
  paymentsGrid = agGrid.createGrid($("#payments-grid"), {
    ...base,
    overlayNoRowsTemplate: "<span>No payments yet. They appear when a customer says yes.</span>",
    columnDefs: [
      { field: "kind", headerName: "Type", width: 120 },
      { field: "business", headerName: "Business", flex: 1.5, minWidth: 190 },
      { field: "amount", headerName: "Amount", width: 120, filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value) },
      { field: "status", headerName: "Status", width: 125, cellRenderer: (p) => pillEl(STATUS_LABEL[p.value] || p.value, pillCls(p.value)) },
      { field: "provider", headerName: "Via", width: 110 },
      { field: "ref", headerName: "PayPal ID", flex: 1, minWidth: 190 },
      { field: "created", headerName: "Created", width: 115, sort: "desc", filter: false, valueFormatter: (p) => (p.value ? ago(p.value) + " ago" : "") },
    ],
    onRowClicked: (e) => openDrawer(e.data.lead),
  });
  $("#projects-q").addEventListener("input", (e) => projectsGrid.setGridOption("quickFilterText", e.target.value));
}
function renderGrids() {
  if (!projectsGrid || !STATE) return;
  const pays = STATE.payments;
  projectsGrid.setGridOption("rowData", STATE.leads.map((l) => {
    const dep = pays.find((p) => p.lead === l.id && p.type === "deposit"), inv = pays.find((p) => p.lead === l.id && p.type === "invoice");
    return { id: l.id, name: l.name, fictional: l.fictional, status: l.status, statusLabel: STATUS_LABEL[l.status] || l.status, score: l.score, rounds: l.checks?.length || null, sentBack: (l.checks || []).filter((c) => c.issues.length).length,
      deposit: dep?.status || null, depositAmount: dep?.amount ?? null, invoice: inv?.status || null, invoiceAmount: inv?.amount ?? null, town: l.town, niche: l.niche, updated: l.updated };
  }));
  paymentsGrid.setGridOption("rowData", pays.map((p) => ({ id: p.id, lead: p.lead, kind: p.type === "deposit" ? "💳 Deposit" : "🧾 Invoice", business: leadById(p.lead)?.name || "", amount: p.amount, status: p.status, provider: p.provider, ref: p.orderId || p.invoiceId, created: p.created })));
}

// ── drawer: one project's full story
let drawerLead = null;
function openDrawer(id) { drawerLead = id; $("#drawer").classList.remove("hidden"); $("#drawer-body").dataset.h = ""; renderDrawer(id); }
function closeDrawer() { drawerLead = null; $("#drawer").classList.add("hidden"); }
$("#drawer-close").onclick = closeDrawer;
$("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") closeDrawer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
document.addEventListener("click", (e) => { const a = e.target.closest("[data-open]"); if (a) { e.preventDefault(); openDrawer(a.dataset.open); } });
function renderDrawer(id) {
  const l = leadById(id); if (!l) return;
  const emails = STATE.emails.filter((e) => e.lead === id).slice().reverse();
  const pays = STATE.payments.filter((p) => p.lead === id);
  const f = l.facts || {};
  put("#drawer-body", `<h1>${esc(l.name)}</h1><div class="row" style="flex-wrap:wrap">${pill(l.status)}${fic(l)}${l.score != null ? `<span class="pill">weakness ${l.score}/100</span>` : ""}${l.pagespeed != null ? `<span class="pill">PageSpeed ${l.pagespeed}</span>` : ""}</div>
  <div class="acts row mt" style="flex-wrap:wrap"><a class="btn small" href="${esc(l.website)}" target="_blank" rel="noopener">Old site ↗</a>${l.hasConcept ? `<a class="btn small primary" href="/c/${l.id}" target="_blank">Concept ↗</a>` : ""}</div>
  ${l.reason ? `<p class="muted">${esc(l.reason)}</p>` : ""}
  ${l.issues?.length ? `<h3>${esc(agent("auditor").name)}'s audit</h3><ul>${l.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
  ${Object.keys(f).length ? `<h3>Facts (the only source Knight may use)</h3><dl class="kv">${Object.entries(f).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(" · ") : v)}</dd>`).join("")}</dl>` : ""}
  ${(l.checks || []).length ? `<h3>${esc(agent("checker").name)}'s fact-check</h3>${l.checks.map((c) => `<div class="check ${c.issues.length ? "" : "pass"}"><b>Round ${c.round}:</b> ${c.issues.length ? `sent back to ${esc(agent("developer").name)}<ul>${c.issues.map((i) => `<li>“${esc(i.line)}”: ${esc(i.problem)}</li>`).join("")}</ul>` : "every line backed by a fact ✓"}</div>`).join("")}` : ""}
  ${l.seo ? `<h3>${esc(agent("seo").name)}'s SEO note</h3><ul>${l.seo.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
  ${emails.length ? `<h3>Emails</h3>${emails.map((m) => `<div class="mail"><b>${m.direction === "in" ? "↩ Reply" : esc(m.subject)}</b> <span class="pill ${pillCls(m.status)}">${esc(m.status.replace(/_/g, " "))}</span>\n${linkify(m.body)}</div>`).join("")}` : ""}
  ${pays.length ? `<h3>Payments</h3>${pays.map((p) => `<div class="card mt"><h4>${p.type === "deposit" ? "💳 Deposit" : "🧾 Invoice " + esc(p.number || "")} ${pill(p.status)}</h4><div class="meta">${money(p.amount)} · ${esc(p.provider)} · ${esc(p.orderId || p.invoiceId)}</div>${p.type === "invoice" && l.invoice?.calls ? `<div class="meta">${esc(agent("followup").name)}'s tool calls: ${l.invoice.calls.map((c) => `<code>${esc(c.tool)}</code>`).join(" → ")}${l.invoice.official ? " (PayPal Agent Toolkit)" : ""}</div>` : ""}</div>`).join("")}` : ""}`);
}

// ── run
$("#run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim() || $("#q").placeholder;
  $("#run-btn").disabled = true;
  try { const r = await api("/api/runs", { method: "POST", body: { query: q, niche: $("#niche").value } }); toast(`Run started: ${r.query}`); office?.resetView(); refresh(); }
  catch (err) { toast(err.message); }
  finally { setTimeout(() => ($("#run-btn").disabled = false), 1500); }
});
$("#reset-btn").onclick = async () => { if (!confirm("Clear all runs, emails and payments?")) return; await api("/api/demo/reset", { method: "POST" }); $$("[data-h]").forEach((el) => (el.dataset.h = "")); refresh(); toast("Fresh start"); };

boot().catch((e) => toast("Couldn't start: " + e.message));
