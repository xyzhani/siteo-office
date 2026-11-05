// Tiny JSON-file store. Good enough for one studio; swap for a database if you outgrow it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { settings } from "./config.js";

const FILE = path.join(settings.dataDir, "db.json");
const EMPTY = () => ({ runs: [], leads: [], emails: [], payments: [], events: [], log: [], unsubscribed: [] });
export let db = EMPTY();
try { fs.mkdirSync(settings.dataDir, { recursive: true }); if (fs.existsSync(FILE)) db = { ...EMPTY(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (e) { console.warn("[store] starting empty:", e.message); }

let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { fs.writeFileSync(FILE + ".tmp", JSON.stringify(db)); fs.renameSync(FILE + ".tmp", FILE); } catch (e) { console.warn("[store] save failed:", e.message); }
  }, 300);
}
export function reset() { db = EMPTY(); save(); }
export const id = (p = "") => p + crypto.randomBytes(6).toString("hex");
export const now = () => new Date().toISOString();

export function log(agent, text, extra = {}) {
  db.log.push({ id: id("l"), at: now(), agent, text, ...extra });
  if (db.log.length > 600) db.log.splice(0, db.log.length - 600);
  save();
}
export const lead = (lid) => db.leads.find((l) => l.id === lid);
export const run = (rid) => db.runs.find((r) => r.id === rid);
export const email = (eid) => db.emails.find((e) => e.id === eid);
export const payment = (pid) => db.payments.find((p) => p.id === pid);
