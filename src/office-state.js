// What the 3D office polls: each cat's state + task, handoffs (a cat walks a folder to the next desk),
// and events (speech bubbles and the 💰 moment). Shape matches public/office.js applyState().
import { db, id, now } from "./store.js";
import { ROLES, loadTeam } from "./config.js";

const agents = Object.fromEntries(ROLES.map((r) => [r, { state: "idle", task: null, lead: null }]));
const handoffs = [];
const events = [];
let lastActivity = 0;
const touch = () => (lastActivity = Date.now());
const openedAt = new Date(Date.now() - 2 * 3600e3).toISOString(); // skip the morning wake-up routine

export function working(role, task, leadName = null) { touch(); agents[role] = { state: "working", task, lead: leadName }; }
export function waiting(role, task, leadName = null) { agents[role] = { state: "waiting", task, lead: leadName }; }
export function idle(role) { agents[role] = { state: "idle", task: null, lead: null }; }
export function say(role, text) { touch(); push(events, { id: id("e"), type: "say", agent: role, text, at: now() }); }
export function money(role, text) { push(events, { id: id("e"), type: "money", agent: role, text, at: now() }); }
export function handoff(from, to, leadName) { push(handoffs, { id: id("h"), from, to, lead: leadName, at: now() }); }
function push(list, x) { list.push(x); if (list.length > 40) list.shift(); }

export function officeState() {
  const team = loadTeam();
  const pending = db.emails.filter((e) => e.status === "awaiting_approval").length;
  // Nemo walks to the approvals desk while anything waits for a human
  const out = {};
  // while a run is going (or work waits on a human), idle cats stay at their desks ("ready") instead of napping
  const busy = db.runs.some((r) => ["queued", "running"].includes(r.status)) || Date.now() - lastActivity < 45000;
  for (const r of ROLES) out[r] = team.agents[r].enabled === false ? { state: "off", task: null, lead: null } : agents[r].state === "idle" && busy ? { ...agents[r], state: "ready" } : { ...agents[r] };
  if (pending && out.sender.state !== "off" && out.sender.state !== "working") out.sender = { state: "waiting", task: `${pending} email${pending > 1 ? "s" : ""} waiting for approval`, lead: null };
  return { now: Date.now(), office_open: true, opened_at: openedAt, agents: out, handoffs, events, pending_approvals: pending };
}
