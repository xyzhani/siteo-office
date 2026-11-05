// Siteo Office dashboard: the 3D office + run form, approval inbox, test inbox, pipeline, money, activity, teach.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const ago = (t) => { const s = Math.round((Date.now() - Date.parse(t)) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
let STATUS = null, STATE = null, office = null;
const token = () => { try { return localStorage.getItem("so.admin") || ""; } catch { return ""; } };

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", "x-admin-token": token(), ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { const t = prompt("This office is locked. Enter the admin token:"); if (t) { try { localStorage.setItem("so.admin", t); } catch {} return api(path, opts); } }
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
function toast(msg, cls = "") { const el = document.createElement("div"); el.className = "toast " + cls; el.textContent = msg; $("#toasts").appendChild(el); setTimeout(() => el.remove(), cls ? 6000 : 3800); }
function coinRain() { const r = $("#rain"); for (let i = 0; i < 28; i++) { const s = document.createElement("span"); s.textContent = ["💰", "🪙", "💵"][i % 3]; s.style.left = Math.random() * 100 + "vw"; s.style.animationDelay = Math.random() * 0.9 + "s"; r.appendChild(s); setTimeout(() => s.remove(), 4000); } }
const agentName = (role) => STATUS?.team?.[role]?.name || role;
const agentColor = (role) => STATUS?.team?.[role]?.color || "#999";

// ── tabs
function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + name));
  if (name === "teach") renderTeach();
  if (matchMedia("(max-width:980px)").matches) $(".panel").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });
$("#pending-btn").onclick = () => showTab("approvals");

// ── boot
async function boot() {
  STATUS = await api("/api/status");
  const s = STATUS.studio;
  document.title = `${s.name} · Siteo Office`;
  $("#studio-name").textContent = s.name;
  if (s.logo) $("#logo").src = s.logo;
  if (s.colors?.primary) document.documentElement.style.setProperty("--primary", s.colors.primary);
  if (!s.credit) $("#credit").innerHTML = "Open source (MIT)";
  const b = [];
  b.push(STATUS.demo ? `<span class="badge demo" title="Fictional sample businesses; no AI key used">DEMO · fictional businesses</span>` : `<span class="badge live">LIVE · ${esc(STATUS.search)}</span>`);
  b.push(`<span class="badge pp">${STATUS.payments.startsWith("paypal") ? "PayPal " + esc(STATUS.payments.split("-")[1]) : "Payments simulated"}</span>`);
  b.push(`<span class="badge">Email: ${esc(STATUS.email)}</span>`);
  if (!STATUS.demo) b.push(`<span class="badge">AI cap $${STATUS.maxUsdPerRun}/run</span>`);
  $("#badges").innerHTML = b.join("");
  $("#niche").innerHTML = `<option value="">Auto</option>` + STATUS.niches.map((n) => `<option value="${esc(n.id)}">${esc(n.label)}</option>`).join("");
  $("#q").placeholder = STATUS.niches[0]?.example || "dentists in Galway";
  $("#run-hint").innerHTML = STATUS.publicDemo
    ? "This hosted demo replays the full pipeline on <b>fictional</b> sample businesses (real searches and AI are switched off here). PayPal Sandbox payments are real Sandbox calls. Run your own copy with your keys for real searches."
    : STATUS.demo
    ? "Demo mode: the team works on <b>fictional</b> sample businesses in a made-up town, with rule-based agents. Add your keys in <code>.env</code> for real runs."
    : `Live: real businesses via ${esc(STATUS.search)}. Nothing is emailed without your approval.`;
  document.querySelectorAll(".steps b[data-role]").forEach((el) => { el.textContent = agentName(el.dataset.role); el.style.setProperty("--c", agentColor(el.dataset.role)); });
  $("#inbox-intro").innerHTML = STATUS.email === "test inbox"
    ? "This is the <b>test inbox</b>: approved emails land here instead of being sent. Play the business owner: open the links, then write a reply."
    : "Emails are sent by SMTP. Paste the business's reply below to hand it to " + esc(agentName("inbox")) + ".";
  $("#buyer-hint").innerHTML = STATUS.payments.startsWith("paypal-sandbox")
    ? `PayPal <b>Sandbox</b>: pay with a sandbox test buyer account, never a real card.${STATUS.buyerHint ? " " + esc(STATUS.buyerHint) : ""}`
    : STATUS.payments.startsWith("paypal") ? "PayPal <b>live</b>: real money." : "Payments are <b>simulated</b> (no PayPal keys). Add PayPal Sandbox keys to use real Checkout and Invoicing.";
  mountOffice();
  initGrids();
  await refresh();
  setInterval(refresh, 2500);
  const p = new URLSearchParams(location.search);
  if (p.get("paid")) { toast("PayPal confirmed the deposit 💰", "money"); coinRain(); history.replaceState(null, "", "/"); showTab("money"); }
  if (p.get("invoicePaid")) { toast("Invoice paid 🎉", "money"); coinRain(); history.replaceState(null, "", "/"); showTab("money"); }
}

async function mountOffice() {
  try {
    const mod = await import("/office.js");
    const people = STATUS.studio.people || {};
    mod.configureOffice({ team: STATUS.team, people, brand: { sign: STATUS.studio.officeSign || STATUS.studio.name.toUpperCase().slice(0, 14) } });
    office = mod.mountOffice($("#office"), {
      getState: () => fetch("/api/office").then((r) => r.json()),
      onSelectAgent: (a) => { office.focusAgent(a.id, 2.8); toast(`${a.name} · ${a.role}${a.task ? ": " + a.task : ""}`); },
      onSelectManager: () => { office.focusManager(2.6); showTab("approvals"); },
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
  $("#pending-n").textContent = STATE.pending; $("#pending-btn").classList.toggle("has", STATE.pending > 0); $("#tab-pending").textContent = STATE.pending || "";
  renderRuns(); renderApprovals(); renderInbox(); renderPipeline(); renderMoney(); renderActivity(); renderGrids();
}

// ── AG Grid (Community): Projects + Payments tables, live via getRowId delta updates
let projectsGrid = null, paymentsGrid = null;
const pillCls = (s) => (["paid", "deposit_paid", "invoice_sent", "captured"].includes(s) ? "good" : ["set_aside", "closed", "unsubscribed", "skipped", "rejected"].includes(s) ? "bad" : ["awaiting_approval", "deposit_pending_approval", "created", "sent", "deposit_link_sent"].includes(s) ? "wait" : "");
const pillHtml = (text, cls) => { const el = document.createElement("span"); el.className = "st " + cls; el.textContent = text; return el; };
const money = (n) => (n == null ? "" : `${STATUS.studio.currency} ${Number(n).toFixed(2)}`);
function initGrids() {
  if (!window.agGrid) { $("#grids").innerHTML = `<p class="empty">Tables couldn't load (AG Grid CDN unreachable). The tabs above still show everything.</p>`; return; }
  const base = { defaultColDef: { sortable: true, filter: true, floatingFilter: true, resizable: true, minWidth: 90 }, animateRows: true, enableCellChangeFlash: true, getRowId: (p) => p.data.id, rowData: [], overlayNoRowsTemplate: "<span style='color:#646a7d'>Nothing yet. Start a run.</span>" };
  projectsGrid = agGrid.createGrid($("#projects-grid"), {
    ...base,
    columnDefs: [
      { field: "name", headerName: "Business", flex: 2, minWidth: 250, pinned: "left", cellRenderer: (p) => { const d = document.createElement("span"); d.textContent = p.value; if (p.data.fictional) d.appendChild(pillHtml("fictional", "fic")); return d; } },
      { field: "statusLabel", headerName: "Stage", flex: 1.3, minWidth: 150, cellRenderer: (p) => pillHtml(p.value, pillCls(p.data.status)) },
      { field: "score", headerName: "Weakness", width: 120, filter: "agNumberColumnFilter", cellRenderer: (p) => { if (p.value == null) return ""; const d = document.createElement("span"); d.textContent = p.value; const b = document.createElement("i"); b.className = "bar"; b.style.width = Math.round(p.value * 0.5) + "px"; d.appendChild(b); return d; } },
      { field: "rounds", headerName: "Snow Bell rounds", width: 140, filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value ? `${p.value}${p.data.sentBack ? ` (${p.data.sentBack} sent back)` : ""}` : "") },
      { field: "deposit", headerName: "Deposit", width: 140, cellRenderer: (p) => (p.value ? pillHtml(p.value, pillCls(p.value)) : "") },
      { field: "depositAmount", headerName: "Deposit $", width: 120, filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value) },
      { field: "invoice", headerName: "Invoice", width: 120, cellRenderer: (p) => (p.value ? pillHtml(p.value, pillCls(p.value)) : "") },
      { field: "invoiceAmount", headerName: "Invoice $", width: 120, filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value) },
      { field: "town", headerName: "Town", width: 120 },
      { field: "niche", headerName: "Niche", width: 110 },
      { field: "updated", headerName: "Updated", width: 120, sort: "desc", filter: false, valueFormatter: (p) => (p.value ? ago(p.value) + " ago" : "") },
    ],
    onRowClicked: (e) => { showTab("pipeline"); const el = $(`#pipeline [data-lead="${e.data.id}"]`); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } },
  });
  paymentsGrid = agGrid.createGrid($("#payments-grid"), {
    ...base,
    overlayNoRowsTemplate: "<span style='color:#646a7d'>No payments yet. They appear when a customer says yes.</span>",
    columnDefs: [
      { field: "kind", headerName: "Type", width: 110 },
      { field: "business", headerName: "Business", flex: 1.5, minWidth: 150 },
      { field: "amount", headerName: "Amount", width: 120, filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value) },
      { field: "status", headerName: "Status", width: 120, cellRenderer: (p) => pillHtml(p.value, pillCls(p.value)) },
      { field: "provider", headerName: "Via", width: 110 },
      { field: "ref", headerName: "PayPal ID", flex: 1, minWidth: 160 },
      { field: "created", headerName: "Created", width: 110, sort: "desc", filter: false, valueFormatter: (p) => (p.value ? ago(p.value) + " ago" : "") },
    ],
  });
  $("#projects-q").addEventListener("input", (e) => projectsGrid.setGridOption("quickFilterText", e.target.value));
}
function renderGrids() {
  if (!projectsGrid) return;
  const pays = STATE.payments;
  projectsGrid.setGridOption("rowData", STATE.leads.map((l) => {
    const dep = pays.find((p) => p.lead === l.id && p.type === "deposit"), inv = pays.find((p) => p.lead === l.id && p.type === "invoice");
    return { id: l.id, name: l.name, fictional: l.fictional, status: l.status, statusLabel: STATUS_LABEL[l.status] || l.status, score: l.score, rounds: l.checks?.length || null, sentBack: (l.checks || []).filter((c) => c.issues.length).length,
      deposit: dep?.status || null, depositAmount: dep?.amount ?? null, invoice: inv?.status || null, invoiceAmount: inv?.amount ?? null, town: l.town, niche: l.niche, updated: l.updated };
  }));
  paymentsGrid.setGridOption("rowData", pays.map((p) => ({ id: p.id, kind: p.type === "deposit" ? "💳 Deposit" : "🧾 Invoice", business: leadById(p.lead)?.name || "", amount: p.amount, status: p.status, provider: p.provider, ref: p.orderId || p.invoiceId, created: p.created })));
}
// only re-render a list when its content changed and the user isn't typing in it
function put(sel, html) { const el = $(sel); if (el.dataset.h === html) return; if (el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; el.dataset.h = html; el.innerHTML = html; }
const leadById = (id) => STATE.leads.find((l) => l.id === id);
const STATUS_LABEL = { found: "Found", audited: "Audited", skipped: "Skipped", shortlisted: "Shortlisted", building: "Building", checking: "Fact-checking", set_aside: "Set aside", seo: "SEO note", awaiting_approval: "Waiting for approval", sent: "Emailed", replied: "Replied", deposit_pending_approval: "Deposit email to approve", deposit_link_sent: "Deposit link sent", deposit_paid: "Deposit paid", invoice_sent: "Invoice sent", paid: "Paid", closed: "Closed", unsubscribed: "Unsubscribed" };
const statusPill = (s) => `<span class="pill ${["paid", "deposit_paid", "invoice_sent"].includes(s) ? "good" : ["set_aside", "closed", "unsubscribed", "skipped"].includes(s) ? "bad" : ["awaiting_approval", "deposit_pending_approval"].includes(s) ? "wait" : ""}">${esc(STATUS_LABEL[s] || s)}</span>`;
const fic = (l) => (l?.fictional ? ` <span class="pill fic">fictional</span>` : "");

function renderRuns() {
  put("#runs", STATE.runs.length ? STATE.runs.map((r) => `<div class="item"><h4>${esc(r.query)} <span class="pill">${esc(r.status)}</span>${r.demo ? ' <span class="pill fic">demo</span>' : ""}</h4><div class="meta">${esc(r.niche)} · ${esc(r.town)} · found ${r.counts?.found ?? 0}, shortlisted ${r.counts?.shortlisted ?? 0}${r.demo ? "" : ` · AI $${(r.cost_usd || 0).toFixed(3)}`} · ${ago(r.created)} ago${r.note ? `<br>${esc(r.note)}` : ""}</div></div>`).join("") : `<div class="empty">No runs yet. Type a niche and a town above, or just press Start for the demo.</div>`);
}
function renderApprovals() {
  const list = STATE.emails.filter((e) => e.status === "awaiting_approval");
  put("#approvals", list.length ? list.map((e) => { const l = leadById(e.lead); return `<div class="item" data-email="${e.id}"><h4>${esc(agentName(e.agent))} → ${esc(l?.name)}${fic(l)} <span class="pill wait">${esc(e.kind)}</span></h4><div class="meta">To: ${esc(e.to)}${l?.hasConcept ? ` · <a href="/c/${l.id}" target="_blank">view concept</a>` : ""}</div><input class="subj" value="${esc(e.subject)}" style="margin-top:8px"><textarea class="txt">${esc(e.body)}</textarea><div class="acts"><button class="ok-btn" data-act="approve">Approve &amp; send</button><button class="no-btn" data-act="reject">Reject</button></div></div>`; }).join("")
    : `<div class="empty">Nothing waiting. When ${esc(agentName("sender"))} writes an email, it stops here for you.</div>`);
}
$("#approvals").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b) return; const card = b.closest("[data-email]"); b.disabled = true;
  try {
    if (b.dataset.act === "approve") { await api(`/api/emails/${card.dataset.email}/approve`, { method: "POST", body: { subject: $(".subj", card).value, body: $(".txt", card).value } }); toast("Approved and sent ✉️"); }
    else { await api(`/api/emails/${card.dataset.email}/reject`, { method: "POST" }); toast("Rejected. Nothing was sent."); }
    card.remove(); $("#approvals").dataset.h = ""; refresh();
  } catch (e) { toast(e.message); b.disabled = false; }
});

function renderInbox() {
  const leads = STATE.leads.filter((l) => STATE.emails.some((e) => e.lead === l.id && (e.status === "sent" || e.direction === "in")));
  put("#inbox", leads.length ? leads.map((l) => {
    const msgs = STATE.emails.filter((e) => e.lead === l.id && (e.status === "sent" || e.direction === "in")).slice().reverse();
    const canReply = ["sent", "deposit_link_sent", "replied"].includes(l.status);
    return `<div class="item" data-lead="${l.id}"><h4>${esc(l.name)}${fic(l)} ${statusPill(l.status)}</h4>${msgs.map((m) => `<div class="body"><b>${m.direction === "in" ? "↩ From " + esc(l.name) : "→ " + esc(m.subject)}</b>${m.direction === "in" ? "" : `<span class="meta"> · to ${esc(m.to)}</span>`}\n${linkify(m.body)}</div>`).join("")}
    ${canReply ? `<div class="quick"><button data-r="Yes, I want it! Let's go ahead.">“Yes, I want it”</button><button data-r="Looks nice. How much would it cost and how long does it take?">“How much?”</button><button data-r="No thanks, we're happy with our current site.">“No thanks”</button><button data-r="Please unsubscribe me.">“Unsubscribe”</button></div><div class="row" style="margin-top:8px"><input class="reply" placeholder="Or type a reply as the business owner…"><button class="ghost" data-act="send">Reply</button></div>` : ""}</div>`;
  }).join("") : `<div class="empty">Approved emails appear here. In demo mode, you play the business owner and reply.</div>`);
}
$("#inbox").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button"); if (!b || !b.closest("[data-lead]")) return; const card = b.closest("[data-lead]");
  const text = b.dataset.r || $(".reply", card)?.value; if (!text?.trim()) return;
  b.disabled = true;
  try { const r = await api(`/api/leads/${card.dataset.lead}/reply`, { method: "POST", body: { text } }); toast(`${agentName("inbox")}: ${r.summary}`); $("#inbox").dataset.h = ""; refresh(); if (r.intent === "interested" || r.intent === "question") setTimeout(() => showTab("approvals"), 900); }
  catch (e) { toast(e.message); b.disabled = false; }
});

function renderPipeline() {
  put("#pipeline", STATE.leads.length ? STATE.leads.map((l) => {
    const last = l.checks?.at(-1);
    const checks = (l.checks || []).map((c) => `<div class="check ${c.issues.length ? "" : "pass"}"><b>${esc(agentName("checker"))}, round ${c.round}:</b> ${c.issues.length ? "sent back to " + esc(agentName("developer")) + "<ul class='issues'>" + c.issues.map((i) => `<li>“${esc(i.line)}”: ${esc(i.problem)}</li>`).join("") + "</ul>" : "every line backed by a fact ✓"}</div>`).join("");
    return `<div class="item" data-lead="${l.id}"><h4>${esc(l.name)}${fic(l)} ${statusPill(l.status)}</h4><div class="meta">${l.score != null ? `Weakness ${l.score}/100` : ""}${l.pagespeed != null ? ` · PageSpeed ${l.pagespeed}` : ""} · <a href="${esc(l.website)}" target="_blank" rel="noopener">old site</a>${l.hasConcept ? ` · <a href="/c/${l.id}" target="_blank">concept</a>` : ""}${l.reason ? `<br>${esc(l.reason)}` : ""}</div>${l.issues?.length ? `<ul class="issues">${l.issues.slice(0, 5).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}${checks}${l.seo ? `<div class="check pass"><b>${esc(agentName("seo"))}:</b> ${l.seo.map(esc).join(" · ")}</div>` : ""}</div>`;
    void last;
  }).join("") : `<div class="empty">The pipeline is empty. Start a run.</div>`);
}

function renderMoney() {
  const cur = STATUS.studio.currency, f = (n) => `${cur} ${Number(n || 0).toFixed(2)}`;
  put("#money-sum", `<div><b>${f(STATE.money.deposits)}</b><span>Deposits captured</span></div><div><b>${f(STATE.money.invoiced)}</b><span>Invoiced</span></div><div><b>${f(STATE.money.paid)}</b><span>Invoices paid</span></div>`);
  put("#payments", STATE.payments.length ? STATE.payments.map((p) => { const l = leadById(p.lead); const link = p.type === "deposit" ? p.approveUrl : p.payerUrl;
    return `<div class="item"><h4>${p.type === "deposit" ? "💳 Deposit" : "🧾 Invoice " + esc(p.number || "")} · ${esc(l?.name)}${fic(l)} <span class="pill ${["captured", "paid"].includes(p.status) ? "good" : "wait"}">${esc(p.status)}</span></h4><div class="meta">${f(p.amount)} · ${esc(p.provider)} · ${esc(p.orderId || p.invoiceId)}</div>${l?.invoice?.calls && p.type === "invoice" ? `<div class="meta">${esc(agentName("followup"))}'s tool calls: ${l.invoice.calls.map((c) => `<code>${esc(c.tool)}</code>`).join(" → ")}${l.invoice.official ? " (PayPal Agent Toolkit)" : ""}</div>` : ""}${link && !["captured", "paid"].includes(p.status) ? `<div class="acts"><a class="pp-btn" style="padding:8px 12px;border-radius:10px;text-decoration:none;font-weight:700" href="${esc(link)}" target="_blank" rel="noopener">${p.type === "deposit" ? "Pay deposit as the customer" : "Pay invoice as the customer"}</a></div>` : ""}</div>`; }).join("")
    : `<div class="empty">No payments yet. When a business says yes, ${esc(agentName("inbox"))} makes a PayPal deposit link.</div>`);
}
$("#check-btn").onclick = async () => { try { await api("/api/payments/check", { method: "POST" }); toast("Checked PayPal for paid invoices"); refresh(); } catch (e) { toast(e.message); } };

function renderActivity() {
  put("#activity", STATE.log.length ? STATE.log.map((x) => `<div style="--c:${agentColor(x.agent)}"><time>${ago(x.at)}</time><b>${esc(x.agent === "system" ? "System" : agentName(x.agent))}</b> ${esc(x.text)}</div>`).join("") : `<div class="empty">Quiet office. Start a run.</div>`);
}

async function renderTeach() {
  const list = await api("/api/agents").catch(() => []);
  $("#teach").innerHTML = list.map((a) => `<div class="item" data-role="${a.role}"><h4 style="color:${esc(agentColor(a.role))}">${esc(a.name)} <span class="meta">agents/${esc(a.file)}</span></h4><textarea>${esc(a.text)}</textarea><div class="acts"><button class="ok-btn" data-act="save">Save</button></div></div>`).join("");
}
$("#teach").addEventListener("click", async (ev) => { const b = ev.target.closest("button[data-act=save]"); if (!b) return; const card = b.closest("[data-role]"); try { await api(`/api/agents/${card.dataset.role}`, { method: "PUT", body: { text: $("textarea", card).value } }); toast("Saved. Used from the next run."); } catch (e) { toast(e.message); } });

// ── run
$("#run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim() || $("#q").placeholder;
  $("#run-btn").disabled = true;
  try { const r = await api("/api/runs", { method: "POST", body: { query: q, niche: $("#niche").value } }); toast(`Run started: ${r.query}`); office?.resetView(); if (matchMedia("(max-width:980px)").matches) $("#office").scrollIntoView({ behavior: "smooth" }); refresh(); }
  catch (err) { toast(err.message); }
  finally { setTimeout(() => ($("#run-btn").disabled = false), 1500); }
});
$("#reset-btn").onclick = async () => { if (!confirm("Clear all runs, emails and payments?")) return; await api("/api/demo/reset", { method: "POST" }); ["#runs", "#approvals", "#inbox", "#pipeline", "#payments", "#activity"].forEach((s) => ($(s).dataset.h = "")); refresh(); toast("Fresh start"); };

boot().catch((e) => toast("Couldn't start: " + e.message));
