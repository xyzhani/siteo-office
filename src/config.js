// Loads .env, studio.config.json, team.config.json, niche packs and agent instructions.
// Everything a user customises lives in plain files at the project root.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(ROOT, ".env"))) { try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* ignore malformed .env */ } }

const env = process.env;
const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Could not read ${path.relative(ROOT, p)}: ${e.message}`); } };
const readText = (p, fallback = "") => { try { return fs.readFileSync(p, "utf8"); } catch { return fallback; } };
const bool = (v, d) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, d) => (v == null || v === "" || !isFinite(Number(v)) ? d : Number(v));

export const ROLES = ["finder", "auditor", "developer", "checker", "seo", "sender", "inbox", "followup"];
// default file name of each role's instructions in agents/
export const ROLE_FILES = { finder: "misso", auditor: "tom", developer: "knight", checker: "snow-bell", seo: "sherlock", sender: "nemo", inbox: "scrapper", followup: "fluffy" };

export function loadStudio() {
  const s = readJSON(path.join(ROOT, "studio.config.json"));
  s.depositPercent = clampNum(s.depositPercent, 1, 100, 20);
  s.conceptPrice = Math.max(1, num(s.conceptPrice, 500));
  s.currency = /^[A-Z]{3}$/.test(s.currency || "") ? s.currency : "USD";
  s.safety = { requireEmailApproval: true, unsubscribeLine: true, approveInvoices: false, maxFollowups: 3, ...(s.safety || {}) };
  s.safety.requireEmailApproval = true; // not optional in v1: a human approves every email
  return s;
}
function clampNum(v, a, b, d) { const n = num(v, d); return Math.max(a, Math.min(b, n)); }

export function loadTeam() {
  const t = readJSON(path.join(ROOT, "team.config.json"));
  const out = {};
  for (const id of ROLES) out[id] = { enabled: true, ...(t.agents?.[id] || {}) };
  return { ...t, agents: out };
}

export function listNiches() {
  const dir = path.join(ROOT, "niches");
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "search.json"))).map((d) => d.name);
}

export function loadNiche(id) {
  if (!/^[a-z0-9-]+$/.test(id || "")) throw new Error("Bad niche id");
  const dir = path.join(ROOT, "niches", id);
  if (!fs.existsSync(dir)) throw new Error(`No niche pack "${id}" in niches/`);
  return {
    id, dir,
    search: readJSON(path.join(dir, "search.json")),
    facts: readJSON(path.join(dir, "facts.json")),
    audit: readJSON(path.join(dir, "audit.json")),
    rules: readText(path.join(dir, "rules.md")),
    emails: readText(path.join(dir, "emails.md")),
    template: readText(path.join(dir, "template", "index.html")),
  };
}

// agents/<file>.md: plain-text instructions you can edit ("teach your agents")
export function loadAgentInstructions(role) {
  const team = loadTeam();
  const file = team.agents[role]?.instructions || ROLE_FILES[role] + ".md";
  return readText(path.join(ROOT, "agents", path.basename(file)), "");
}

export const settings = {
  port: num(env.PORT, 3000),
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || "").replace(/\/$/, ""),
  dataDir: path.resolve(ROOT, env.DATA_DIR || "data"),
  adminToken: env.ADMIN_TOKEN || "",
  llm: {
    provider: (env.LLM_PROVIDER || "claude").toLowerCase(),
    anthropicKey: env.ANTHROPIC_API_KEY || "",
    model: env.CLAUDE_MODEL || "",
    usdPerMTokIn: num(env.AI_USD_PER_MTOK_INPUT, 3),
    usdPerMTokOut: num(env.AI_USD_PER_MTOK_OUTPUT, 15),
    maxUsdPerRun: num(env.MAX_AI_USD_PER_RUN, 2),
  },
  search: {
    provider: (env.SEARCH_PROVIDER || "osm").toLowerCase(),
    googleKey: env.GOOGLE_PLACES_API_KEY || "",
    apifyToken: env.APIFY_TOKEN || "",
    maxResults: num(env.MAX_BUSINESSES_PER_RUN, 12),
    contact: env.OSM_CONTACT || "",
  },
  audit: { pagespeedKey: env.PAGESPEED_API_KEY || "", usePagespeed: bool(env.USE_PAGESPEED, true), shortlist: num(env.SHORTLIST_SIZE, 3) },
  email: {
    provider: (env.EMAIL_PROVIDER || "test").toLowerCase(),
    smtp: { host: env.SMTP_HOST || "", port: num(env.SMTP_PORT, 587), secure: bool(env.SMTP_SECURE, false), user: env.SMTP_USER || "", pass: env.SMTP_PASS || "" },
    from: env.EMAIL_FROM || "",
    testRecipient: env.SMTP_TEST_RECIPIENT || "",
  },
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID || "",
    clientSecret: env.PAYPAL_CLIENT_SECRET || "",
    env: (env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? "live" : "sandbox",
    webhookId: env.PAYPAL_WEBHOOK_ID || "",
    buyerHint: env.DEMO_BUYER_HINT || "",
  },
  pacing: { stepMs: num(env.PACE_MS, -1) },
  followupAfterMinutes: num(env.FOLLOWUP_AFTER_MINUTES, 3 * 24 * 60),
};

// Demo mode: no AI key, or DEMO_MODE=true. Fictional businesses, rule-based agents, no outside calls
// except PayPal Sandbox (if its keys are set).
export const demoMode = bool(env.DEMO_MODE, !settings.llm.anthropicKey);
if (settings.pacing.stepMs < 0) settings.pacing.stepMs = demoMode ? 2200 : 600;
if (demoMode && env.FOLLOWUP_AFTER_MINUTES == null) settings.followupAfterMinutes = 2;
export const paypalReady = !!(settings.paypal.clientId && settings.paypal.clientSecret);

export function publicStatus() {
  return {
    demo: demoMode,
    llm: demoMode ? "demo (rule-based)" : settings.llm.provider,
    llmReady: !!(settings.llm.anthropicKey && settings.llm.model),
    search: demoMode ? "demo (fictional)" : settings.search.provider,
    email: settings.email.provider === "smtp" && settings.email.smtp.host ? "smtp" : "test inbox",
    payments: paypalReady ? `paypal-${settings.paypal.env}` : "simulated (add PayPal Sandbox keys)",
    webhookVerified: !!settings.paypal.webhookId,
    maxUsdPerRun: settings.llm.maxUsdPerRun,
    buyerHint: paypalReady && settings.paypal.env === "sandbox" ? settings.paypal.buyerHint : "",
    adminLocked: !!settings.adminToken,
  };
}
