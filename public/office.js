// Siteo Office (open source, MIT): a live, cozy isometric 3D office where the cat agents work,
// deliver handoffs, queue at the milk bar and food bar and nap, driven by the polled pipeline state.
// Ported from the original Siteo office. Names, colours, fur and accessories come from team.config.json
// via configureOffice(); speech bubbles and the 💰 moment come from state.events.
// Everything is procedural (primitives + canvas textures); no external assets.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const AGENTS = [
  { id: "finder",   name: "Misso",     role: "Lead Finder",    pronoun: "he",  color: "#e3893a" },
  { id: "auditor",  name: "Tom",       role: "Site Auditor",   pronoun: "he",  color: "#9aa1ab" },
  { id: "developer",name: "Knight",    role: "Web Developer",  pronoun: "he",  color: "#26262c" },
  { id: "checker",  name: "Snow Bell", role: "Fact Checker",   pronoun: "she", color: "#f3ece1" },
  { id: "seo",      name: "Sherlock",  role: "SEO Expert",     pronoun: "he",  color: "#8f6240" },
  { id: "sender",   name: "Nemo",      role: "Email Sender",   pronoun: "he",  color: "#f7f5f1" },
  { id: "inbox",    name: "Scrapper",  role: "Inbox Reader",   pronoun: "he",  color: "#ecdfca" },
  { id: "followup", name: "Fluffy",    role: "Follow-ups",     pronoun: "he",  color: "#d99a5c" },
];

// Per-cat look: accent (UI dot, folders, rug), eyes, fur pattern, darker fur, belly, accessory.
const LOOK = {
  finder:    { accent: "#f59e42", eye: "#6fbf3c", pattern: "tabby",   dark: "#a9541b", belly: "#fbe6cc", nose: "#e58f8f", acc: "scarf",   bed: "#e07a5f" },
  auditor:   { accent: "#5b8def", eye: "#e9a92a", pattern: "tabby",   dark: "#5d646e", belly: "#e7e9ec", nose: "#c98a8f", acc: "glasses", bed: "#81b29a" },
  developer: { accent: "#e0475a", eye: "#f4c430", pattern: "solid",   dark: "#141417", belly: "#3a3a42", nose: "#4a3b40", acc: "beret",   bed: "#f2cc8f" },
  checker:   { accent: "#b07a45", eye: "#4f9de8", pattern: "points",  dark: "#7a5233", belly: "#fffaf3", nose: "#d48a8f", acc: "deerstalker", bed: "#6d9dc5" },
  seo:       { accent: "#3fae74", eye: "#b9cf3a", pattern: "tabby",   dark: "#33200f", belly: "#efe0c8", nose: "#c98273", acc: "inverness", bed: "#d4a373", chartScreen: true, lensPaw: "fl" },
  sender:    { accent: "#3d7be0", eye: "#62b844", pattern: "patches", dark: "#e08a3c", belly: "#ffffff", nose: "#ec9aa5", acc: "mailcap", bed: "#e8a0bf" },
  inbox:     { accent: "#4fd1c5", eye: "#3f86e0", pattern: "points",  dark: "#4e3b2c", belly: "#f7efe2", nose: "#5a4038", acc: "headset", bed: "#b5a1e0" },
  followup:  { accent: "#e8b931", eye: "#6fbf3c", pattern: "tabby",   dark: "#9c5a26", belly: "#f6e3cb", nose: "#e0908f", acc: "bell",    bed: "#9ccfd8" },
};

// Studio people + brand (set by configureOffice before mountOffice)
const PEOPLE = { founder: { name: "You", role: "Founder" }, manager: { name: "Muffy", role: "Approvals" } };
const BRAND = { sign: "STUDIO", logo: null };
export const PATTERNS = ["tabby", "solid", "points", "patches"];
export const ACCESSORIES = ["scarf", "glasses", "beret", "deerstalker", "inverness", "mailcap", "headset", "bell", "none"];
// Apply team.config.json / studio.config.json to the office (call once, before mountOffice).
export function configureOffice({ team, people, brand } = {}) {
  for (const a of AGENTS) {
    const t = team?.[a.id]; if (!t) continue;
    if (t.name) a.name = String(t.name).slice(0, 24);
    if (t.role) a.role = String(t.role).slice(0, 28);
    if (t.pronoun) a.pronoun = t.pronoun;
    if (/^#[0-9a-f]{6}$/i.test(t.fur || "")) a.color = t.fur;
    const L = LOOK[a.id];
    if (/^#[0-9a-f]{6}$/i.test(t.color || "")) L.accent = t.color;
    if (/^#[0-9a-f]{6}$/i.test(t.eyes || "")) L.eye = t.eyes;
    if (/^#[0-9a-f]{6}$/i.test(t.furDark || "")) L.dark = t.furDark;
    if (/^#[0-9a-f]{6}$/i.test(t.belly || "")) L.belly = t.belly;
    if (PATTERNS.includes(t.pattern)) L.pattern = t.pattern;
    if (ACCESSORIES.includes(t.accessory)) L.acc = t.accessory;
  }
  if (people?.founder?.name) PEOPLE.founder = { ...PEOPLE.founder, ...people.founder };
  if (people?.manager?.name) PEOPLE.manager = { ...PEOPLE.manager, ...people.manager };
  if (brand?.sign) BRAND.sign = String(brand.sign).slice(0, 14);
  if (brand?.logo) BRAND.logo = brand.logo;
}

const WALK_SPEED = 1.6;
const STRIDE = 0.62;
const DWELL = 5;
const HANDOFF_WINDOW = 3 * 60 * 1000;
const MORNING_WINDOW = 30 * 60 * 1000;

// ───────────────────────── resource tracking ─────────────────────────
let RES = null; // { mats: Map, geos: Map, list: [] } for the mount being built
function track(x) { RES?.list.push(x); return x; }
function mat(color, o = {}) {
  const key = color + "|" + JSON.stringify(o);
  let m = RES.mats.get(key);
  if (!m) { m = track(new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, envMapIntensity: 0.38, ...o })); m.userData.baseEnv = m.envMapIntensity; RES.mats.set(key, m); }
  return m;
}
function basic(color, o = {}) { return track(new THREE.MeshBasicMaterial({ color, ...o })); }
function geo(key, make) { let g = RES.geos.get(key); if (!g) { g = track(make()); RES.geos.set(key, g); } return g; }
const G = {
  box: () => geo("box", () => new THREE.BoxGeometry(1, 1, 1)),
  rbox: (w, h, d, r = 0.03) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2))),
  sph: (seg = 20) => geo("s" + seg, () => new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg * 0.7)))),
  bodySph: () => geo("bodys", () => new THREE.SphereGeometry(1, 22, 16).rotateX(Math.PI / 2)),
  cyl: (seg = 20) => geo("c" + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)),
  cone: (seg = 16) => geo("k" + seg, () => new THREE.ConeGeometry(1, 1, seg)),
  cap: (r, l, seg = 10) => geo(`cap${r},${l},${seg}`, () => new THREE.CapsuleGeometry(r, l, 4, seg)),
  tor: (r, t, arc = Math.PI * 2, rs = 6, ts = 24) => geo(`t${r},${t},${arc},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  plane: () => geo("plane", () => new THREE.PlaneGeometry(1, 1)),
};
function mesh(g, m, cast = false, recv = false) { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; return o; }
function place(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); return o; }
function M4(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const headingTo = (dx, dz) => Math.atan2(dx, dz);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || "");

// merge static sibling meshes that share a material (fewer draw calls)
function compact(group) {
  const buckets = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || c.children.length || !c.visible || c.isInstancedMesh) continue;
    const k = c.material.uuid + (c.castShadow ? "c" : "") + (c.receiveShadow ? "r" : "") + (c.geometry.index ? "i" : "n");
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrix); return g;
    });
    const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose());
    if (!merged) continue;
    track(merged);
    const nm = new THREE.Mesh(merged, list[0].material); nm.castShadow = list[0].castShadow; nm.receiveShadow = list[0].receiveShadow;
    list.forEach((m) => group.remove(m)); group.add(nm);
  }
  return group;
}

// ───────────────────────── static batcher ─────────────────────────
// Collects static geometry per material and merges it into a handful of meshes.
class Batch {
  constructor() { this.groups = new Map(); this.stack = [new THREE.Matrix4()]; }
  push(m) { this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m)); }
  pop() { this.stack.pop(); }
  at(x, z, ry, fn, y = 0) { this.push(M4(x, y, z, ry)); fn(); this.pop(); }
  add(g, material, m, cast = true, recv = true) {
    const world = this.stack[this.stack.length - 1].clone().multiply(m);
    let gg = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(gg.attributes)) if (!["position", "normal", "uv"].includes(k)) gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    gg.applyMatrix4(world);
    const key = material.uuid + (cast ? "c" : "") + (recv ? "r" : "");
    if (!this.groups.has(key)) this.groups.set(key, { material, cast, recv, list: [] });
    this.groups.get(key).list.push(gg);
  }
  // helpers (local coords relative to current stack)
  box(w, h, d, m, x, y, z, ry = 0, cast = true, recv = true) { this.add(G.box(), m, M4(x, y, z, ry, 0, 0, w, h, d), cast, recv); }
  rbox(w, h, d, m, x, y, z, ry = 0, r = 0.03, cast = true, recv = true) { this.add(G.rbox(w, h, d, r), m, M4(x, y, z, ry), cast, recv); }
  cyl(rt, h, m, x, y, z, seg = 20, cast = true, rb = rt) {
    const g = geo(`cy${rt},${rb},${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
    this.add(g, m, M4(x, y, z, 0, 0, 0, 1, h, 1), cast, true);
  }
  sph(r, m, x, y, z, sx = 1, sy = 1, sz = 1, cast = true, seg = 16) { this.add(G.sph(seg), m, M4(x, y, z, 0, 0, 0, r * sx, r * sy, r * sz), cast, true); }
  build(parent) {
    for (const { material, cast, recv, list } of this.groups.values()) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      track(merged);
      const o = new THREE.Mesh(merged, material);
      o.castShadow = cast; o.receiveShadow = recv; o.matrixAutoUpdate = false;
      if (material.transparent) o.renderOrder = 2;
      parent.add(o);
    }
    this.groups.clear();
  }
}

// ───────────────────────── canvas textures ─────────────────────────
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function ctex(c, repeat) {
  const t = track(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function drawTex(w, h, fn, repeat) { const c = canvas(w, h); fn(c.getContext("2d"), w, h); return ctex(c, repeat); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shade(hex, k) { const c = new THREE.Color(hex); if (k < 0) c.lerp(new THREE.Color(0), -k); else c.lerp(new THREE.Color(1, 1, 1), k); return "#" + c.getHexString(); }

function oakTex() {
  return drawTex(512, 512, (g, w, h) => {
    const r = rng(7); const rows = 8, rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 150 + r() * 160, t = 0.92 + r() * 0.12;
        g.fillStyle = `rgb(${226 * t | 0},${196 * t | 0},${154 * t | 0})`;
        g.fillRect(x, i * rh, len, rh);
        g.globalAlpha = 0.07;
        for (let k = 0; k < 7; k++) { g.fillStyle = r() > 0.5 ? "#8a6440" : "#fff4e2"; g.fillRect(x, i * rh + 3 + r() * (rh - 6), len, 1 + r() * 1.5); }
        g.globalAlpha = 0.25; g.fillStyle = "#a78562"; g.fillRect(x, i * rh, 1.5, rh); g.globalAlpha = 1;
        x += len;
      }
      g.fillStyle = "rgba(140,105,70,.35)"; g.fillRect(0, i * rh, w, 1.5);
    }
  }, [10, 7.33]);
}
function carpetTex(base, line, rep) {
  return drawTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.05)"; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    if (line) { g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12); }
  }, rep);
}
function rugTex(c1, c2, c3) {
  const t = drawTex(512, 512, (g, w, h) => {
    const cx = w / 2;
    g.fillStyle = c1; g.beginPath(); g.arc(cx, cx, cx - 2, 0, 7); g.fill();
    g.lineWidth = 14; g.strokeStyle = c2; g.beginPath(); g.arc(cx, cx, cx - 30, 0, 7); g.stroke();
    g.lineWidth = 5; g.strokeStyle = c3; g.beginPath(); g.arc(cx, cx, cx - 58, 0, 7); g.stroke();
    g.setLineDash([10, 14]); g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, cx - 90, 0, 7); g.stroke(); g.setLineDash([]);
    const r = rng(11);
    for (let i = 0; i < 4000; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)"; g.fillRect(r() * w, r() * h, 2, 2); }
    g.globalCompositeOperation = "destination-in"; g.beginPath(); g.arc(cx, cx, cx - 2, 0, 7); g.fill();
  });
  return t;
}
function skyTex() {
  return drawTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#9fd0ff"); gr.addColorStop(0.65, "#d9eeff"); gr.addColorStop(1, "#fff1dc");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.85)";
    [[14, 30, 12], [24, 26, 10], [40, 52, 9], [48, 50, 7]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    g.fillStyle = "#8fb98a"; g.fillRect(0, h - 22, w, 22);
    g.fillStyle = "#6fa36d"; for (let x = 0; x < w; x += 9) { g.beginPath(); g.arc(x + 4, h - 22, 7, 0, 7); g.fill(); }
  });
}
function signTex(text, sub, opts = {}) {
  const W = opts.w ?? 512, H = opts.h ?? 128;
  return drawTex(W, H, (g, w, h) => {
    if (opts.bg) { g.fillStyle = opts.bg; rr(g, 2, 2, w - 4, h - 4, opts.r ?? 18); g.fill(); }
    if (opts.gradBg) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#8b7bff"); gr.addColorStop(0.55, "#6a5cff"); gr.addColorStop(1, "#4fd1c5"); g.fillStyle = gr; rr(g, 2, 2, w - 4, h - 4, opts.r ?? 18); g.fill(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    const grad = g.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
    grad.addColorStop(0, "#8b7bff"); grad.addColorStop(0.5, "#ff8fb1"); grad.addColorStop(1, "#4fd1c5");
    g.fillStyle = opts.color ?? grad;
    g.font = `${opts.weight ?? 700} ${opts.size ?? Math.round(h * 0.55)}px Inter, system-ui, sans-serif`;
    g.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + 2);
    if (sub) { g.fillStyle = opts.subColor ?? "#5b6070"; g.font = `500 ${Math.round(h * 0.22)}px Inter, system-ui, sans-serif`; g.fillText(sub, w / 2, h * 0.76); }
  });
}
function glowTex() {
  return drawTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function booksTex() {
  return drawTex(256, 64, (g, w, h) => {
    const r = rng(5); let x = 0; const cols = ["#e07a5f", "#3d5a80", "#81b29a", "#f2cc8f", "#8b7bff", "#4fd1c5", "#ff8fb1", "#6b4430", "#e9e3d5"];
    while (x < w) { const bw = 8 + r() * 12, bh = h * (0.7 + r() * 0.3); g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, h - bh, bw - 1.5, bh); g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x + 2, h - bh + 6, bw - 6, 2); x += bw; if (r() < 0.12) x += 10; }
  });
}
// fur texture for a body-oriented sphere (poles along z): u=0.75 spine, u=0.25 belly, v: front→rear
function furBodyTex(def, look, seed) {
  return drawTex(256, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = def.color; g.fillRect(0, 0, w, h);
    const bel = g.createLinearGradient(0, 0, w, 0);
    const bc = look.belly;
    bel.addColorStop(0, hexA(bc, 0)); bel.addColorStop(0.12, hexA(bc, 0.9)); bel.addColorStop(0.25, hexA(bc, 1)); bel.addColorStop(0.38, hexA(bc, 0.9)); bel.addColorStop(0.5, hexA(bc, 0)); bel.addColorStop(1, hexA(bc, 0));
    g.fillStyle = bel; g.fillRect(0, 0, w, h);
    if (look.pattern === "tabby") {
      g.fillStyle = hexA(look.dark, 0.75);
      for (let y = 22; y < h - 8; y += 20 + r() * 6) {
        const thick = 5 + r() * 4;
        for (const ox of [0, -w]) {
          g.beginPath();
          for (let x = w * 0.42; x <= w * 1.08; x += 6) { const yy = y + Math.sin(x * 0.07 + y) * 3; g.lineTo(x + ox, yy); }
          for (let x = w * 1.08; x >= w * 0.42; x -= 6) { const k = 1 - Math.abs(x / w - 0.75) / 0.33; g.lineTo(x + ox, y + thick * Math.max(0.2, k) + Math.sin(x * 0.05) * 2); }
          g.fill();
        }
      }
      g.fillStyle = hexA(look.dark, 0.55); g.fillRect(w * 0.72, 0, w * 0.06, h);
    } else if (look.pattern === "points") {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0.5, hexA(look.dark, 0)); gr.addColorStop(0.75, hexA(look.dark, 0.22)); gr.addColorStop(1, hexA(look.dark, 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else if (look.pattern === "patches") {
      g.fillStyle = look.dark;
      [[0.7, 0.32, 34], [0.86, 0.62, 40], [0.6, 0.72, 22], [0.78, 0.9, 26]].forEach(([u, v, s]) => { g.beginPath(); g.ellipse(u * w, v * h, s * 1.2, s, 0.3, 0, 7); g.fill(); });
    } else {
      g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(w * 0.6, 0, w * 0.3, h);
    }
    for (let i = 0; i < 1600; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)"; g.fillRect(r() * w, r() * h, 1, 3); }
  });
}
// head texture (poles along y): u=0.25 faces front, v=0 top
function furHeadTex(def, look) {
  return drawTex(256, 128, (g, w, h) => {
    g.fillStyle = def.color; g.fillRect(0, 0, w, h);
    const fx = w * 0.25;
    if (look.pattern === "tabby") {
      g.strokeStyle = hexA(look.dark, 0.85); g.lineCap = "round";
      g.lineWidth = 4; [-10, 0, 10].forEach((d) => { g.beginPath(); g.moveTo(fx + d, h * 0.08); g.lineTo(fx + d * 0.8, h * 0.3); g.stroke(); });
      g.lineWidth = 3; [-1, 1].forEach((s) => { for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(fx + s * (26 + k * 4), h * (0.5 + k * 0.07)); g.lineTo(fx + s * (40 + k * 6), h * (0.47 + k * 0.08)); g.stroke(); } });
      g.lineWidth = 5; for (let x = w * 0.55; x < w * 0.95; x += 14) { g.beginPath(); g.moveTo(x, h * 0.05); g.lineTo(x + 4, h * 0.4); g.stroke(); }
    } else if (look.pattern === "points") {
      const gr = g.createRadialGradient(fx, h * 0.55, 2, fx, h * 0.55, w * 0.13);
      gr.addColorStop(0, look.dark); gr.addColorStop(0.55, hexA(look.dark, 0.85)); gr.addColorStop(1, hexA(look.dark, 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else if (look.pattern === "patches") {
      g.fillStyle = look.dark;
      g.beginPath(); g.ellipse(fx + 26, h * 0.22, 30, 22, 0.4, 0, 7); g.fill();
      g.beginPath(); g.ellipse(w * 0.75, h * 0.2, 40, 26, 0, 0, 7); g.fill();
    }
    // lighter chin / lower muzzle
    const cg = g.createRadialGradient(fx, h * 0.8, 2, fx, h * 0.8, w * 0.1);
    cg.addColorStop(0, hexA(look.pattern === "points" ? shade(look.dark, 0.2) : look.belly, 0.9)); cg.addColorStop(1, hexA(look.belly, 0));
    if (look.pattern !== "points") { g.fillStyle = cg; g.fillRect(0, 0, w, h); }
  });
}
function legTex(def, look, lower) {
  return drawTex(32, 64, (g, w, h) => {
    let base = def.color;
    if (look.pattern === "points" && lower) base = look.dark;
    if (look.pattern === "patches") base = "#ffffff";
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (look.pattern === "points" && !lower) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hexA(look.dark, 0.9)); gr.addColorStop(0.6, hexA(look.dark, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (look.pattern === "tabby") { g.fillStyle = hexA(look.dark, 0.6); for (let y = 6; y < h; y += 16) g.fillRect(0, y, w, 5); }
  });
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ───────────────────────── layout ─────────────────────────
// Floor x∈[-15,15], z∈[-11,11]. Back wall z=-11, left wall x=-15. Camera looks from +x,+z.
const ROW_A = { z0: -11, z1: -5.5, cz: -8.25, s: 1, doorZ: -5.5, insideZ: -6.45 };
const ROW_B = { z0: -2.5, z1: 3, cz: 0.25, s: -1, doorZ: -2.5, insideZ: -1.6 };
const CORR_Z = -4, FRONT_Z = 3.85;
const FOUNDER = { x0: -15, x1: -9, z0: -11, z1: -5.5, doorX: -10.0 };
const MANAGER = { x0: -9, x1: -3.5, z0: -11, z1: -5.5, doorX: -4.3, deskX: -6.4, deskZ: -8.75, muffy: { x: -6.4, z: -9.3 }, visitor: { x: -5.75, z: -7.5 }, approach: { x: -5.0, z: -7.15 } };
// one bed per cat, in AGENTS order (Sherlock's at 300°, beside the lounge entrance)
const LOUNGE = { cx: -7.5, cz: 7.7, rx: 3.35, rz: 2.4, angles: [-20, 20, 60, 100, 300, 140, 180, 220] };
const COFFEE = { counterZ: 5.0, x0: 1.6, x1: 6.4, h: 0.55, ledge: 0.14, spots: [{ x: 2.3, z: 6.02 }, { x: 3.4, z: 6.02 }, { x: 4.5, z: 6.02 }], queue: [{ x: 2.0, z: 7.05 }, { x: 3.2, z: 7.25 }, { x: 4.4, z: 7.2 }, { x: 5.5, z: 6.85 }, { x: 1.4, z: 7.9 }, { x: 5.9, z: 7.9 }], hub: { x: 3.6, z: 8.6 }, face: Math.PI, lookAt: { x: 3.4, z: 5.0 }, bowlH: 0.17, node: "cof:hub" };
// meeting room seats (table centre 4.8,0.25; Hani at the head, facing +x)
const MEET = { hani: { x: 2.95, z: 0.25, h: Math.PI / 2 }, cat: { x: 3.8, z: -1.0, ax: 3.8, az: -1.72 }, muffy: { x: 5.8, z: -1.0, h: 0 }, seatY: 0.47, focus: { x: 4.45, y: 0.95, z: -0.35 } };
MEET.catHeading = Math.atan2(MEET.hani.x - MEET.cat.x, MEET.hani.z - MEET.cat.z);
// cat food bar along the left wall, next to the nap lounge
const FOOD = { x: -14.35, spots: [{ x: -13.84, z: 7.15 }, { x: -13.84, z: 8.05 }, { x: -13.84, z: 8.95 }], queue: [{ x: -12.55, z: 9.35 }, { x: -11.95, z: 9.6 }, { x: -12.0, z: 6.75 }, { x: -12.7, z: 6.45 }, { x: -11.4, z: 9.9 }, { x: -11.5, z: 6.3 }],
  hub: { x: -12.3, z: 8.0 }, face: -Math.PI / 2, lookAt: { x: -14.4, z: 8.05 }, bowlH: 0.06, node: "food:hub" };

// Each cat's cabin: row (A = back row, B = middle row) and its x span. Row B has three cabins left of the
// meeting room and one (Sherlock's) to its right, across the corridor from Snow Bell.
const CABINS = {
  finder: [ROW_A, -3.5, 1.125], auditor: [ROW_A, 1.125, 5.75], developer: [ROW_A, 5.75, 10.375], checker: [ROW_A, 10.375, 15],
  sender: [ROW_B, -15, -10.4], inbox: [ROW_B, -10.4, -5.8], followup: [ROW_B, -5.8, -1.2], seo: [ROW_B, 10.4, 15],
};
const cabinsIn = (row) => AGENTS.map((a) => a.id).filter((id) => CABINS[id][0] === row);
function cabinLayout() {
  const L = {};
  for (const [id, [row, x0, x1]] of Object.entries(CABINS)) L[id] = mk(id, x0, x1, row);
  function mk(id, x0, x1, row) {
    const s = row.s, cz = row.cz, doorX = x1 - 0.95;
    return {
      id, x0, x1, z0: row.z0, z1: row.z1, cx: (x0 + x1) / 2, cz, s, row, doorX,
      chair: { x: x0 + 1.24, z: cz - 0.15 * s },
      approach: { x: x0 + 1.95, z: cz - 0.15 * s },
      tray: { x: x0 + 0.5, y: 0.765, z: cz + 0.62 * s },
      trayDrop: { x: x0 + 1.36, z: cz + 0.62 * s },
      screen: { x: x0 + 0.302, y: 1.09, z: cz - 0.15 * s }, // just proud of the monitor face (no z-fighting)
    };
  }
  return L;
}
function bedSpots() {
  return LOUNGE.angles.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = LOUNGE.cx + Math.cos(a) * LOUNGE.rx, z = LOUNGE.cz + Math.sin(a) * LOUNGE.rz;
    return { x, z, ax: LOUNGE.cx + (x - LOUNGE.cx) * 0.6, az: LOUNGE.cz + (z - LOUNGE.cz) * 0.6 };
  });
}

// ───────────────────────── waypoint graph ─────────────────────────
function buildGraph(CAB, BEDS) {
  const N = new Map(); const E = new Map();
  const node = (id, x, z) => { N.set(id, { id, x, z }); E.set(id, new Set()); };
  const link = (a, b) => { E.get(a).add(b); E.get(b).add(a); };
  const corrXs = new Set([-13.6, 0, 14.2]);
  Object.values(CAB).forEach((c) => corrXs.add(+c.doorX.toFixed(3)));
  corrXs.add(MANAGER.doorX); corrXs.add(FOUNDER.doorX); corrXs.add(2.2);
  const xs = [...corrXs].sort((p, q) => p - q);
  xs.forEach((x) => node("c" + x, x, CORR_Z));
  for (let i = 1; i < xs.length; i++) link("c" + xs[i - 1], "c" + xs[i]);
  // cabins
  Object.values(CAB).forEach((c) => {
    const id = c.id, cx = "c" + +c.doorX.toFixed(3);
    node(id + ":door", c.doorX, c.row.doorZ); node(id + ":in", c.doorX, c.row.insideZ);
    node(id + ":desk", c.approach.x, c.approach.z); node(id + ":tray", c.trayDrop.x, c.trayDrop.z);
    link(cx, id + ":door"); link(id + ":door", id + ":in"); link(id + ":in", id + ":desk"); link(id + ":in", id + ":tray"); link(id + ":desk", id + ":tray");
  });
  // manager office
  node("mgr:door", MANAGER.doorX, -5.5); node("mgr:in", MANAGER.doorX, -6.45); node("mgr:visit", MANAGER.approach.x, MANAGER.approach.z);
  link("c" + MANAGER.doorX, "mgr:door"); link("mgr:door", "mgr:in"); link("mgr:in", "mgr:visit");
  // humans' own routes: Muffy's desk side, Hani's cabin, meeting room
  node("muffy:desk", -5.05, -9.3); link("mgr:in", "muffy:desk");
  node("hani:door", FOUNDER.doorX, -5.5); node("hani:in", FOUNDER.doorX, -6.45); node("hani:desk", -10.45, -9.0);
  link("c" + FOUNDER.doorX, "hani:door"); link("hani:door", "hani:in"); link("hani:in", "hani:desk");
  node("meet:door", 2.2, -2.5); node("meet:in", 2.2, -1.72); node("meet:hani", 2.2, 0.25); node("meet:cat", MEET.cat.ax, MEET.cat.az); node("meet:muffy", 5.8, -1.72);
  link("c2.2", "meet:door"); link("meet:door", "meet:in"); link("meet:in", "meet:hani"); link("meet:in", "meet:cat"); link("meet:cat", "meet:muffy");
  // aisle + front corridor
  const fx = [-12.0, LOUNGE.cx, 0, 7.4, 13.0];
  fx.forEach((x) => node("f" + x, x, FRONT_Z));
  for (let i = 1; i < fx.length; i++) link("f" + fx[i - 1], "f" + fx[i]);
  link("c0", "f0");
  // lounge
  node("lounge:gate", LOUNGE.cx, 5.0); node("lounge:hub", LOUNGE.cx, LOUNGE.cz);
  link("f" + LOUNGE.cx, "lounge:gate"); link("lounge:gate", "lounge:hub");
  BEDS.forEach((b, i) => { node("bed" + i, b.ax, b.az); link("lounge:hub", "bed" + i); });
  node("lounge:e", -2.4, LOUNGE.cz); link("lounge:hub", "lounge:e");
  // food bar: west exit between the beds at 180° and 220°, plus a gate from the front corridor
  const wa = (200 * Math.PI) / 180;
  node("lounge:w", LOUNGE.cx + Math.cos(wa) * LOUNGE.rx * 1.42, LOUNGE.cz + Math.sin(wa) * LOUNGE.rz * 1.42); link("lounge:hub", "lounge:w");
  node("food:gate", -12.0, 4.7); node("food:hub", FOOD.hub.x, FOOD.hub.z);
  link("f-12", "food:gate"); link("food:gate", "lounge:w"); link("lounge:w", "food:hub");
  // coffee corner
  node("cof:w", 0.6, 6.7); node("cof:e", 7.4, 6.7); node("cof:hub", COFFEE.hub.x, COFFEE.hub.z);
  link("f0", "cof:w"); link("f7.4", "cof:e"); link("cof:w", "cof:hub"); link("cof:e", "cof:hub"); link("lounge:e", "cof:w");
  return { N, E };
}
function route(graph, from, to) {
  const { N, E } = graph;
  if (from === to) return [from];
  const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
  while (open.size) {
    let cur = null, best = Infinity;
    for (const k of open) { const d = dist.get(k); if (d < best) { best = d; cur = k; } }
    open.delete(cur);
    if (cur === to) break;
    const a = N.get(cur);
    for (const nb of E.get(cur)) {
      const b = N.get(nb); const nd = best + Math.hypot(a.x - b.x, a.z - b.z);
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); prev.set(nb, cur); open.add(nb); }
    }
  }
  if (!dist.has(to)) return [from, to];
  const path = [to]; let k = to; while (prev.has(k)) { k = prev.get(k); path.unshift(k); }
  return path;
}
// polyline with rounded corners → dense sample points
function smoothPath(pts, r = 0.4) {
  if (pts.length < 3) return pts.map((p) => ({ x: p.x, z: p.z }));
  const out = [{ x: pts[0].x, z: pts[0].z }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
    const rr1 = Math.min(r, l1 / 2), rr2 = Math.min(r, l2 / 2);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const p0 = { x: b.x + ((a.x - b.x) / l1) * rr1, z: b.z + ((a.z - b.z) / l1) * rr1 };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * rr2, z: b.z + ((c.z - b.z) / l2) * rr2 };
    for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; out.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * b.z + t * t * p2.z }); }
  }
  const e = pts[pts.length - 1]; out.push({ x: e.x, z: e.z });
  return out;
}
class Path {
  constructor(pts, nodeIds = []) {
    this.p = pts; this.len = [0]; this.nodeIds = nodeIds;
    for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.total = this.len[this.len.length - 1];
  }
  at(s, out = { x: 0, z: 0 }) {
    s = clamp(s, 0, this.total);
    let i = 1; while (i < this.len.length - 1 && this.len[i] < s) i++;
    const a = this.p[i - 1], b = this.p[i] ?? a, seg = (this.len[i] ?? 0) - this.len[i - 1];
    const k = seg > 1e-6 ? (s - this.len[i - 1]) / seg : 0;
    out.x = lerp(a.x, b.x, k); out.z = lerp(a.z, b.z, k); return out;
  }
}

// ───────────────────────── office build ─────────────────────────
function buildOffice(scene, CAB, BEDS) {
  const B = new Batch();
  const out = { screens: {}, trays: {}, lampLights: [], lampGlows: [], windowMats: [], dynamic: new THREE.Group(), pick: {} };
  scene.add(out.dynamic);
  const W = {
    wall: mat("#f5efe6", { roughness: 0.95 }), cap: mat("#d8c7b0", { roughness: 0.9 }), base: mat("#e3d3bd", { roughness: 0.9 }),
    slab: mat("#cdb89c", { roughness: 0.9 }), trim: mat("#e6d8c4"),
    alu: mat("#c4cad2", { metalness: 0.75, roughness: 0.32, envMapIntensity: 0.9 }), dark: mat("#2b2e35", { roughness: 0.5 }),
    glass: track(new THREE.MeshStandardMaterial({ color: "#d6eef6", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide })),
    frost: track(new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, roughness: 0.6, depthWrite: false })),
    birch: mat("#ecdcc2", { roughness: 0.6 }), white: mat("#f7f4ee", { roughness: 0.55 }), walnut: mat("#6e4631", { roughness: 0.55 }),
    walnutD: mat("#4f3122", { roughness: 0.6 }), leather: mat("#9a6340", { roughness: 0.55 }), leatherD: mat("#2a2421", { roughness: 0.5 }),
    terra: mat("#c9734f"), potW: mat("#efe8dc"), potD: mat("#3c4048"), soil: mat("#5b4636"),
    leaf1: mat("#4f9a5b", { roughness: 0.7 }), leaf2: mat("#3d8350", { roughness: 0.7 }), leaf3: mat("#77b866", { roughness: 0.7 }),
    books: track(new THREE.MeshStandardMaterial({ map: booksTex(), roughness: 0.8, envMapIntensity: 0.3 })),
    screenOff: mat("#20232b", { roughness: 0.3 }), metal: mat("#d9dde3", { metalness: 0.8, roughness: 0.25, envMapIntensity: 1 }),
    gold: mat("#e8b931", { metalness: 0.85, roughness: 0.25, envMapIntensity: 1.2 }),
  };
  W.glass.userData.baseEnv = 1.4;
  out.mats = W;

  // floor + slab
  const floorMat = track(new THREE.MeshStandardMaterial({ map: oakTex(), roughness: 0.62, envMapIntensity: 0.3 }));
  const floor = mesh(G.plane(), floorMat, false, true); floor.rotation.x = -Math.PI / 2; floor.scale.set(30, 22, 1); scene.add(floor);
  B.box(30.4, 0.5, 22.4, W.slab, 0, -0.26, 0, 0, false, false);
  B.box(30.6, 0.12, 22.6, W.base, 0, -0.5, 0, 0, false, false);

  // rugs / carpets (thin planes, polygon offset)
  const rugMat = (tex, c = "#ffffff") => track(new THREE.MeshStandardMaterial({ map: tex, color: c, roughness: 0.95, envMapIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: !!(tex && tex.userData?.alpha) }));
  const flat = (w, d, m, x, z, y = 0.004) => { const o = mesh(G.plane(), m, false, true); o.rotation.x = -Math.PI / 2; o.scale.set(w, d, 1); o.position.set(x, y, z); scene.add(o); return o; };
  flat(5.8, 5.3, rugMat(carpetTex("#22305a", "#2f3f70", [3, 3])), -12, -8.25);
  flat(5.1, 5.1, rugMat(carpetTex("#d8b9a5", "#c9a58f", [3, 3])), -6.25, -8.25);
  const loungeRug = rugTex("#efe2cc", "#e3a588", "#8bb8a8"); loungeRug.userData.alpha = true;
  const lr = flat(LOUNGE.rx * 2 + 2.2, LOUNGE.rz * 2 + 2.2, track(new THREE.MeshStandardMaterial({ map: loungeRug, transparent: true, roughness: 1, envMapIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), LOUNGE.cx, LOUNGE.cz);
  lr.renderOrder = 1;
  flat(6.2, 4.4, rugMat(carpetTex("#e9dfcf", "#d9c8ae", [4, 3])), 4.8, 0.25);
  flat(3.4, 2.6, rugMat(carpetTex("#cfe3dc", "#a9cbbf", [2, 2])), 9.6, 8.4);
  Object.values(CAB).forEach((c) => flat(2.0, 2.3, rugMat(carpetTex(shade(LOOK[c.id].accent, 0.62), shade(LOOK[c.id].accent, 0.4), [1, 1])), c.x0 + 1.45, c.cz - 0.1 * c.s));

  // ── outer walls with windows
  const H = 3.0, sill = 0.85, head = 2.45;
  const sky = skyTex(); const paneMat = track(new THREE.MeshBasicMaterial({ map: sky, color: "#ffffff" })); out.windowMats.push(paneMat);
  function wall(axis, c, a0, a1, wins) {
    // axis 'x': runs along x at z=c ; axis 'z': runs along z at x=c
    const seg = (s0, s1, y0, y1, m = W.wall) => {
      const len = s1 - s0, mid = (s0 + s1) / 2, h = y1 - y0;
      if (len <= 0.001 || h <= 0) return;
      if (axis === "x") B.box(len, h, 0.2, m, mid, y0 + h / 2, c, 0, true, true); else B.box(0.2, h, len, m, c, y0 + h / 2, mid, 0, true, true);
    };
    let cur = a0;
    wins.sort((p, q) => p.c - q.c).forEach(({ c: wc, w }) => {
      const s0 = wc - w / 2, s1 = wc + w / 2;
      seg(cur, s0, 0, H); seg(s0, s1, 0, sill); seg(s0, s1, head, H); cur = s1;
      // pane + frame
      const inward = 0.02;
      if (axis === "x") B.add(G.plane(), paneMat, M4(wc, (sill + head) / 2, c, 0, 0, 0, w, head - sill, 1), false, false);
      else B.add(G.plane(), paneMat, M4(c, (sill + head) / 2, wc, Math.PI / 2, 0, 0, w, head - sill, 1), false, false);
      const fr = (fs, fy, fl, fh) => axis === "x" ? B.box(fl, fh, 0.08, W.alu, fs, fy, c + 0.07, 0, false, true) : B.box(0.08, fh, fl, W.alu, c + 0.07, fy, fs, 0, false, true);
      fr(wc, sill, w + 0.08, 0.06); fr(wc, head, w + 0.08, 0.06); fr(s0, (sill + head) / 2, 0.06, head - sill); fr(s1, (sill + head) / 2, 0.06, head - sill); fr(wc, (sill + head) / 2, 0.05, head - sill); fr(wc, 1.95, w, 0.04);
      if (axis === "x") B.box(w + 0.2, 0.05, 0.22, W.white, wc, sill - 0.01, c + 0.15); else B.box(0.22, 0.05, w + 0.2, W.white, c + 0.15, sill - 0.01, wc);
      void inward;
    });
    seg(cur, a1, 0, H);
    if (axis === "x") { B.box(a1 - a0 + 0.2, 0.06, 0.26, W.cap, (a0 + a1) / 2, H + 0.03, c, 0, false, false); B.box(a1 - a0, 0.1, 0.03, W.trim, (a0 + a1) / 2, 0.05, c + 0.115, 0, false, true); }
    else { B.box(0.26, 0.06, a1 - a0 + 0.2, W.cap, c, H + 0.03, (a0 + a1) / 2, 0, false, false); B.box(0.03, 0.1, a1 - a0, W.trim, c + 0.115, 0.05, (a0 + a1) / 2, 0, false, true); }
  }
  wall("x", -11.1, -15.2, 15.2, [{ c: -12, w: 2.2 }, { c: -6.25, w: 2.2 }, ...cabinsIn(ROW_A).map((id) => ({ c: CAB[id].cx + 0.6, w: 2.0 }))]);
  wall("z", -15.1, -11, 11, [{ c: -8.0, w: 2.0 }, { c: 0.6, w: 1.8 }, { c: 6.4, w: 2.4 }, { c: 9.4, w: 2.4 }]);

  // ── glass partitions
  const GH = 2.35;
  function glass(axis, c, a0, a1, door) {
    const pieces = door == null ? [[a0, a1]] : [[a0, door - 0.55], [door + 0.55, a1]];
    const bx = (s, y, len, h, d, m, cast = false) => axis === "x" ? B.box(len, h, d, m, s, y, c, 0, cast, true) : B.box(d, h, len, m, c, y, s, 0, cast, true);
    pieces.forEach(([p0, p1]) => {
      const len = p1 - p0; if (len < 0.05) return;
      const mid = (p0 + p1) / 2;
      bx(mid, GH / 2, len, GH - 0.08, 0.03, W.glass);
      bx(mid, 1.15, len, 0.1, 0.036, W.frost);
      bx(mid, 0.035, len, 0.07, 0.08, W.alu);
      const n = Math.max(1, Math.ceil(len / 1.6));
      for (let i = 0; i <= n; i++) bx(p0 + (len * i) / n, GH / 2, 0.05, GH, 0.07, W.alu);
    });
    bx((a0 + a1) / 2, GH, a1 - a0, 0.07, 0.09, W.alu);
    if (door != null) { bx(door - 0.55, GH / 2, 0.07, GH, 0.09, W.alu); bx(door + 0.55, GH / 2, 0.07, GH, 0.09, W.alu); }
  }
  // row A front + partitions
  glass("x", -5.5, -15, -9, FOUNDER.doorX); glass("x", -5.5, -9, -3.5, MANAGER.doorX);
  cabinsIn(ROW_A).forEach((id) => glass("x", -5.5, CAB[id].x0, CAB[id].x1, CAB[id].doorX));
  [-9, -3.5, 1.125, 5.75, 10.375, 15].forEach((x) => glass("z", x, -11, -5.5));
  // row B (side walls: every cabin edge except the outer left wall)
  cabinsIn(ROW_B).forEach((id) => { glass("x", -2.5, CAB[id].x0, CAB[id].x1, CAB[id].doorX); glass("x", 3, CAB[id].x0, CAB[id].x1); });
  [...new Set(cabinsIn(ROW_B).flatMap((id) => [CAB[id].x0, CAB[id].x1]))].filter((x) => x > -15).forEach((x) => glass("z", x, -2.5, 3));
  // meeting room
  glass("x", -2.5, 1.2, 8.4, 2.2); glass("x", 3, 1.2, 8.4); glass("z", 1.2, -2.5, 3); glass("z", 8.4, -2.5, 3);

  // ── signs
  const signPlane = (tex, w, h, x, y, z, ry = 0, transparent = true) => { const o = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: tex, transparent, toneMapped: false }))); o.position.set(x, y, z); o.rotation.y = ry; o.scale.set(w, h, 1); scene.add(o); return o; };
  // brand logo on a dark wall panel (falls back to the text sign if the image can't load)
  const logoSign = signPlane(signTex(BRAND.sign, null, { w: 512, h: 160, size: Math.min(120, Math.round(560 / Math.max(4, BRAND.sign.length))), weight: 800 }), 3.0, 1.24, -14.95, 2.05, -4.0, Math.PI / 2);
  if (BRAND.logo) new THREE.TextureLoader().load(new URL(BRAND.logo, document.baseURI).href, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const old = logoSign.material.map; logoSign.material.map = t; logoSign.material.transparent = false; logoSign.material.needsUpdate = true; old?.dispose?.();
  });
  B.box(0.04, 1.44, 3.3, mat("#07080d", { roughness: 0.5 }), -14.98, 2.05, -4.0, 0, false, false);
  AGENTS.forEach((a) => {
    const c = CAB[a.id], z = c.s > 0 ? -5.48 : 3.02;
    signPlane(signTex(a.name, a.role, { w: 384, h: 112, bg: "rgba(255,255,255,.92)", color: LOOK[a.id].accent, size: 44, subColor: "#596070" }), 1.2, 0.35, c.x0 + 1.1, 2.0, z);
  });
  signPlane(signTex("Meeting room", null, { w: 384, h: 96, bg: "rgba(255,255,255,.92)", color: "#596070", size: 40, weight: 600 }), 1.1, 0.28, 3.2, 2.0, 3.02);
  signPlane(signTex("Nap lounge", null, { w: 384, h: 96, bg: "rgba(255,255,255,.0)", color: "#b88566", size: 52, weight: 700 }), 2.0, 0.5, LOUNGE.cx, 0.006, 10.35, 0).rotation.set(-Math.PI / 2, 0, 0);
  signPlane(signTex(`${PEOPLE.founder.name} · ${PEOPLE.founder.role}`, null, { w: 512, h: 112, gradBg: true, color: "#ffffff", size: 46 }), 1.05, 0.23, -12, 2.0, -5.48);
  signPlane(signTex(`${PEOPLE.manager.name} · ${PEOPLE.manager.role}`, null, { w: 512, h: 112, bg: "#d7262c", color: "#ffffff", size: 46 }), 1.05, 0.23, -6.6, 2.0, -5.48);

  // ── furniture helpers
  function plant(x, z, s = 1, kind = "bush", pot = W.terra) {
    B.at(x, z, 0, () => {
      B.cyl(0.2 * s, 0.38 * s, pot, 0, 0.19 * s, 0, 16, true, 0.15 * s);
      B.cyl(0.18 * s, 0.02, W.soil, 0, 0.37 * s, 0, 12, false);
      const r = rng(Math.round(x * 13 + z * 7));
      if (kind === "bush") {
        for (let i = 0; i < 9; i++) { const a = r() * 7, d = r() * 0.16 * s; B.sph(0.16 * s * (0.7 + r() * 0.5), [W.leaf1, W.leaf2, W.leaf3][i % 3], Math.cos(a) * d, (0.5 + r() * 0.35) * s, Math.sin(a) * d, 1, 0.8, 1, true, 9); }
      } else if (kind === "tall") {
        B.cyl(0.02 * s, 1.1 * s, W.walnutD, 0, 0.9 * s, 0, 6, true);
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4, y = (0.75 + (i / 14) * 0.95) * s, d = 0.12 * s;
          B.add(G.sph(8), [W.leaf1, W.leaf2, W.leaf3][i % 3], M4(Math.cos(a) * d, y, Math.sin(a) * d, -a, 0.5, 0, 0.16 * s, 0.035 * s, 0.11 * s), true, true);
        }
      } else {
        for (let i = 0; i < 9; i++) { const a = r() * 7; B.add(G.cone(4), [W.leaf1, W.leaf2][i % 2], M4(Math.cos(a) * 0.06 * s, (0.62 + r() * 0.15) * s, Math.sin(a) * 0.06 * s, a, (r() - 0.5) * 0.35, (r() - 0.5) * 0.35, 0.05 * s, (0.55 + r() * 0.3) * s, 0.02 * s), true, true); }
      }
    });
  }
  function chair(x, z, ry, fab, arms = false, low = false) {
    B.at(x, z, ry, () => {
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; B.add(G.box(), W.dark, M4(Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14, a, 0, 0, 0.04, 0.035, 0.28)); B.sph(0.028, W.dark, Math.sin(a) * 0.27, 0.028, Math.cos(a) * 0.27, 1, 1, 1, false, 8); }
      B.cyl(0.028, 0.34, W.alu, 0, 0.24, 0, 10);
      B.rbox(0.52, 0.08, 0.5, fab, 0, 0.43, 0, 0, 0.035);
      if (low) { B.box(0.05, 0.2, 0.04, W.dark, 0, 0.54, -0.26); B.add(G.rbox(0.46, 0.3, 0.07, 0.035), fab, M4(0, 0.74, -0.27, 0, -0.12)); }
      else { B.box(0.05, 0.36, 0.04, W.dark, 0, 0.62, -0.26); B.add(G.rbox(0.48, 0.5, 0.07, 0.035), fab, M4(0, 0.86, -0.27, 0, -0.12)); }
      if (arms) [-1, 1].forEach((sd) => { B.box(0.04, 0.2, 0.04, W.dark, sd * 0.25, 0.55, -0.02); B.rbox(0.07, 0.03, 0.28, W.dark, sd * 0.25, 0.66, 0.0); });
    });
  }
  function shelf(x, z, ry, w, h, m = W.white, deco = true) {
    B.at(x, z, ry, () => {
      B.box(w, 0.04, 0.32, m, 0, h, 0); B.box(w, 0.04, 0.32, m, 0, 0.02, 0);
      B.box(0.04, h, 0.32, m, -w / 2, h / 2, 0); B.box(0.04, h, 0.32, m, w / 2, h / 2, 0);
      B.box(w, h, 0.02, m, 0, h / 2, -0.15, 0, false, true);
      const n = Math.max(1, Math.round(h / 0.42));
      for (let i = 1; i < n; i++) B.box(w, 0.03, 0.3, m, 0, (h * i) / n, 0);
      for (let i = 0; i < n; i++) {
        const y0 = (h * i) / n + 0.03, sh = h / n - 0.06;
        B.add(G.box(), W.books, M4(-w * 0.18, y0 + sh * 0.42, 0, 0, 0, 0, w * 0.55, sh * 0.82, 0.22), false, true);
        if (deco) { if (i % 2) B.sph(0.06, mat(["#e07a5f", "#81b29a", "#8b7bff"][i % 3]), w * 0.3, y0 + 0.07, 0, 1, 1.2, 1, false, 10); else B.cyl(0.05, 0.14, W.potW, w * 0.3, y0 + 0.07, 0, 10, false); }
      }
    });
  }

  // ── agent cabins
  const keyTex = drawTex(128, 32, (g, w, h) => { g.fillStyle = "#e9ebef"; g.fillRect(0, 0, w, h); g.fillStyle = "#c3c7cf"; for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) g.fillRect(3 + c * 8.3, 3 + r * 7, 6.5, 5); });
  const keyMat = track(new THREE.MeshStandardMaterial({ map: keyTex, roughness: 0.6, envMapIntensity: 0.3 }));
  const glowT = glowTex();
  AGENTS.forEach((a) => {
    const c = CAB[a.id], s = c.s, x0 = c.x0, cz = c.cz, look = LOOK[a.id];
    // desk
    B.rbox(0.82, 0.05, 1.75, W.birch, x0 + 0.55, 0.735, cz, 0, 0.02);
    [-1, 1].forEach((e) => B.box(0.7, 0.71, 0.05, W.white, x0 + 0.55, 0.355, cz + e * 0.8));
    B.box(0.03, 0.4, 1.55, W.white, x0 + 0.2, 0.5, cz, 0, false, true);
    // monitor
    const mz = c.screen.z;
    B.rbox(0.2, 0.02, 0.26, W.dark, x0 + 0.27, 0.77, mz); B.box(0.04, 0.26, 0.05, W.alu, x0 + 0.24, 0.9, mz);
    B.rbox(0.05, 0.46, 0.74, W.dark, x0 + 0.27, 1.09, mz, 0, 0.02);
    const sc = canvas(256, 160), sctx = sc.getContext("2d"), stex = ctex(sc);
    const screen = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: stex, toneMapped: false })));
    screen.position.set(c.screen.x, c.screen.y, mz); screen.rotation.y = Math.PI / 2; screen.scale.set(0.68, 0.41, 1); scene.add(screen);
    const glow = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: glowT, color: look.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.position.set(c.screen.x + 0.35, 1.0, mz); glow.rotation.y = Math.PI / 2; glow.scale.set(1.6, 1.3, 1); glow.renderOrder = 3; scene.add(glow);
    out.screens[a.id] = { canvas: sc, g: sctx, tex: stex, glow, last: -1, working: null };
    if (look.chartScreen) {
      // second monitor stacked above the main one (taller pole), showing live charts
      B.box(0.03, 0.42, 0.04, W.alu, x0 + 0.24, 1.42, mz);
      B.rbox(0.05, 0.4, 0.66, W.dark, x0 + 0.27, 1.56, mz, 0, 0.02);
      const xc = canvas(256, 160), xt = ctex(xc);
      const xs = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: xt, toneMapped: false })));
      xs.position.set(c.screen.x, 1.56, mz); xs.rotation.y = Math.PI / 2; xs.scale.set(0.6, 0.355, 1); scene.add(xs);
      out.screens[a.id].chart = { g: xc.getContext("2d"), tex: xt };
    }
    // keyboard + mouse + mug + mini plant
    B.add(G.rbox(0.16, 0.022, 0.44, 0.008), keyMat, M4(x0 + 0.82, 0.77, mz));
    B.rbox(0.07, 0.025, 0.045, W.white, x0 + 0.8, 0.772, mz - 0.38 * s, 0, 0.012);
    B.cyl(0.04, 0.09, mat(look.accent), x0 + 0.62, 0.805, cz - 0.72 * s, 12);
    B.cyl(0.05, 0.08, W.potW, x0 + 0.35, 0.8, cz - 0.7 * s, 10); B.sph(0.07, W.leaf3, x0 + 0.35, 0.89, cz - 0.7 * s, 1, 0.8, 1, false, 8);
    // tray (dynamic stack)
    const tray = new THREE.Group(); tray.position.set(c.tray.x, c.tray.y, c.tray.z);
    const tm = mat("#3b3f47", { roughness: 0.5 });
    tray.add(place(mesh(G.box(), tm, true, true), 0, 0.005, 0, 0, 0, 0, 0.3, 0.01, 0.24));
    [[0, 0.03, 0.12, 0.3, 0.05, 0.01], [0, 0.03, -0.12, 0.3, 0.05, 0.01], [0.15, 0.03, 0, 0.01, 0.05, 0.24], [-0.15, 0.03, 0, 0.01, 0.05, 0.24]].forEach(([x, y, z, sx, sy, sz]) => tray.add(place(mesh(G.box(), tm), x, y, z, 0, 0, 0, sx, sy, sz)));
    compact(tray); tray.userData.stack = [];
    out.dynamic.add(tray); out.trays[a.id] = tray;
    // chair in agent color
    chair(c.chair.x, c.chair.z, -Math.PI / 2, mat(a.color, { roughness: 0.85 }), false, true);
    // shelf + plant
    if (s > 0) shelf(c.cx + 0.6, -10.78, 0, 1.6, 1.55); else shelf(c.cx + 0.7, 2.75, Math.PI, 1.5, 0.75);
    plant(c.x1 - 0.42, cz - s * 2.25, 1.15, a.id.length % 2 ? "tall" : "bush", [W.terra, W.potW, W.potD][a.id.length % 3]);
    // wall clock / art on back wall for row A
    if (s > 0) {
      B.add(G.cyl(24), W.dark, M4(c.x0 + 0.75, 2.3, -10.98, 0, Math.PI / 2, 0, 0.2, 0.03, 0.2), false);
      B.add(G.cyl(24), W.white, M4(c.x0 + 0.75, 2.3, -10.965, 0, Math.PI / 2, 0, 0.18, 0.02, 0.18), false);
      B.box(0.015, 0.11, 0.01, W.dark, c.x0 + 0.75, 2.34, -10.95, 0, false); B.add(G.box(), W.dark, M4(c.x0 + 0.78, 2.3, -10.95, 0, 0, 1.0, 0.012, 0.08, 0.01), false);
    }
  });

  // ── founder cabin (Hani)
  const fx = -12, fz = -8.3;
  B.rbox(2.1, 0.07, 0.95, W.walnut, fx, 0.75, fz, 0, 0.025);
  B.box(2.0, 0.6, 0.05, W.walnutD, fx, 0.42, fz + 0.43);
  [-1, 1].forEach((e) => B.box(0.5, 0.72, 0.85, W.walnutD, fx + e * 0.78, 0.36, fz));
  B.box(1.9, 0.02, 0.04, W.gold, fx, 0.72, fz + 0.46, 0, false);
  // laptop (screen faces Hani: -z)
  B.rbox(0.48, 0.02, 0.32, W.metal, fx, 0.795, fz - 0.25, 0, 0.01);
  B.add(G.rbox(0.48, 0.32, 0.015, 0.01), W.metal, M4(fx, 0.95, fz - 0.07, 0, -0.25));
  const lscr = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ color: "#8fb4ff", toneMapped: false })));
  lscr.position.set(fx, 0.95, fz - 0.08); lscr.rotation.set(-0.25, Math.PI, 0); lscr.scale.set(0.44, 0.28, 1); scene.add(lscr);
  const logo = mesh(G.sph(10), basic("#ffffff")); place(logo, fx, 0.97, fz - 0.06, 0, 0, 0, 0.02, 0.02, 0.005); logo.rotation.x = -0.25; scene.add(logo);
  signPlane(signTex(`${PEOPLE.founder.name} · ${PEOPLE.founder.role}`, null, { w: 512, h: 112, gradBg: true, color: "#ffffff", size: 48 }), 0.62, 0.14, fx, 0.6, fz + 0.48);
  // desk lamp
  B.cyl(0.08, 0.02, W.dark, fx + 0.85, 0.79, fz - 0.25, 12); B.add(G.cyl(8), W.dark, M4(fx + 0.85, 1.0, fz - 0.2, 0, 0.3, 0, 0.012, 0.42, 0.012));
  B.add(G.cone(14), mat("#e8b931", { roughness: 0.4 }), M4(fx + 0.85, 1.2, fz - 0.1, 0, -0.9, 0, 0.09, 0.12, 0.09));
  // exec chair (high back, leather) facing +z
  B.at(fx, -9.0, 0, () => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; B.add(G.box(), W.dark, M4(Math.sin(a) * 0.17, 0.06, Math.cos(a) * 0.17, a, 0, 0, 0.05, 0.04, 0.34)); }
    B.cyl(0.035, 0.3, W.alu, 0, 0.24, 0, 10);
    B.rbox(0.62, 0.12, 0.58, W.leatherD, 0, 0.45, 0.02, 0, 0.05);
    B.add(G.rbox(0.6, 0.95, 0.14, 0.06), W.leatherD, M4(0, 1.0, -0.3, 0, -0.1));
    [-1, 1].forEach((sd) => B.rbox(0.09, 0.08, 0.46, W.leatherD, sd * 0.33, 0.66, 0.0, 0, 0.03));
  });
  shelf(fx, -10.78, 0, 2.4, 2.1, W.walnut, false);
  // trophy on shelf
  const trophy = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.09, 0.03], [0.03, 0.05], [0.025, 0.14], [0.09, 0.2], [0.11, 0.32], [0, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 20); track(trophy);
  B.add(trophy, W.gold, M4(fx + 0.6, 2.13, -10.75), true);
  B.add(G.tor(0.05, 0.012, Math.PI, 6, 10), W.gold, M4(fx + 0.71, 2.39, -10.75, 0, 0, -Math.PI / 2));
  B.add(G.tor(0.05, 0.012, Math.PI, 6, 10), W.gold, M4(fx + 0.49, 2.39, -10.75, 0, 0, Math.PI / 2));
  // leather sofa along left wall facing +x
  B.at(-14.45, -8.3, Math.PI / 2, () => {
    B.rbox(2.3, 0.3, 0.85, W.leather, 0, 0.25, 0, 0, 0.08);
    [-0.56, 0.56].forEach((x) => B.rbox(1.08, 0.16, 0.7, W.leather, x, 0.47, 0.05, 0, 0.07));
    B.add(G.rbox(2.3, 0.55, 0.22, 0.09), W.leather, M4(0, 0.65, -0.34, 0, -0.12));
    [-1, 1].forEach((e) => B.rbox(0.2, 0.55, 0.85, W.leather, e * 1.2, 0.42, 0, 0, 0.08));
    B.rbox(0.36, 0.3, 0.12, mat("#8b7bff"), -0.7, 0.66, -0.12, 0.2, 0.06);
  });
  B.cyl(0.25, 0.5, W.walnut, -14.4, 0.25, -6.6, 16); B.cyl(0.04, 0.3, W.white, -14.4, 0.65, -6.6, 10); B.add(G.cone(14), mat("#fff3dc", { emissive: "#ffcf8a", emissiveIntensity: 0 }), M4(-14.4, 0.9, -6.6, 0, 0, 0, 0.14, 0.18, 0.14));
  plant(-9.5, -10.5, 1.4, "tall", W.potD); plant(-14.45, -10.5, 1.1, "snake", W.potW);
  out.hani = { x: fx, z: -9.0, seatY: 0.51, mugHome: new THREE.Vector3(fx - 0.42, 0.785, fz - 0.3) };
  const hmug = new THREE.Group(); hmug.add(mesh(G.cyl(14), mat("#ffffff"), true), mesh(G.tor(0.025, 0.007, Math.PI * 2, 5, 10), mat("#ffffff")));
  hmug.children[0].scale.set(0.04, 0.09, 0.04); hmug.children[0].position.y = 0.045; hmug.children[1].position.set(0.045, 0.05, 0); hmug.children[1].rotation.y = 0;
  hmug.position.copy(out.hani.mugHome); out.dynamic.add(hmug); out.hani.mug = hmug;

  // ── manager office (Muffy)
  const mx = MANAGER.deskX, mz = MANAGER.deskZ;
  B.rbox(1.8, 0.06, 0.85, W.birch, mx, 0.75, mz, 0, 0.02);
  B.box(1.7, 0.55, 0.04, W.white, mx, 0.45, mz + 0.4);
  signPlane(signTex(`${PEOPLE.manager.name} · ${PEOPLE.manager.role}`, null, { w: 512, h: 112, bg: "#d7262c", color: "#ffffff", size: 48 }), 0.62, 0.14, mx, 0.58, mz + 0.425);
  [-1, 1].forEach((e) => B.box(0.05, 0.72, 0.8, W.white, mx + e * 0.85, 0.36, mz));
  // open laptop facing Muffy (screen toward -z), like Hani's
  const lx = mx - 0.28, lzz = mz - 0.24;
  B.rbox(0.46, 0.02, 0.3, W.metal, lx, 0.79, lzz, 0, 0.01);
  B.add(G.rbox(0.46, 0.3, 0.015, 0.01), W.metal, M4(lx, 0.94, lzz + 0.16, 0, -0.25));
  const mscr = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: drawTex(160, 100, (g, w, h) => { g.fillStyle = "#f4f6fb"; g.fillRect(0, 0, w, h); g.fillStyle = "#d7262c"; g.fillRect(0, 0, w, 14); g.fillStyle = "#fff"; g.font = "600 9px Inter, sans-serif"; g.fillText("Approvals", 6, 10);
    [24, 42, 60, 78].forEach((y, i) => { g.fillStyle = i ? "#4fd1c5" : "#8b7bff"; g.fillRect(8, y, 10, 10); g.fillStyle = "#c9cdd6"; g.fillRect(24, y + 2, 70 + i * 9, 5); g.fillStyle = i ? "#2fb67a" : "#e8b931"; g.fillRect(136, y, 16, 10); }); }), toneMapped: false })));
  mscr.position.set(lx, 0.94, lzz + 0.15); mscr.rotation.set(-0.25, Math.PI, 0); mscr.scale.set(0.42, 0.26, 1); scene.add(mscr);
  const mlogo = mesh(G.sph(10), basic("#ffffff")); place(mlogo, lx, 0.96, lzz + 0.17, -0.25, 0, 0, 0.02, 0.02, 0.005); scene.add(mlogo);
  // big comfy chair facing +z
  B.at(MANAGER.muffy.x, MANAGER.muffy.z, 0, () => {
    const cm = mat("#2f5d50", { roughness: 0.8 });
    B.cyl(0.3, 0.06, W.dark, 0, 0.04, 0, 16); B.cyl(0.05, 0.25, W.alu, 0, 0.2, 0, 10);
    B.rbox(0.66, 0.16, 0.62, cm, 0, 0.42, 0, 0, 0.07);
    B.add(G.rbox(0.66, 0.85, 0.2, 0.09), cm, M4(0, 0.9, -0.3, 0, -0.1));
    [-1, 1].forEach((sd) => B.rbox(0.13, 0.22, 0.55, cm, sd * 0.37, 0.6, 0, 0, 0.06));
  });
  // visitor chair (facing Muffy)
  const vAng = headingTo(MANAGER.muffy.x - MANAGER.visitor.x, MANAGER.muffy.z - MANAGER.visitor.z);
  MANAGER.visitorHeading = vAng;
  B.at(MANAGER.visitor.x, MANAGER.visitor.z, vAng, () => {
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => B.box(0.04, 0.44, 0.04, W.walnut, x, 0.22, z));
    B.rbox(0.5, 0.06, 0.5, W.walnut, 0, 0.44, 0, 0, 0.02); B.rbox(0.44, 0.04, 0.44, mat("#e8a0bf"), 0, 0.48, 0, 0, 0.02);
    B.add(G.rbox(0.5, 0.36, 0.05, 0.02), W.walnut, M4(0, 0.72, -0.24, 0, -0.1));
  });
  // in-tray + stamp + paper (dynamic)
  B.rbox(0.3, 0.05, 0.24, mat("#3b3f47"), mx + 0.66, 0.8, mz + 0.12, 0, 0.01);
  B.box(0.24, 0.04, 0.2, W.white, mx + 0.66, 0.81, mz + 0.12, 0, false);
  B.rbox(0.16, 0.015, 0.12, mat("#c73a3a"), mx + 0.5, 0.785, mz - 0.02, 0, 0.005);
  const stamp = new THREE.Group();
  stamp.add(place(mesh(G.rbox(0.12, 0.04, 0.08, 0.01), mat("#2b2e35")), 0, 0.02, 0));
  stamp.add(place(mesh(G.cyl(12), mat("#d7262c"), true), 0, 0.08, 0, 0, 0, 0, 0.018, 0.08, 0.018));
  stamp.add(place(mesh(G.sph(12), mat("#d7262c"), true), 0, 0.13, 0, 0, 0, 0, 0.035));
  const stampLbl = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: signTex("APPROVE", null, { w: 256, h: 64, color: "#d7262c", size: 40, bg: "#ffffff", r: 6 }), toneMapped: false })));
  place(stampLbl, 0, 0.022, 0.041, 0, 0, 0, 0.11, 0.028, 1); stamp.add(stampLbl);
  stamp.position.set(mx + 0.34, 0.78, mz - 0.2); out.dynamic.add(stamp);
  const paper = new THREE.Group();
  paper.add(place(mesh(G.box(), mat("#ffffff")), 0, 0.003, 0, 0, 0, 0, 0.21, 0.004, 0.28));
  const approved = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: signTex("APPROVED", null, { w: 256, h: 64, color: "#d7262c", size: 34, weight: 800 }), transparent: true, toneMapped: false })));
  place(approved, 0, 0.007, 0.02, -Math.PI / 2, 0, 0.25, 0.18, 0.045, 1); approved.visible = false; paper.add(approved);
  for (let i = 0; i < 5; i++) paper.add(place(mesh(G.box(), mat("#c9cdd6")), -0.01, 0.006, -0.1 + i * 0.035, 0, 0, 0, 0.15 - (i % 2) * 0.04, 0.002, 0.01));
  paper.position.set(mx - 0.72, 0.78, mz - 0.08); paper.rotation.y = 0.15; out.dynamic.add(paper);
  const envelope = makeEnvelope(); envelope.visible = false; out.dynamic.add(envelope);
  out.muffy = { x: MANAGER.muffy.x, z: MANAGER.muffy.z, seatY: 0.5, stamp, stampHome: stamp.position.clone(), paper, approved, envelope, envSpot: new THREE.Vector3(mx + 0.1, 0.79, mz - 0.18) };
  shelf(-6.25, -10.78, 0, 1.8, 1.55);
  plant(-8.5, -10.5, 1.2, "bush", W.potW); plant(-3.95, -10.5, 1.0, "snake", W.terra);
  // chart on manager back wall
  signPlane(drawTex(256, 160, (g, w, h) => { g.fillStyle = "#ffffff"; rr(g, 0, 0, w, h, 12); g.fill(); g.fillStyle = "#1b1d2b"; g.font = "600 18px Inter, sans-serif"; g.fillText("Team goals", 16, 28); [50, 80, 64, 110, 96, 130].forEach((v, i) => { const gr = g.createLinearGradient(0, h - 14 - v, 0, h - 14); gr.addColorStop(0, ["#8b7bff", "#4fd1c5", "#ff8fb1"][i % 3]); gr.addColorStop(1, "#eef0f6"); g.fillStyle = gr; g.fillRect(22 + i * 36, h - 14 - v, 24, v); }); }), 1.0, 0.62, -7.6, 2.05, -10.98, 0, false);

  // ── meeting room
  B.at(4.8, 0.25, 0, () => {
    B.add(G.cyl(32), W.white, M4(0, 0.74, 0, 0, 0, 0, 1.6, 0.05, 0.85)); B.cyl(0.12, 0.7, W.alu, -0.8, 0.36, 0, 12); B.cyl(0.12, 0.7, W.alu, 0.8, 0.36, 0, 12);
    [[-1, -1.25], [0, -1.3], [1, -1.25], [-1, 1.25], [0, 1.3], [1, 1.25]].forEach(([x, z]) => chair(x, z, z > 0 ? Math.PI : 0, mat("#cfd6e6", { roughness: 0.85 })));
    chair(-1.85, 0, Math.PI / 2, mat("#8b7bff", { roughness: 0.85 }));
  });
  B.box(0.06, 1.0, 0.06, W.dark, 4.8, 0.5, -2.3); B.rbox(2.0, 1.15, 0.06, W.dark, 4.8, 1.55, -2.32, 0, 0.02);
  signPlane(drawTex(320, 180, (g, w, h) => { g.fillStyle = "#11131c"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2f3f7"; g.font = "600 18px Inter, sans-serif"; g.fillText("Pipeline this week", 18, 30); const pts = [20, 34, 30, 52, 60, 58, 84, 96, 120]; g.strokeStyle = "#8b7bff"; g.lineWidth = 4; g.beginPath(); pts.forEach((v, i) => g.lineTo(20 + i * 35, h - 20 - v)); g.stroke(); g.fillStyle = "#4fd1c5"; pts.forEach((v, i) => { g.beginPath(); g.arc(20 + i * 35, h - 20 - v, 4, 0, 7); g.fill(); }); }), 1.9, 1.05, 4.8, 1.55, -2.285, 0, false);
  plant(1.6, 2.6, 1.0, "bush", W.potW); plant(8.0, -2.1, 1.1, "tall", W.potD);

  // ── nook between the meeting room and Sherlock's cabin: printer + armchair + plants
  B.at(9.4, -1.75, -Math.PI / 2, () => { B.rbox(0.8, 0.75, 0.55, W.white, 0, 0.375, 0, 0, 0.03); B.rbox(0.6, 0.18, 0.45, mat("#d6d9df"), 0, 0.84, 0, 0, 0.03); B.box(0.4, 0.02, 0.3, W.white, 0, 0.94, 0); });
  B.at(9.45, 0.55, Math.PI / 2, () => {
    const cm = mat("#e8a0bf", { roughness: 0.85 });
    B.rbox(0.8, 0.3, 0.75, cm, 0, 0.3, 0, 0, 0.1); B.add(G.rbox(0.8, 0.5, 0.18, 0.08), cm, M4(0, 0.62, -0.3, 0, -0.15)); [-1, 1].forEach((e) => B.rbox(0.16, 0.4, 0.72, cm, e * 0.4, 0.42, 0, 0, 0.07));
    [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([a, b]) => B.cyl(0.02, 0.15, W.walnut, a, 0.075, b, 6, false));
  });
  plant(9.0, 2.6, 1.0, "bush", W.potD); plant(14.4, -4.9, 1.2, "bush", W.potW); plant(-13.9, -4.9, 1.0, "snake", W.terra);

  // ── water cooler (corridor, left end)
  B.at(-14.5, -3.0, 0, () => {
    B.rbox(0.42, 0.95, 0.4, W.white, 0, 0.475, 0, 0, 0.04);
    B.cyl(0.17, 0.42, track(new THREE.MeshStandardMaterial({ color: "#8fd3ff", transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false })), 0, 1.18, 0, 18);
    B.cyl(0.09, 0.05, mat("#5aa9e6"), 0, 0.98, 0, 12);
    B.box(0.04, 0.05, 0.04, mat("#4f8de0"), -0.08, 0.72, 0.21); B.box(0.04, 0.05, 0.04, mat("#e05a5a"), 0.08, 0.72, 0.21);
  });

  // ── nap lounge: beds, cat tree, lamp
  const bedTex = drawTex(64, 64, (g, w, h) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,.06)"; for (let i = 0; i < w; i += 8) g.fillRect(i, 0, 3, h); });
  BEDS.forEach((b, i) => {
    const color = LOOK[AGENTS[i].id].bed;
    const rim = track(new THREE.MeshStandardMaterial({ color, map: bedTex, roughness: 0.95, envMapIntensity: 0.2 }));
    B.add(G.tor(0.43, 0.14, Math.PI * 2, 10, 28), rim, M4(b.x, 0.12, b.z, 0, Math.PI / 2, 0, 1, 1, 0.75));
    B.cyl(0.45, 0.1, mat(shade(color, 0.55), { roughness: 1 }), b.x, 0.06, b.z, 24);
    B.cyl(0.36, 0.04, mat(shade(color, 0.75), { roughness: 1 }), b.x, 0.12, b.z, 24, false);
    out.pick["bed" + i] = b;
  });
  // cat tree
  B.at(-13.5, 5.3, 0.3, () => {
    const sisal = track(new THREE.MeshStandardMaterial({ map: drawTex(32, 64, (g, w, h) => { g.fillStyle = "#c9a878"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(90,60,30,.35)"; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5); }, [1, 6]), roughness: 1, envMapIntensity: 0.2 }));
    const plush = mat("#b5a1e0", { roughness: 1 }), plush2 = mat("#e9dfcf", { roughness: 1 });
    B.rbox(1.3, 0.12, 1.0, plush2, 0, 0.06, 0, 0, 0.05);
    B.cyl(0.08, 1.4, sisal, -0.35, 0.8, -0.2, 14); B.cyl(0.08, 2.0, sisal, 0.35, 1.1, 0.2, 14);
    B.cyl(0.42, 0.08, plush, -0.35, 1.52, -0.2, 22); B.cyl(0.38, 0.08, plush, 0.35, 2.12, 0.2, 22);
    B.rbox(0.6, 0.5, 0.55, plush2, 0.25, 0.4, 0.05, 0, 0.08);
    B.cyl(0.14, 0.02, mat("#5a4636"), 0.25, 0.4, 0.33, 18, false);
    B.sph(0.07, mat("#ff8fb1"), -0.65, 1.1, -0.2, 1, 1, 1, true, 10); B.box(0.008, 0.38, 0.008, W.dark, -0.65, 1.3, -0.2, 0, false);
  });
  // floor lamp
  B.cyl(0.2, 0.03, W.dark, -13.0, 0.015, 10.55, 18); B.cyl(0.02, 1.6, W.dark, -13.0, 0.8, 10.55, 8);
  const shadeMat = mat("#fff2da", { emissive: "#ffcf8a", emissiveIntensity: 0, roughness: 0.9 });
  B.cyl(0.24, 0.32, shadeMat, -13.0, 1.72, 10.55, 22, false, 0.3);
  // lounge extras
  plant(-14.4, 10.55, 1.3, "tall", W.potW); plant(-1.2, 10.4, 1.2, "bush", W.terra); plant(-14.4, 3.4, 0.9, "snake", W.potD);
  B.rbox(0.9, 0.35, 0.55, mat("#81b29a"), -1.9, 0.18, 9.7, 0.6, 0.12); // floor pouf
  B.sph(0.09, mat("#ff8fb1"), -4.4, 0.09, 9.9, 1, 1, 1, true, 10); B.sph(0.07, mat("#4fd1c5"), -9.9, 0.07, 10.1, 1, 1, 1, true, 10); // toy balls

  // ── milk bar (cat-height counter, saucers on a low ledge)
  const cx0 = COFFEE.x0, cx1 = COFFEE.x1, cz = COFFEE.counterZ, ch = COFFEE.h, lh = COFFEE.ledge;
  const counterM = mat("#f6f1ea", { roughness: 0.5 }), counterTop = mat("#9fd3e8", { roughness: 0.4 });
  B.rbox(cx1 - cx0, ch - 0.04, 0.6, counterM, (cx0 + cx1) / 2, (ch - 0.04) / 2, cz, 0, 0.02);
  B.rbox(cx1 - cx0 + 0.1, 0.05, 0.68, counterTop, (cx0 + cx1) / 2, ch - 0.02, cz, 0, 0.015);
  for (let x = cx0 + 0.3; x < cx1 - 0.2; x += 0.55) B.box(0.02, ch - 0.12, 0.01, mat("#cfe6ef"), x, (ch - 0.04) / 2, cz + 0.305, 0, false);
  const glassM = track(new THREE.MeshStandardMaterial({ color: "#e6f6ff", transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.5, depthWrite: false }));
  const milk = mat("#fbfbf7", { roughness: 0.35 }), chrome = mat("#cfd5dd", { metalness: 0.85, roughness: 0.22, envMapIntensity: 1.2 });
  // glass milk dispenser with tap
  const dx = cx1 - 0.65;
  B.cyl(0.2, 0.04, chrome, dx, ch + 0.02, cz - 0.02, 20);
  B.cyl(0.17, 0.32, milk, dx, ch + 0.2, cz - 0.02, 20, true);
  B.cyl(0.19, 0.42, glassM, dx, ch + 0.25, cz - 0.02, 20, false);
  B.cyl(0.2, 0.04, chrome, dx, ch + 0.48, cz - 0.02, 20); B.sph(0.035, chrome, dx, ch + 0.52, cz - 0.02, 1, 1, 1, false, 10);
  B.box(0.04, 0.04, 0.12, chrome, dx, ch + 0.08, cz + 0.2, 0, false); B.box(0.07, 0.03, 0.03, mat("#3d7be0"), dx, ch + 0.11, cz + 0.25, 0, false);
  // milk bottles
  [[cx0 + 0.3, -0.1], [cx0 + 0.48, 0.02], [cx0 + 0.66, -0.12]].forEach(([x, dz], i) => {
    B.cyl(0.07, 0.2, milk, x, ch + 0.1, cz + dz, 14); B.cyl(0.075, 0.24, glassM, x, ch + 0.12, cz + dz, 14, false);
    B.cyl(0.04, 0.06, glassM, x, ch + 0.27, cz + dz, 12, false, 0.06); B.cyl(0.042, 0.03, mat(["#3d7be0", "#ff8fb1", "#e8b931"][i]), x, ch + 0.31, cz + dz, 12);
  });
  // a small jug + spare saucers stack
  B.cyl(0.06, 0.12, mat("#9fd3e8"), cx1 - 1.3, ch + 0.06, cz - 0.1, 14); B.cyl(0.045, 0.01, milk, cx1 - 1.3, ch + 0.12, cz - 0.1, 14, false);
  for (let i = 0; i < 3; i++) B.cyl(0.12, 0.018, W.white, cx0 + 1.1, ch + 0.012 + i * 0.02, cz - 0.08, 18);
  signPlane(signTex("MILK BAR", null, { w: 384, h: 96, color: "#3d7be0", bg: "rgba(255,255,255,.96)", size: 50, weight: 800 }), 0.9, 0.23, (cx0 + cx1) / 2 + 0.6, ch - 0.25, cz + 0.312, 0);
  B.box(0.03, 0.42, 0.03, W.dark, (cx0 + cx1) / 2 - 0.4, ch + 0.21, cz - 0.15, 0, false);
  signPlane(signTex("MILK BAR", "fresh · cold · free", { w: 384, h: 140, color: "#3d7be0", bg: "rgba(255,255,255,.97)", size: 54, weight: 800 }), 0.8, 0.29, (cx0 + cx1) / 2 - 0.4, ch + 0.52, cz - 0.13, 0);
  // saucer ledge
  B.rbox(cx1 - cx0 - 0.3, lh, 0.42, mat("#c9a27a", { roughness: 0.6 }), (cx0 + cx1) / 2 - 0.15, lh / 2, cz + 0.52, 0, 0.03);
  const saucer = mat("#ffffff", { roughness: 0.3 });
  COFFEE.spots.forEach((sp, i) => {
    B.cyl(0.13, 0.025, saucer, sp.x, lh + 0.012, cz + 0.52, 20, true, 0.1);
    B.cyl(0.105, 0.006, milk, sp.x, lh + 0.026, cz + 0.52, 20, false);
    B.add(G.tor(0.12, 0.008, Math.PI * 2, 5, 22), mat(["#4fd1c5", "#ff8fb1", "#f2cc8f"][i]), M4(sp.x, lh + 0.025, cz + 0.52, 0, Math.PI / 2), false);
  });

  // ── cat food bar (left wall, beside the nap lounge)
  const fbx = FOOD.x, wood = mat("#c9a27a", { roughness: 0.6 });
  B.rbox(0.5, 0.06, 2.6, wood, fbx, 0.03, 8.05, 0, 0.02);
  const bowlM = [mat("#e07a5f"), mat("#81b29a"), mat("#6d9dc5")], kib = mat("#a8693a", { roughness: 0.8 }), kib2 = mat("#7d4a26", { roughness: 0.8 });
  FOOD.spots.forEach((sp, i) => {
    B.cyl(0.15, 0.08, bowlM[i], fbx + 0.05, 0.1, sp.z, 20, true, 0.11);
    B.cyl(0.125, 0.01, kib2, fbx + 0.05, 0.135, sp.z, 18, false);
    const r = rng(77 + i);
    for (let k = 0; k < 14; k++) { const a = r() * 7, d = r() * 0.09; B.sph(0.018, k % 3 ? kib : kib2, fbx + 0.05 + Math.cos(a) * d, 0.145 + r() * 0.015, sp.z + Math.sin(a) * d, 1, 0.7, 1, false, 6); }
  });
  // food bag + kibble dispenser + sign
  const bagTex = drawTex(128, 192, (g, w, h) => { g.fillStyle = "#e8b931"; rr(g, 0, 0, w, h, 14); g.fill(); g.fillStyle = "#ffffff"; g.font = "800 26px Inter, sans-serif"; g.textAlign = "center"; g.fillText("CAT", w / 2, 60); g.fillText("FOOD", w / 2, 90);
    g.fillStyle = "#a8693a"; [[64, 140, 18], [44, 118, 8], [58, 112, 8], [72, 112, 8], [86, 118, 8]].forEach(([x, y, rd]) => { g.beginPath(); g.arc(x, y, rd, 0, 7); g.fill(); }); });
  B.add(G.rbox(0.36, 0.55, 0.22, 0.06), track(new THREE.MeshStandardMaterial({ map: bagTex, roughness: 0.7, envMapIntensity: 0.3 })), M4(fbx + 0.02, 0.3, 6.35, Math.PI / 2, 0, 0.05), true, true);
  B.rbox(0.3, 0.12, 0.3, W.dark, fbx, 0.06, 9.75, 0, 0.03); B.cyl(0.12, 0.42, glassM, fbx, 0.33, 9.75, 16, false); B.cyl(0.1, 0.3, kib, fbx, 0.28, 9.75, 14, false); B.cyl(0.13, 0.05, mat("#e07a5f"), fbx, 0.56, 9.75, 16);
  B.box(0.03, 0.75, 0.03, W.dark, fbx - 0.05, 0.375, 7.6, 0, false); B.box(0.03, 0.75, 0.03, W.dark, fbx - 0.05, 0.375, 8.5, 0, false);
  signPlane(signTex("CAT FOOD", "snacks after work", { w: 384, h: 140, color: "#b0602f", bg: "rgba(255,255,255,.97)", size: 54, weight: 800 }), 1.05, 0.38, fbx - 0.03, 0.95, 8.05, Math.PI / 2);
  // round table + stools
  const TX = 9.6, TZ = 8.4;
  B.cyl(0.5, 0.05, W.white, TX, 0.72, TZ, 28); B.cyl(0.05, 0.7, W.dark, TX, 0.36, TZ, 10); B.cyl(0.3, 0.03, W.dark, TX, 0.015, TZ, 16);
  [[0.9, 0], [-0.9, 0], [0, 0.9]].forEach(([dx, dz]) => { B.cyl(0.2, 0.06, mat("#f2cc8f"), TX + dx, 0.52, TZ + dz, 18); B.cyl(0.03, 0.5, W.dark, TX + dx, 0.25, TZ + dz, 8); B.cyl(0.18, 0.02, W.dark, TX + dx, 0.01, TZ + dz, 14); });
  B.cyl(0.08, 0.12, mat("#ffffff"), TX - 0.15, 0.81, TZ - 0.1, 12); B.sph(0.08, W.leaf3, TX + 0.15, 0.83, TZ + 0.1, 1, 0.8, 1, true, 8);
  B.at(12.6, 7.4, -0.5, () => { const cm = mat("#81b29a", { roughness: 0.85 }); B.rbox(2.0, 0.32, 0.8, cm, 0, 0.3, 0, 0, 0.1); B.add(G.rbox(2.0, 0.5, 0.2, 0.08), cm, M4(0, 0.62, -0.32, 0, -0.15)); [-1, 1].forEach((e) => B.rbox(0.18, 0.42, 0.8, cm, e * 1.0, 0.42, 0, 0, 0.08)); B.rbox(0.36, 0.3, 0.12, mat("#f2cc8f"), -0.55, 0.62, -0.18, 0, 0.06); });
  // water cooler #2 + plants + bench in front-right
  plant(14.4, 10.4, 1.5, "tall", W.potD); plant(1.0, 10.4, 1.2, "bush", W.potW); plant(14.4, 4.6, 1.0, "snake", W.terra); plant(11.0, 4.5, 0.8, "bush", W.potD); plant(10.6, 10.5, 1.0, "bush", W.terra);
  B.rbox(2.0, 0.42, 0.55, W.walnut, 5.2, 0.21, 10.4, 0, 0.04); B.rbox(1.9, 0.08, 0.5, mat("#81b29a"), 5.2, 0.46, 10.4, 0, 0.04);

  // ── lamps (evening lights)
  const glowMat = (c) => track(new THREE.SpriteMaterial({ map: glowT, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  [[-13.0, 1.72, 10.55, 7, 3.2], [-12, 2.5, -8.0, 6, 3.5], [3.6, 2.2, 6.4, 7, 3.0], [-6.3, 2.5, -8.0, 6, 3.0]].forEach(([x, y, z, d, s]) => {
    const l = new THREE.PointLight("#ffc98a", 0, d, 1.6); l.position.set(x, y, z); scene.add(l); out.lampLights.push(l);
    const sp = new THREE.Sprite(glowMat("#ffcf8a")); sp.position.set(x, y, z); sp.scale.set(s * 0.5, s * 0.5, 1); scene.add(sp); out.lampGlows.push(sp);
  });
  out.bulbMat = mat("#fff6e0", { emissive: "#ffd79a", emissiveIntensity: 0.2 });
  out.shadeMat = shadeMat;

  B.build(scene);
  // invisible pick volume over the manager office
  const vol = mesh(G.box(), basic("#fff")); vol.visible = false; place(vol, -6.25, 1.2, -8.25, 0, 0, 0, 5.4, 2.4, 5.4); scene.add(vol);
  vol.userData.pick = { kind: "manager" }; out.pick.managerVolume = vol;
  const mvol = mesh(G.box(), basic("#fff")); mvol.visible = false; place(mvol, 4.8, 1.2, 0.25, 0, 0, 0, 7.2, 2.4, 5.5); scene.add(mvol);
  mvol.userData.pick = { kind: "meeting" }; out.pick.meetingVolume = mvol;
  return out;
}

function makeEnvelope() {
  const g = new THREE.Group();
  g.add(place(mesh(G.box(), mat("#f6efe2"), true), 0, 0, 0, 0, 0, 0, 0.16, 0.012, 0.11));
  const flap = mesh(G.cone(3), mat("#e9dcc6")); place(flap, 0, 0.007, -0.02, Math.PI / 2, 0, 0, 0.07, 0.07, 0.003); flap.rotation.set(-Math.PI / 2, Math.PI / 3, 0); flap.scale.set(0.09, 0.08, 0.004);
  g.add(flap);
  g.add(place(mesh(G.cyl(10), mat("#d7262c")), 0, 0.008, 0.0, 0, 0, 0, 0.014, 0.004, 0.014));
  return g;
}
function makeFolder(color) {
  const g = new THREE.Group();
  g.add(place(mesh(G.box(), mat(color), true), 0, 0, 0, 0, 0, 0, 0.17, 0.014, 0.12));
  g.add(place(mesh(G.box(), mat("#ffffff")), 0.01, 0.008, -0.004, 0, 0, 0, 0.15, 0.004, 0.105));
  g.add(place(mesh(G.box(), mat(color)), -0.05, 0.004, -0.064, 0, 0, 0, 0.05, 0.012, 0.012));
  return compact(g);
}

// ───────────────────────── cats ─────────────────────────
const POSE_KEYS = ["pY", "pZ", "pP", "pYaw", "cY", "cZ", "cP", "cYaw", "roll", "nP", "hP", "hYaw", "hRoll", "tUp", "tCurve", "tSide", "tSway", "tFreq", "earL", "earR", "eye", "sleep",
  "flz", "fly", "frz", "fry", "blz", "bly", "brz", "bry", "lift"];
const STAND = { pY: 0.245, pZ: -0.16, pP: 0, pYaw: 0, cY: 0.275, cZ: 0.16, cP: 0, cYaw: 0, roll: 0, nP: 0, hP: 0, hYaw: 0, hRoll: 0, tUp: 0.55, tCurve: 0.1, tSide: 0, tSway: 0.22, tFreq: 1.6, earL: 0, earR: 0, eye: 1, sleep: 0,
  flz: 0.2, fly: 0.025, frz: 0.2, fry: 0.025, blz: -0.15, bly: 0.025, brz: -0.15, bry: 0.025, lift: 0 };
const FOOT_Y = 0.025;
const CS = 1.15; // cat body scale
const frac = (x) => x - Math.floor(x);

class Cat {
  constructor(def, idx, W) {
    this.def = def; this.id = def.id; this.idx = idx; this.look = LOOK[def.id]; this.W = W;
    this.root = new THREE.Group(); this.root.userData.pick = { kind: "cat", id: def.id };
    this.pos = { x: 0, z: 0 }; this.y = 0; this.heading = 0; this.v = 0; this.phase = Math.random();
    this.pose = { ...STAND }; this.snap = { ...STAND }; this.mode = "stand"; this.blendT = 1; this.blendDur = 0.3;
    this.act = null; this.node = null; this.speakUntil = -1; this.carryQueue = []; this.needsCoffee = false; this.needsFood = false; this.wakeAt = 0; this.forceDeskUntil = 0;
    this.prop = null; this.propKind = null; this.blink = 0; this.nextBlink = 1 + Math.random() * 3; this.earTw = [0, 0]; this.nextEar = 2 + Math.random() * 5;
    this.look2 = { t: 0, yaw: 0, next: 3 }; this.walkV = 0; this.status = "Napping"; this.location = "bed";
    this.build();
  }
  build() {
    const d = this.def, L = this.look, R = this.root;
    const pointLegs = d.id === "inbox";
    const bodyMap = furBodyTex(d, L, this.idx * 31 + 7), headMap = furHeadTex(d, L);
    const fm = (map) => track(new THREE.MeshStandardMaterial({ map, roughness: 0.92, envMapIntensity: 0.3 }));
    const fur = fm(bodyMap), furHead = fm(headMap);
    const legU = fm(legTex(d, L, false && pointLegs)), legL = fm(legTex(d, { ...L, pattern: pointLegs ? "points" : L.pattern === "points" ? "solid" : L.pattern }, true));
    if (L.pattern === "points" && !pointLegs) { legU.map = legTex(d, { ...L, pattern: "solid" }, false); }
    const pawMat = mat(pointLegs ? L.dark : L.pattern === "patches" ? "#ffffff" : d.color, { roughness: 0.9 });
    const pink = mat("#f3a3b2", { roughness: 0.8 });
    const bellyMat = mat(L.pattern === "points" ? shade(d.color, 0.35) : L.belly, { roughness: 0.95 });
    const muzzleMat = mat(L.pattern === "points" ? shade(L.dark, 0.08) : L.pattern === "solid" ? shade(d.color, 0.06) : L.belly, { roughness: 0.9 });
    const dark = mat("#17171b", { roughness: 0.4 });
    this.mats = { fur, furHead };
    const body = new THREE.Group(); R.add(body); this.body = body;
    // pelvis
    const pelvis = new THREE.Group(); pelvis.rotation.order = "YXZ"; body.add(pelvis); this.pelvis = pelvis;
    pelvis.add(place(mesh(G.bodySph(), fur, true), 0, 0, 0, 0, 0, 0, 0.125, 0.12, 0.135));
    [-1, 1].forEach((s) => pelvis.add(place(mesh(G.sph(14), fur, true), s * 0.072, -0.025, -0.01, 0, 0, 0, 0.062, 0.09, 0.098)));
    // chest
    const chest = new THREE.Group(); chest.rotation.order = "YXZ"; body.add(chest); this.chest = chest;
    chest.add(place(mesh(G.bodySph(), fur, true), 0, 0, 0, 0, 0, 0, 0.112, 0.125, 0.125));
    chest.add(place(mesh(G.sph(14), bellyMat), 0, -0.035, 0.075, 0, 0, 0, 0.075, 0.085, 0.06));
    // belly (spans pelvis→chest)
    const belly = mesh(G.bodySph(), fur, true); belly.rotation.order = "YXZ"; body.add(belly); this.belly = belly;
    // legs
    const leg = (parent, x, y, z, L1, L2, r1, r2, front) => {
      const hip = new THREE.Group(); hip.position.set(x, y, z); parent.add(hip);
      hip.add(place(mesh(G.cap(r1, L1, 8), legU, true), 0, -L1 / 2, 0));
      const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
      knee.add(place(mesh(G.cap(r2, L2, 8), legL, true), 0, -L2 / 2, 0));
      const paw = new THREE.Group(); paw.position.y = -L2; knee.add(paw);
      paw.add(place(mesh(G.sph(12), pawMat, true), 0, -0.004, 0.012, 0, 0, 0, r2 * 1.3, r2 * 0.9, r2 * 1.4));
      return { hip, knee, paw, L1, L2, front, group: parent };
    };
    this.legs = {
      fl: leg(chest, 0.062, -0.07, 0.03, 0.105, 0.105, 0.042, 0.033, true),
      fr: leg(chest, -0.062, -0.07, 0.03, 0.105, 0.105, 0.042, 0.033, true),
      bl: leg(pelvis, 0.07, -0.05, 0.0, 0.125, 0.125, 0.05, 0.035, false),
      br: leg(pelvis, -0.07, -0.05, 0.0, 0.125, 0.125, 0.05, 0.035, false),
    };
    // neck + head
    const neck = new THREE.Group(); neck.position.set(0, 0.06, 0.075); chest.add(neck); this.neck = neck;
    neck.add(place(mesh(G.cap(0.058, 0.07, 10), fur, true), 0, 0.045, 0.02, 0.55));
    const head = new THREE.Group(); head.position.set(0, 0.11, 0.055); head.rotation.order = "YXZ"; neck.add(head); this.head = head;
    head.add(place(mesh(G.sph(24), furHead, true), 0, 0, 0, 0, 0, 0, 0.128, 0.114, 0.118));
    [-1, 1].forEach((s) => head.add(place(mesh(G.sph(14), furHead), s * 0.068, -0.038, 0.025, 0, 0, 0, 0.06, 0.05, 0.06)));
    [-1, 1].forEach((s) => head.add(place(mesh(G.sph(12), muzzleMat), s * 0.024, -0.043, 0.098, 0, 0, 0, 0.032, 0.025, 0.026)));
    head.add(place(mesh(G.sph(10), muzzleMat), 0, -0.066, 0.083, 0, 0, 0, 0.026, 0.02, 0.024));
    head.add(place(mesh(G.cone(3), mat(L.nose, { roughness: 0.4 })), 0, -0.021, 0.118, Math.PI, 0, 0, 0.017, 0.014, 0.01));
    const mouthM = mat(L.pattern === "solid" ? "#55484d" : "#6b4f4f");
    [-1, 1].forEach((s) => head.add(place(mesh(G.tor(0.011, 0.0022, Math.PI, 4, 8), mouthM), s * 0.011, -0.05, 0.121, 0, 0, Math.PI)));
    // eyes
    const eyesG = new THREE.Group(); eyesG.position.set(0, 0.014, 0); head.add(eyesG); this.eyesG = eyesG;
    const closedG = new THREE.Group(); closedG.visible = false; head.add(closedG); this.closedG = closedG;
    const irisM = mat(L.eye, { roughness: 0.2, emissive: L.eye, emissiveIntensity: 0.25, envMapIntensity: 1 });
    const hl = basic("#ffffff");
    [-1, 1].forEach((s) => {
      const eg = new THREE.Group(); eg.position.set(s * 0.047, 0, 0.097); eg.rotation.y = s * 0.36;
      eg.add(place(mesh(G.sph(16), dark), 0, 0, -0.002, 0, 0, 0, 0.03, 0.031, 0.013));
      eg.add(place(mesh(G.sph(16), irisM), 0, 0, 0.001, 0, 0, 0, 0.027, 0.028, 0.013));
      eg.add(place(mesh(G.sph(10), dark), 0, 0, 0.009, 0, 0, 0, 0.009, 0.023, 0.008));
      eg.add(place(mesh(G.sph(8), hl), s * -0.007 + 0.002, 0.011, 0.014, 0, 0, 0, 0.007));
      eg.updateMatrix(); [...eg.children].forEach((m) => { m.applyMatrix4(eg.matrix); eyesG.add(m); });
      closedG.add(place(mesh(G.tor(0.02, 0.0035, Math.PI, 4, 10), dark), s * 0.047, 0.006, 0.108, 0, s * 0.36, Math.PI));
    });
    compact(eyesG); compact(closedG);
    // ears
    this.ears = [];
    const earM = (s) => mat(L.pattern === "points" ? L.dark : L.pattern === "patches" && s > 0 ? L.dark : d.color, { roughness: 0.9 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Group(); e.position.set(s * 0.063, 0.078, -0.012); e.rotation.order = "ZXY"; head.add(e);
      e.add(place(mesh(G.cone(10), earM(s), true), 0, 0.036, 0, 0, 0, 0, 0.05, 0.088, 0.022));
      e.add(place(mesh(G.cone(10), pink), 0, 0.03, 0.011, 0, 0, 0, 0.033, 0.062, 0.008));
      this.ears.push(e);
    });
    // whiskers
    const wp = [];
    [-1, 1].forEach((s) => { for (let k = 0; k < 3; k++) { wp.push(s * 0.045, -0.045 + k * 0.009, 0.108, s * 0.18, -0.06 + k * 0.035, 0.07 - k * 0.005); } });
    const wg = track(new THREE.BufferGeometry()); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    head.add(new THREE.LineSegments(wg, track(new THREE.LineBasicMaterial({ color: ["sender", "checker", "inbox"].includes(d.id) ? "#9a9a9a" : "#f5f5f5", transparent: true, opacity: 0.85 }))));
    // mouth prop anchor
    this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.08, 0.13); head.add(this.mouth);
    this.tongue = place(mesh(G.sph(8), mat("#f07f95", { roughness: 0.5 })), 0, -0.075, 0.118, 0.4, 0, 0, 0.016, 0.006, 0.026); this.tongue.visible = false; head.add(this.tongue);
    this.mouthO = place(mesh(G.sph(10), mat("#5a2f35", { roughness: 0.6 })), 0, -0.06, 0.117, 0, 0, 0, 0.02, 0.012, 0.01); this.mouthO.visible = false; head.add(this.mouthO);
    // tail
    this.tail = [];
    let parent = pelvis; const SEG = 0.058, n = 8;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      if (i === 0) g.position.set(0, 0.045, -0.115); else g.position.z = -SEG;
      parent.add(g);
      let tm = fur;
      if (L.pattern === "tabby") tm = i % 2 ? mat(L.dark, { roughness: 0.9 }) : mat(d.color, { roughness: 0.9 });
      else if (L.pattern === "points") tm = d.id === "inbox" ? (i >= 2 ? mat(L.dark) : mat(shade(L.dark, 0.5))) : (i >= 6 ? mat(L.dark) : mat(d.color, { roughness: 0.9 }));
      else if (L.pattern === "patches") tm = i >= 4 ? mat(L.dark) : mat(d.color);
      else tm = mat(d.color, { roughness: 0.9 });
      const r = lerp(0.031, 0.018, i / (n - 1));
      g.add(place(mesh(G.cap(r, SEG, 7), tm, i < 4), 0, 0, -SEG / 2, Math.PI / 2));
      this.tail.push(g); parent = g;
    }
    // accessories
    this.headItems = [];
    this.buildAccessory();
    compact(pelvis); compact(chest); compact(head); this.headItems.forEach((o) => o.isGroup && compact(o));
    // label + zzz
    this.labelAnchor = new THREE.Object3D(); R.add(this.labelAnchor);
    this.zAnchor = new THREE.Object3D(); R.add(this.zAnchor);
  }
  buildAccessory() {
    const a = this.look.acc, h = this.head, c = this.chest;
    const add = (p, o, onHead = true) => { p.add(o); if (onHead) this.headItems.push(o); return o; };
    if (a === "scarf") {
      const red = mat("#d6453d", { roughness: 0.9 });
      const g = new THREE.Group(); g.position.set(0, 0.065, 0.06); g.rotation.x = 1.0; c.add(g);
      g.add(place(mesh(G.tor(0.07, 0.03, Math.PI * 2, 8, 20), red, true), 0, 0, 0));
      g.add(place(mesh(G.rbox(0.05, 0.13, 0.025, 0.012), red, true), 0.045, -0.02, 0.07, -0.9, 0, 0.2));
      g.add(place(mesh(G.rbox(0.05, 0.1, 0.025, 0.012), red, true), 0.0, -0.02, 0.07, -0.7, 0, -0.25));
      [0.04, 0.0].forEach((x, i) => g.add(place(mesh(G.box(), mat("#ffffff")), x + (i ? 0 : 0.012), -0.005 - i * 0.01, 0.12 - i * 0.02, -0.8, 0, 0, 0.052, 0.012, 0.027)));
    } else if (a === "glasses") {
      const fr = mat("#1d1f24", { roughness: 0.3, metalness: 0.4 });
      const lens = track(new THREE.MeshStandardMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.5 }));
      const g = add(h, new THREE.Group());
      [-1, 1].forEach((s) => {
        g.add(place(mesh(G.tor(0.031, 0.0045, Math.PI * 2, 6, 20), fr), s * 0.048, 0.014, 0.12, 0, s * 0.3, 0));
        g.add(place(mesh(G.cyl(16), lens), s * 0.048, 0.014, 0.12, Math.PI / 2, 0, 0, 0.03, 0.002, 0.03));
        g.add(place(mesh(G.box(), fr), s * 0.098, 0.018, 0.06, 0, s * 0.25, 0, 0.004, 0.005, 0.11));
      });
      g.add(place(mesh(G.tor(0.012, 0.004, Math.PI, 4, 8), fr), 0, 0.016, 0.128));
    } else if (a === "beret") {
      const red = mat("#d33d4b", { roughness: 0.85 });
      const g = add(h, new THREE.Group()); g.position.set(0.02, 0.098, -0.02); g.rotation.set(-0.15, 0, -0.32);
      g.add(place(mesh(G.sph(20), red, true), 0, 0, 0, 0, 0, 0, 0.105, 0.042, 0.1));
      g.add(place(mesh(G.tor(0.075, 0.012, Math.PI * 2, 6, 20), red), 0, -0.018, 0, Math.PI / 2));
      g.add(place(mesh(G.cyl(8), red), 0, 0.045, 0, 0, 0, 0, 0.008, 0.025, 0.008));
    } else if (a === "inverness") {
      // Sherlock: an Inverness-style tweed capelet with a collar, plus a brass magnifying glass while he works
      const tex = drawTex(64, 64, (gg, w, hh) => { gg.fillStyle = "#3f5a48"; gg.fillRect(0, 0, w, hh); gg.fillStyle = "rgba(200,190,150,.28)"; for (let i = 0; i < w; i += 10) { gg.fillRect(i, 0, 2, hh); gg.fillRect(0, i, w, 2); } gg.fillStyle = "rgba(20,30,24,.35)"; for (let i = 5; i < w; i += 10) { gg.fillRect(i, 0, 1, hh); gg.fillRect(0, i, w, 1); } }, [3, 2]);
      const cm = track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: 0.2, side: THREE.DoubleSide }));
      const g = new THREE.Group(); c.add(g); this.cape = g;
      // shoulder cape: upper half-shell over the chest, a little larger than it
      const shell = mesh(track(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)), cm, true);
      place(shell, 0, 0.012, -0.01, -0.12, 0, 0, 0.142, 0.15, 0.158); g.add(shell);
      // turned-up collar around the neck
      g.add(place(mesh(G.tor(0.066, 0.016, Math.PI * 2, 6, 20), cm, true), 0, 0.085, 0.07, 1.05));
      g.add(place(mesh(G.sph(8), W_gold()), 0, 0.03, 0.148, 0, 0, 0, 0.011, 0.011, 0.006));
      this.magnifier = makeMagnifier(1.25); this.legs[this.look.lensPaw ?? "fr"].paw.add(this.magnifier);
    } else if (a === "deerstalker") {
      const tex = drawTex(64, 64, (gg, w, hh) => { gg.fillStyle = "#8a6a45"; gg.fillRect(0, 0, w, hh); gg.fillStyle = "rgba(60,40,20,.45)"; for (let i = 0; i < w; i += 8) { gg.fillRect(i, 0, 3, hh); gg.fillRect(0, i, w, 3); } }, [2, 2]);
      const hm = track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: 0.2 }));
      const g = add(h, new THREE.Group()); g.position.set(0, 0.07, -0.005);
      const cap = mesh(track(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), hm, true); place(cap, 0, 0, 0, 0, 0, 0, 0.098, 0.085, 0.104); g.add(cap);
      g.add(place(mesh(G.sph(14), hm), 0, -0.002, 0.095, 0.35, 0, 0, 0.07, 0.01, 0.05));
      g.add(place(mesh(G.sph(14), hm), 0, -0.002, -0.095, -0.35, 0, 0, 0.07, 0.01, 0.05));
      g.add(place(mesh(G.sph(8), hm), 0, 0.085, 0, 0, 0, 0, 0.013));
      g.add(place(mesh(G.cyl(6), mat("#5a4030")), 0, 0.075, 0, 0, 0, Math.PI / 2, 0.004, 0.17, 0.004));
      // magnifier (shown while working)
      this.magnifier = makeMagnifier(1); this.legs.fr.paw.add(this.magnifier);
    } else if (a === "mailcap") {
      const blue = mat("#2f5fd0", { roughness: 0.6 });
      const g = add(h, new THREE.Group()); g.position.set(0, 0.098, 0.005); g.rotation.x = -0.12;
      g.add(place(mesh(G.cyl(20), blue, true), 0, 0.022, 0, 0, 0, 0, 0.085, 0.05, 0.088));
      g.add(place(mesh(G.cyl(20), mat("#1f3f8a")), 0, 0.0, 0, 0, 0, 0, 0.089, 0.012, 0.091));
      g.add(place(mesh(track(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -Math.PI / 2, Math.PI)), mat("#1d2433", { roughness: 0.4 })), 0, -0.004, 0.06, 0.12, 0, 0, 0.075, 0.008, 0.075));
      g.add(place(mesh(G.sph(8), W_gold()), 0, 0.03, 0.087, 0, 0, 0, 0.014, 0.014, 0.006));
      const sat = new THREE.Group(); c.add(sat); this.satchel = sat;
      const leather = mat("#8a5a3c", { roughness: 0.7 });
      sat.add(place(mesh(G.rbox(0.035, 0.09, 0.1, 0.012), leather, true), 0.118, -0.06, -0.01));
      sat.add(place(mesh(G.rbox(0.038, 0.04, 0.102, 0.01), mat("#6b4430")), 0.12, -0.03, -0.01));
      sat.add(place(mesh(G.tor(0.13, 0.008, Math.PI * 2, 4, 24), leather), 0, 0.0, 0.0, 0, Math.PI / 2, 0.75, 1, 1, 0.82));
    } else if (a === "headset") {
      const hm = mat("#2a2d34", { roughness: 0.4 });
      const g = add(h, new THREE.Group());
      g.add(place(mesh(G.tor(0.128, 0.009, Math.PI, 6, 20), hm), 0, 0.0, -0.01));
      [-1, 1].forEach((s) => { g.add(place(mesh(G.cyl(16), hm, true), s * 0.128, -0.005, -0.01, 0, 0, Math.PI / 2, 0.038, 0.03, 0.038)); g.add(place(mesh(G.cyl(16), mat("#4fd1c5", { emissive: "#4fd1c5", emissiveIntensity: 0.6 })), s * 0.145, -0.005, -0.01, 0, 0, Math.PI / 2, 0.022, 0.006, 0.022)); });
      g.add(place(mesh(G.cyl(6), hm), 0.1, -0.05, 0.06, 0.9, 0.5, 0, 0.005, 0.11, 0.005));
      g.add(place(mesh(G.sph(8), mat("#4fd1c5", { emissive: "#4fd1c5", emissiveIntensity: 0.5 })), 0.06, -0.075, 0.105, 0, 0, 0, 0.014));
    } else if (a === "bell") {
      const g = new THREE.Group(); g.position.set(0, 0.06, 0.06); g.rotation.x = 1.0; c.add(g);
      g.add(place(mesh(G.tor(0.072, 0.012, Math.PI * 2, 6, 22), mat("#3d7be0", { roughness: 0.5 }), true), 0, 0, 0));
      const bell = place(mesh(G.sph(14), W_gold(), true), 0, -0.035, 0.08, 0, 0, 0, 0.024); g.add(bell); this.bell = bell;
      g.add(place(mesh(G.box(), mat("#5a4030")), 0, -0.035, 0.103, 0, 0, 0, 0.02, 0.003, 0.004));
    }
  }

  // ── pose evaluation
  setMode(m, dur = 0.35) { if (m === this.mode) return; Object.assign(this.snap, this.pose); this.mode = m; this.blendT = 0; this.blendDur = dur; }
  target(t, dt) {
    const p = { ...STAND }, A = this.act || {};
    switch (this.mode) {
      case "stand": this.poseWalk(p, t); break;
      case "sit": this.poseSit(p, t, false); break;
      case "type": this.poseSit(p, t, true); break;
      case "sleep": this.poseSleep(p, t); break;
      case "stretch": this.poseStretch(p, t); break;
      case "rear": this.poseRear(p, t, A.rearH ?? 0.76, false); break;
      case "lap": this.poseLap(p, t, A.kind === "food"); break;
      case "crouch": this.poseWalk(p, t); p.pY -= 0.07; p.cY -= 0.08; p.blz += 0.03; p.brz += 0.03; p.tUp = 0.3; break;
    }
    return p;
  }
  poseWalk(p, t) {
    const v = this.walkV, k = clamp(v / 0.7, 0, 1);
    const f = Math.max(v / STRIDE, 1.5); const st = v / f;
    const beta = 0.62, ph = this.phase;
    const legs = [["bl", 0, -0.15, 0.055], ["fl", 0.25, 0.2, 0.07], ["br", 0.5, -0.15, 0.055], ["fr", 0.75, 0.2, 0.07]];
    for (const [n, off, rest, lift] of legs) {
      const q = frac(ph - off); let z, y;
      if (q < beta) { const s = q / beta; z = rest + st * beta * (0.5 - s); y = FOOT_Y; }
      else { const s = (q - beta) / (1 - beta); z = rest + st * beta * (-0.5 + ease(s)); y = FOOT_Y + lift * Math.sin(Math.PI * s) * k; }
      p[n + "z"] = z; p[n + "y"] = y;
    }
    const w = Math.PI * 2;
    p.pY += 0.011 * k * Math.cos(w * 2 * ph) - 0.012 * k; p.cY += 0.011 * k * Math.cos(w * 2 * ph + Math.PI) - 0.016 * k;
    p.roll = 0.045 * k * Math.sin(w * ph);
    p.cYaw = 0.06 * k * Math.sin(w * (ph - 0.2)); p.pYaw = -0.05 * k * Math.sin(w * ph);
    p.cP = 0.03 * k; p.nP = 0.06 * k + 0.025 * k * Math.sin(w * 2 * ph); p.hYaw = -p.cYaw * 0.8; p.hRoll = -p.roll * 0.8; p.hP = -0.04 * k;
    p.tUp = lerp(0.55, 1.2, k); p.tCurve = lerp(0.1, 0.13, k); p.tSway = lerp(0.22, 0.32, k); p.tFreq = lerp(1.6, f * Math.PI, k);
    // idle look-around
    if (k < 0.1) { p.hYaw += this.look2.yaw; }
  }
  poseSit(p, t, typing) {
    Object.assign(p, { pY: 0.12, pZ: -0.1, pP: -0.5, cY: 0.31, cZ: 0.075, cP: -0.72, nP: 0.5, hP: 0.2, tUp: -0.25, tCurve: 0.02, tSide: 0.24, tSway: 0.06, tFreq: 1.2,
      flz: 0.16, fly: FOOT_Y, frz: 0.16, fry: FOOT_Y, blz: 0.03, bly: 0.03, brz: 0.03, bry: 0.03 });
    if (typing) {
      const s = 9.5;
      p.cY = 0.325; p.cZ = 0.1; p.cP = -0.6; const KY = 0.3 / CS; p.nP = 0.42; p.hP = 0.22 + 0.035 * Math.sin(t * 1.3) + 0.02 * Math.sin(t * s * 0.5);
      p.flz = 0.33 + 0.012 * Math.sin(t * s); p.fly = KY + 0.03 * Math.max(0, Math.sin(t * s));
      p.frz = 0.33 + 0.012 * Math.sin(t * s + Math.PI); p.fry = KY + 0.03 * Math.max(0, Math.sin(t * s + Math.PI));
      p.tSway = 0.1; p.tFreq = 1.4;
      if (this.magnifier) {
        // hold the magnifying glass up to the screen with one paw, peering through it
        const k = this.look.lensPaw ?? "fr", sd = k === "fl" ? 1 : -1;
        p[k + "z"] = 0.31; p[k + "y"] = KY + 0.06 + 0.02 * Math.sin(t * 1.5); p.hYaw = sd * 0.15 + 0.12 * Math.sin(t * 0.8);
      }
    } else {
      p.hYaw = this.look2.yaw; p.tSway = 0.1 + 0.25 * Math.max(0, Math.sin(t * 0.9)) ** 8;
      if (this.speakUntil > t) { p.frz += 0.05; p.fry += 0.04 + 0.06 * Math.max(0, Math.sin(t * 4.5)); p.hP += 0.05 * Math.sin(t * 7); p.hYaw *= 0.3; p.tSway = 0.25; }
    }
  }
  poseSleep(p, t) {
    Object.assign(p, { pY: 0.085, pZ: -0.07, pP: 0.05, pYaw: -0.8, cY: 0.09, cZ: 0.06, cP: 0.18, cYaw: 0.9, roll: 0.0,
      nP: 1.05, hP: -0.25, hYaw: 0.95, hRoll: 0.35, tUp: -0.55, tCurve: 0.12, tSide: -0.42, tSway: 0.03, tFreq: 0.6, earL: 0.45, earR: 0.45, eye: 0, sleep: 1,
      flz: 0.2, fly: 0.03, frz: 0.18, fry: 0.03, blz: 0.0, bly: 0.03, brz: 0.0, bry: 0.03 });
  }
  poseStretch(p, t) {
    Object.assign(p, { pY: 0.33, pZ: -0.18, pP: 0.32, cY: 0.17, cZ: 0.19, cP: 0.32, nP: -0.55, hP: -0.25, tUp: 1.1, tCurve: 0.05, tSway: 0.05,
      flz: 0.46, fly: FOOT_Y, frz: 0.44, fry: FOOT_Y, blz: -0.2, bly: FOOT_Y, brz: -0.2, bry: FOOT_Y, eye: 0.25, earL: 0.3, earR: 0.3 });
  }
  poseRear(p, t, h) {
    const hy = h / CS;
    Object.assign(p, { pY: 0.19, pZ: -0.1, pP: -0.85, cY: 0.56, cZ: 0.12, cP: -1.2, nP: 0.95, hP: 0.3, tUp: 0.2, tCurve: 0.12, tSway: 0.25, tFreq: 2.2,
      flz: 0.36, fly: hy + 0.01, frz: 0.35, fry: hy + 0.01, blz: -0.03, bly: FOOT_Y, brz: -0.05, bry: FOOT_Y });
  }
  poseLap(p, t, food) {
    // front end lowered, head down into the saucer / bowl; quick lapping or slower chewing bob
    const bob = food ? 0.05 * Math.sin(t * 7) : 0.07 * Math.max(0, Math.sin(t * 10));
    Object.assign(p, { pY: 0.25, cY: 0.205, cZ: 0.16, cP: 0.4, nP: 0.78 + bob, hP: 0.5 + (food ? 0.04 * Math.sin(t * 3.5) : 0), eye: 0.35, tUp: 0.75, tCurve: 0.14, tSway: 0.32, tFreq: 2.2,
      earL: 0.12, earR: 0.12, flz: 0.25, fly: FOOT_Y, frz: 0.23, fry: FOOT_Y, blz: -0.15, brz: -0.15 });
  }
  applyPose(dt, t) {
    const tgt = this.target(t, dt);
    if (this.blendT < 1) { this.blendT = Math.min(1, this.blendT + dt / this.blendDur); const w = ease(this.blendT); for (const k of POSE_KEYS) this.pose[k] = lerp(this.snap[k], tgt[k], w); }
    else Object.assign(this.pose, tgt);
    const p = this.pose;
    this.pelvis.position.set(0, p.pY, p.pZ); this.pelvis.rotation.set(p.pP, p.pYaw, p.roll * 0.8);
    this.chest.position.set(0, p.cY, p.cZ); this.chest.rotation.set(p.cP, p.cYaw, p.roll);
    // belly between the two
    const dx = (p.cYaw - p.pYaw) * 0, dy = p.cY - p.pY, dz = p.cZ - p.pZ;
    const cxx = Math.sin(p.cYaw) * 0.02 + Math.sin(p.pYaw) * -0.02;
    this.belly.position.set(cxx, (p.cY + p.pY) / 2 - 0.005, (p.cZ + p.pZ) / 2);
    this.belly.rotation.set(-Math.atan2(dy, Math.hypot(dz, dx)), (p.cYaw + p.pYaw) * 0.5, p.roll * 0.9);
    const len = Math.hypot(dy, dz);
    const curl = Math.abs(p.cYaw - p.pYaw);
    this.belly.scale.set(0.112 + 0.02 * curl, 0.112, Math.max(0.09, len * 0.62 - curl * 0.04));
    // breathing
    const br = this.mode === "sleep" ? 0.03 * Math.sin(t * 1.7) * clamp(this.blendT * 2 - 1, 0, 1) : 0.008 * Math.sin(t * 2.6);
    this.body.scale.set(CS * (1 + br), CS * (1 + br * 0.8), CS);
    this.chest.updateMatrix(); this.pelvis.updateMatrix();
    this.solve(this.legs.fl, p.flz, p.fly); this.solve(this.legs.fr, p.frz, p.fry);
    this.solve(this.legs.bl, p.blz, p.bly); this.solve(this.legs.br, p.brz, p.bry);
    this.neck.rotation.x = p.nP;
    this.head.rotation.set(p.hP, p.hYaw, p.hRoll);
    // tail
    const n = this.tail.length;
    for (let i = 0; i < n; i++) {
      const g = this.tail[i], u = i / (n - 1);
      const sway = p.tSway * Math.sin(t * p.tFreq - i * 0.75) * (0.35 + u * 0.9);
      g.rotation.x = i === 0 ? p.tUp : p.tCurve * (u > 0.55 ? 1.6 : 0.6);
      g.rotation.y = sway + p.tSide;
    }
    // ears / eyes
    const tw = this.earTw;
    this.ears[0].rotation.set(-0.1 - p.earR * 0.6 - tw[0], 0, 0.32 + p.earR * 0.5 + tw[0] * 0.5);
    this.ears[1].rotation.set(-0.1 - p.earL * 0.6 - tw[1], 0, -0.32 - p.earL * 0.5 - tw[1] * 0.5);
    const blink = this.blink > 0 ? 0.12 : 1;
    const open = clamp(p.eye, 0, 1) * blink;
    const shut = p.sleep > 0.5;
    this.eyesG.visible = !shut; this.eyesG.scale.set(1, Math.max(0.08, open), 1);
    this.closedG.visible = shut;
    this.headItems.forEach((o) => (o.visible = p.sleep < 0.3));
    if (this.satchel) this.satchel.visible = p.sleep < 0.3;
    if (this.cape) this.cape.visible = p.sleep < 0.3;
    if (this.bell) this.bell.rotation.z = Math.sin(t * 9) * 0.4 * clamp(this.walkV, 0, 1);
  }
  solve(leg, tz, ty) {
    const grp = leg.group;
    const hp = leg.hip.position.clone().applyMatrix4(grp.matrix);
    const dz = tz - hp.z, dy = ty - hp.y;
    const L1 = leg.L1, L2 = leg.L2;
    const d = clamp(Math.hypot(dz, dy), 0.03, L1 + L2 - 0.0005);
    const aB = Math.atan2(dz, -dy);
    const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const be = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    let p1, p2;
    if (leg.front) { p1 = aB + al; p2 = p1 - (Math.PI - be); } else { p1 = aB - al; p2 = p1 + (Math.PI - be); }
    const gp = grp.rotation.x;
    leg.hip.rotation.x = -p1 - gp;
    leg.knee.rotation.x = -(p2 - p1);
    leg.paw.rotation.x = p2;
  }

  // ── behaviour
  live() { return this.W.live.agents?.[this.id] ?? { state: "idle", task: null, lead: null }; }
  inMeetingCall() { return this.W.meeting?.agentId === this.id; }
  desiredGoal() {
    const W = this.W, s = this.live(), now = W.clock();
    if (this.inMeetingCall()) return "meeting";
    if (!W.live.office_open || s.state === "off") return "bed";
    if (now < this.wakeAt) return "bed";
    if (this.needsCoffee) return "coffee";
    if (this.carryQueue.length) return "carry";
    if (this.id === "sender" && s.state === "waiting") return "manager";
    if (now < this.forceDeskUntil) return "desk";
    if (s.state === "working" || s.state === "waiting" || s.state === "ready") return "desk"; // ready = on duty, at the desk between tasks
    return this.needsFood ? "food" : "bed";
  }
  stationNode(g) {
    if (g === "desk") return this.id + ":desk";
    if (g === "bed") return "bed" + this.idx;
    if (g === "manager") return "mgr:visit";
    if (g === "coffee") return "cof:hub";
    if (g === "food") return "food:hub";
    if (g === "meeting") return "meet:cat";
    if (g === "carry") return this.carryQueue[0].to + ":tray";
    return this.node;
  }
  setProp(kind) {
    if (this.propKind === kind) return;
    if (this.prop) { this.mouth.remove(this.prop); this.prop = null; }
    this.propKind = kind;
    if (kind === "folder") { this.prop = makeFolder(LOOK[this.carryQueue[0].to].accent); this.prop.rotation.set(0.15, Math.PI / 2, 0); }
    else if (kind === "envelope") { this.prop = makeEnvelope(); this.prop.rotation.set(0.15, Math.PI / 2, 0); }
    if (this.prop) { this.prop.position.set(0, -0.005, 0.0); this.mouth.add(this.prop); }
  }
  decide() {
    const g = this.desiredGoal();
    if (g !== "carry" && this.propKind === "folder") this.setProp(null);
    if (g !== "manager" && this.propKind === "envelope") this.setProp(null);
    if (g === "carry") this.setProp("folder");
    if (g === "manager") this.setProp("envelope");
    const node = this.stationNode(g);
    if (this.node !== node) return this.startWalk(node, g);
    this.startStation(g);
  }
  startWalk(dest, goal) {
    const ids = route(this.W.graph, this.node, dest);
    const N = this.W.graph.N;
    const raw = [{ x: this.pos.x, z: this.pos.z }, ...ids.slice(1).map((id) => N.get(id))];
    const nodeS = []; let acc = 0;
    for (let i = 1; i < raw.length; i++) { acc += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z); nodeS.push(acc); }
    this.act = { type: "walk", goal, dest, ids: ids.slice(1), nodeS, ni: 0, path: new Path(smoothPath(raw, 0.42)), s: 0 };
    this.setMode("stand", 0.35);
  }
  // move along a Path; returns true when arrived
  stepPath(A, dt, maxV = WALK_SPEED, lanes = true) {
    const rem = A.path.total - A.s;
    let vT = Math.min(maxV, Math.sqrt(Math.max(0, 2 * 2.2 * rem)) + 0.12);
    // follow the cat in front instead of walking through it
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const o of this.W.cats) {
      if (o === this || !o.isMoving()) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.95 || d < 1e-3 || Math.abs(o.y - this.y) > 0.3) continue;
      if ((dx * fx + dz * fz) / d > 0.75 && Math.cos(o.heading - this.heading) > 0.2) vT = Math.min(vT, Math.max(0, (d - 0.62) * 4));
    }
    this.v += clamp(vT - this.v, -5 * dt, 2.6 * dt);
    A.s = Math.min(A.path.total, A.s + this.v * dt);
    const p = A.path.at(A.s);
    if (lanes && A.path.total > 1.2) {
      const q = A.path.at(Math.min(A.path.total, A.s + 0.06)), q0 = A.path.at(Math.max(0, A.s - 0.06));
      const tx = q.x - q0.x, tz = q.z - q0.z, tl = Math.hypot(tx, tz) || 1;
      const lane = (0.15 + (this.idx % 3) * 0.04) * clamp(Math.min(A.s, A.path.total - A.s) / 0.9, 0, 1);
      p.x += (-tz / tl) * lane; p.z += (tx / tl) * lane;
    }
    this.pos.x = p.x; this.pos.z = p.z;
    const ahead = A.path.at(Math.min(A.path.total, A.s + 0.45));
    const dx = ahead.x - p.x, dz = ahead.z - p.z;
    if (dx * dx + dz * dz > 1e-4) this.turnTo(headingTo(dx, dz), dt, 7);
    return A.s >= A.path.total - 1e-3;
  }
  isMoving() { const A = this.act; return !!A && (A.type === "walk" || (A.type === "bar" && (A.phase === "go" || A.phase === "leave"))) && this.v > 0.05; }
  turnTo(h, dt, rate = 6) { this.heading += angDiff(this.heading, h) * (1 - Math.exp(-dt * rate)); }
  hopTo(A, dt, dur) {
    A.t += dt; const k = clamp(A.t / dur, 0, 1), e = ease(k);
    this.pos.x = lerp(A.from.x, A.to.x, e); this.pos.z = lerp(A.from.z, A.to.z, e);
    this.y = lerp(A.y0, A.y1, e) + Math.sin(Math.PI * k) * (A.arc ?? 0.22);
    return k >= 1;
  }
  startStation(g) {
    const W = this.W;
    this.dwell = 0;
    if (g === "desk") { const c = W.CAB[this.id]; this.act = { type: "desk", phase: "hopOn", t: 0, from: { ...this.pos }, to: { x: c.chair.x, z: c.chair.z }, y0: 0, y1: 0.47, arc: 0.24 }; this.setMode("crouch", 0.15); }
    else if (g === "bed") { const b = W.BEDS[this.idx]; this.act = { type: "bed", phase: "enter", t: 0, from: { ...this.pos }, to: { x: b.x, z: b.z }, y0: 0, y1: 0.1, arc: 0.18 }; this.setMode("crouch", 0.2); }
    else if (g === "coffee") { this.act = { type: "bar", kind: "milk", cfg: COFFEE, Q: W.coffeeQ, phase: "claim", t: 0 }; }
    else if (g === "meeting") { this.act = { type: "meet", phase: "hopOn", t: 0, from: { ...this.pos }, to: { x: MEET.cat.x, z: MEET.cat.z }, y0: 0, y1: 0.47, arc: 0.24 }; this.setMode("crouch", 0.15); }
    else if (g === "food") { this.act = { type: "bar", kind: "food", cfg: FOOD, Q: W.foodQ, phase: "claim", t: 0 }; }
    else if (g === "carry") { this.act = { type: "drop", phase: "turn", t: 0, rearH: 0.76 }; }
    else if (g === "manager") { this.act = { type: "mgr", phase: "hopOn", t: 0, from: { ...this.pos }, to: { ...MANAGER.visitor }, y0: 0, y1: 0.47, arc: 0.24 }; this.setMode("crouch", 0.15); }
  }
  // place directly (no walking) at a station's loop
  placeAt(g) {
    const W = this.W; this.v = 0; this.walkV = 0; this.dwell = DWELL;
    this.setProp(null);
    if (g === "desk") {
      const c = W.CAB[this.id]; this.node = this.id + ":desk"; this.pos = { x: c.chair.x, z: c.chair.z }; this.y = 0.47; this.heading = -Math.PI / 2;
      this.act = { type: "desk", phase: "work", t: 0 }; this.mode = "type"; this.blendT = 1;
    } else if (g === "manager") {
      this.node = "mgr:visit"; this.pos = { ...MANAGER.visitor }; this.y = 0.47; this.heading = MANAGER.visitorHeading;
      this.act = { type: "mgr", phase: "wait", t: 0 }; this.mode = "sit"; this.blendT = 1; W.muffyCtl.envelope(true);
    } else {
      const b = W.BEDS[this.idx]; this.node = "bed" + this.idx; this.pos = { x: b.x, z: b.z }; this.y = 0.1;
      this.heading = headingTo(b.x - LOUNGE.cx, b.z - LOUNGE.cz) + Math.PI / 2;
      this.act = { type: "bed", phase: "sleep", t: 0 }; this.mode = "sleep"; this.blendT = 1;
    }
    this.applyPose(0, 0);
  }
  update(dt, t) {
    const W = this.W;
    if (!this.act) this.decide();
    const A = this.act;
    let walking = false;
    this.dwell = (this.dwell ?? 0) + dt;
    if (A) switch (A.type) {
      case "walk": {
        walking = true;
        const done = this.stepPath(A, dt);
        while (A.ni < A.nodeS.length && A.s >= A.nodeS[A.ni] - 0.05) {
          this.node = A.ids[A.ni]; A.ni++;
          if (A.ni < A.nodeS.length && this.desiredGoal() !== A.goal) { this.act = null; return this.finishFrame(dt, t, true); }
        }
        if (done) { this.node = A.dest; this.act = null; if (this.desiredGoal() === A.goal) this.startStation(A.goal); }
        break;
      }
      case "desk": {
        const c = W.CAB[this.id];
        if (A.phase === "hopOn") { this.turnTo(-Math.PI / 2, dt, 8); if (A.t > 0.12) this.setMode("sit", 0.3); if (this.hopTo(A, dt, 0.55)) { A.phase = "work"; A.t = 0; this.setMode("type", 0.45); } }
        else if (A.phase === "work") {
          this.turnTo(-Math.PI / 2, dt, 4);
          if (this.desiredGoal() !== "desk" && (this.dwell >= DWELL || this.inMeetingCall())) { A.phase = "hopOff"; A.t = 0; A.from = { ...this.pos }; A.to = { ...c.approach }; A.y0 = 0.47; A.y1 = 0; A.arc = 0.15; this.setMode("crouch", 0.25); }
        } else if (A.phase === "hopOff") {
          this.turnTo(Math.PI / 2, dt, 7); if (A.t > 0.2) this.setMode("stand", 0.3);
          if (this.hopTo(A, dt, 0.6)) { this.y = 0; this.act = null; this.node = this.id + ":desk"; }
        }
        break;
      }
      case "bed": {
        const b = W.BEDS[this.idx];
        if (A.phase === "enter") {
          this.turnTo(headingTo(b.x - A.from.x, b.z - A.from.z), dt, 8); if (A.t > 0.15) this.setMode("stand", 0.3);
          if (this.hopTo(A, dt, 0.7)) { A.phase = "circle"; A.t = 0; A.h0 = this.heading; }
        } else if (A.phase === "circle") {
          A.t += dt; const k = clamp(A.t / 1.5, 0, 1);
          const target = A.h0 + ease(k) * Math.PI * 1.6; this.heading = target; this.walkV = 0.45 * Math.sin(Math.PI * k);
          this.phase += dt * 1.8;
          if (k >= 1) { A.phase = "lie"; A.t = 0; this.setMode("sleep", 1.5); }
        } else if (A.phase === "lie") { A.t += dt; if (A.t > 1.5) { A.phase = "sleep"; A.t = 0; } }
        else if (A.phase === "sleep") {
          if (this.desiredGoal() !== "bed" && (this.dwell >= DWELL || this.inMeetingCall())) { A.phase = "wake"; A.t = 0; this.setMode("stand", 1.0); }
        } else if (A.phase === "wake") { A.t += dt; if (A.t > 1.05) { A.phase = "stretch"; A.t = 0; this.setMode("stretch", 0.7); } }
        else if (A.phase === "stretch") { A.t += dt; if (A.t > 2.0) { A.phase = "exit0"; A.t = 0; this.setMode("stand", 0.6); } }
        else if (A.phase === "exit0") {
          const ap = W.graph.N.get("bed" + this.idx); this.turnTo(headingTo(ap.x - b.x, ap.z - b.z), dt, 5); A.t += dt;
          this.walkV = 0.3; this.phase += dt * 1.5;
          if (A.t > 0.7) { A.phase = "exit"; A.t = 0; A.from = { ...this.pos }; A.to = { x: ap.x, z: ap.z }; A.y0 = this.y; A.y1 = 0; A.arc = 0.16; this.setMode("crouch", 0.15); }
        } else if (A.phase === "exit") {
          if (A.t > 0.15) this.setMode("stand", 0.3);
          if (this.hopTo(A, dt, 0.6)) { this.y = 0; this.act = null; this.node = "bed" + this.idx; }
        }
        break;
      }
      case "bar": this.updateBar(A, dt, t); walking = A.phase === "go" || A.phase === "leave"; break;
      case "drop": {
        const c = W.CAB[this.carryQueue[0]?.to] ?? W.CAB[this.id];
        A.t += dt;
        if (A.phase === "turn") { this.turnTo(-Math.PI / 2, dt, 8); if (A.t > 0.35) { A.phase = "rear"; A.t = 0; this.setMode("rear", 0.5); } }
        else if (A.phase === "rear") {
          if (A.t > 0.85 && this.prop) { const job = this.carryQueue[0]; this.setProp(null); W.addToTray(job.to, LOOK[job.to].accent); }
          if (A.t > 1.3) { A.phase = "down"; A.t = 0; this.setMode("stand", 0.5); }
        } else if (A.phase === "down" && A.t > 0.55) { this.carryQueue.shift(); this.act = null; }
        void c;
        break;
      }
      case "meet": {
        if (A.phase === "hopOn") {
          this.turnTo(MEET.catHeading, dt, 8); if (A.t > 0.12) this.setMode("sit", 0.3);
          if (this.hopTo(A, dt, 0.55)) { A.phase = "sit"; A.t = 0; }
        } else if (A.phase === "sit") {
          this.turnTo(MEET.catHeading, dt, 4);
          if (!this.inMeetingCall()) { A.phase = "hopOff"; A.t = 0; A.from = { ...this.pos }; A.to = { x: MEET.cat.ax, z: MEET.cat.az }; A.y0 = 0.47; A.y1 = 0; A.arc = 0.15; this.setMode("crouch", 0.2); }
        } else if (A.phase === "hopOff") {
          this.turnTo(Math.PI, dt, 7); if (A.t > 0.2) this.setMode("stand", 0.3);
          if (this.hopTo(A, dt, 0.6)) { this.y = 0; this.act = null; this.node = "meet:cat"; }
        }
        break;
      }
      case "mgr": {
        if (A.phase === "hopOn") {
          this.turnTo(MANAGER.visitorHeading, dt, 8); if (A.t > 0.12) this.setMode("sit", 0.3);
          if (this.hopTo(A, dt, 0.55)) { A.phase = "wait"; A.t = 0; this.setProp(null); W.muffyCtl.envelope(true); }
        } else if (A.phase === "wait") {
          this.turnTo(MANAGER.visitorHeading, dt, 4);
          if (this.desiredGoal() !== "manager" && (this.dwell >= DWELL || this.inMeetingCall())) {
            const approved = W.live.office_open && this.live().state !== "waiting";
            if (approved) { A.phase = "approved"; A.t = 0; W.muffyCtl.stamp(); } else { A.phase = "hopOff"; A.t = 0; A.from = null; W.muffyCtl.envelope(false); }
          }
        } else if (A.phase === "approved") {
          A.t += dt; if (A.t > 1.9) { A.phase = "hopOff"; A.t = 0; A.from = null; A.happy = true; this.forceDeskUntil = W.clock() + 12000; }
        } else if (A.phase === "hopOff") {
          if (!A.from) { A.from = { ...this.pos }; A.to = { ...MANAGER.approach }; A.y0 = 0.47; A.y1 = 0; A.arc = 0.15; this.setMode("crouch", 0.2); }
          this.turnTo(headingTo(MANAGER.approach.x - MANAGER.visitor.x, MANAGER.approach.z - MANAGER.visitor.z), dt, 7);
          if (A.t > 0.2) this.setMode("stand", 0.3);
          if (this.hopTo(A, dt, 0.6)) { this.y = 0; if (A.happy) { A.phase = "happy"; A.t = 0; A.from = { ...this.pos }; A.to = { ...this.pos }; A.y0 = 0; A.y1 = 0; A.arc = 0.2; } else { this.act = null; this.node = "mgr:visit"; } }
        } else if (A.phase === "happy") {
          this.setMode("stand", 0.2); this.heading += dt * 4;
          if (this.hopTo(A, dt, 0.5)) { this.y = 0; this.act = null; this.node = "mgr:visit"; }
        }
        break;
      }
    }
    this.finishFrame(dt, t, walking);
  }
  // shared milk-bar / food-bar station: claim a slot (or queue), walk there, lap/eat, leave
  updateBar(A, dt, t) {
    const Q = A.Q, C = A.cfg;
    if ((A.phase === "claim" || A.phase === "queue") && this.inMeetingCall()) { Q.release(this); this.act = null; return; }
    if (A.phase === "claim") {
      const slot = Q.request(this);
      A.slot = slot; A.phase = "go"; A.path = new Path(smoothPath([{ ...this.pos }, slot.pt])); A.s = 0; this.setMode("stand", 0.3);
    } else if (A.phase === "go") {
      if (this.stepPath(A, dt, 1.0)) { A.phase = A.slot.counter ? "face" : "queue"; A.t = 0; }
    } else if (A.phase === "queue") {
      this.v = 0; this.turnTo(headingTo(C.lookAt.x - this.pos.x, C.lookAt.z - this.pos.z), dt, 5);
      const slot = Q.check(this);
      if (slot && (slot.counter || slot.pt !== A.slot.pt)) { A.slot = slot; A.phase = "go"; A.path = new Path([{ ...this.pos }, slot.pt]); A.s = 0; }
    } else if (A.phase === "face") {
      this.v = 0; A.t += dt; this.turnTo(C.face, dt, 8);
      if (A.t > 0.4) { A.phase = "eat"; A.t = 0; this.setMode("lap", 0.6); }
    } else if (A.phase === "eat") {
      A.t += dt; this.turnTo(C.face, dt, 6);
      if (A.t > 4.0) { A.phase = "done"; A.t = 0; this.setMode("stand", 0.5); }
    } else if (A.phase === "done") {
      A.t += dt;
      if (A.t > 0.55) {
        Q.release(this); if (A.kind === "food") this.needsFood = false; else this.needsCoffee = false;
        const bx = -Math.sin(C.face) * 0.7, bz = -Math.cos(C.face) * 0.7;
        A.phase = "leave"; A.path = new Path(smoothPath([{ ...this.pos }, { x: this.pos.x + bx, z: this.pos.z + bz }, C.hub], 0.3)); A.s = 0;
      }
    } else if (A.phase === "leave") {
      if (this.stepPath(A, dt)) { this.node = C.node; this.act = null; }
    }
  }
  finishFrame(dt, t, walking) {
    if (!walking && !(this.act?.type === "bed" && (this.act.phase === "circle" || this.act.phase === "exit0"))) { this.v = Math.max(0, this.v - dt * 5); }
    if (walking || this.act?.type === "bar") this.walkV = this.v;
    else if (!(this.act?.type === "bed" && (this.act.phase === "circle" || this.act.phase === "exit0"))) this.walkV = Math.max(0, this.walkV - dt * 4);
    const f = Math.max(this.walkV / STRIDE, 1.5);
    if (this.walkV > 0.01) this.phase += dt * f;
    // blinks, ear twitches, idle look
    this.nextBlink -= dt; if (this.nextBlink < 0) { this.blink = 0.13; this.nextBlink = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    this.nextEar -= dt; if (this.nextEar < 0) { this.earTw[Math.random() < 0.5 ? 0 : 1] = 0.6; this.nextEar = 2.5 + Math.random() * 5; }
    this.earTw[0] = Math.max(0, this.earTw[0] - dt * 4); this.earTw[1] = Math.max(0, this.earTw[1] - dt * 4);
    const L2 = this.look2; L2.next -= dt;
    if (L2.next < 0) { const mgr = this.act?.type === "mgr"; L2.target = mgr ? (Math.random() < 0.35 ? 1.1 : (Math.random() - 0.5) * 0.3) : (Math.random() - 0.5) * 1.2; L2.next = 1.5 + Math.random() * 3.5; }
    L2.yaw += ((L2.target ?? 0) - L2.yaw) * (1 - Math.exp(-dt * 3));
    this.applyPose(dt, t);
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.heading;
    const talk = this.speakUntil > t;
    this.mouthO.visible = talk && Math.sin(t * 13) > -0.2; this.mouthO.scale.y = 0.004 + 0.012 * Math.abs(Math.sin(t * 13));
    if (talk && Math.random() < dt * 1.5) this.earTw[Math.random() < 0.5 ? 0 : 1] = 0.6;
    this.tongue.visible = this.mode === "lap" && this.act?.kind === "milk" && Math.sin(t * 10) > 0.35;
    if (this.magnifier) this.magnifier.visible = this.act?.type === "desk" && this.act.phase === "work";
    this.labelAnchor.position.set(0, this.mode === "sleep" ? 0.5 : 0.9, 0);
    this.zAnchor.position.set(0.1, 0.42, 0.1);
  }
  activity() {
    const A = this.act, s = this.live();
    if (!A) return "walking";
    if (A.type === "walk") return A.goal === "carry" ? "delivering" : A.goal === "manager" ? "to-manager" : A.goal === "coffee" ? "coffee" : A.goal === "food" ? "eating" : A.goal === "meeting" ? "meeting" : A.goal === "bed" ? "to-bed" : "to-desk";
    if (A.type === "desk") return A.phase === "work" ? "working" : "to-desk";
    if (A.type === "bed") return ["sleep", "lie", "circle"].includes(A.phase) ? "sleeping" : "waking";
    if (A.type === "bar") return A.kind === "food" ? "eating" : "coffee";
    if (A.type === "meet") return A.phase === "hopOff" ? "walking" : "meeting";
    if (A.type === "drop") return "delivering";
    if (A.type === "mgr") return A.phase === "wait" || A.phase === "hopOn" ? "waiting" : A.phase === "approved" || A.happy ? "approved" : "walking";
    void s; return "walking";
  }
  statusText() {
    const a = this.activity(), s = this.live();
    const task = s.task || (s.state === "working" ? "On it" : "");
    switch (a) {
      case "working": return s.state === "ready" ? "At desk, ready" : "Working · " + trunc(task, 38);
      case "to-desk": return s.state === "working" ? "Working · " + trunc(task, 38) : "Heading to desk";
      case "sleeping": case "to-bed": return "Napping";
      case "waking": return "Waking up";
      case "coffee": return "Milk break";
      case "eating": return "Snack time";
      case "meeting": return "In a meeting with " + PEOPLE.founder.name;
      case "delivering": return "Delivering to " + (AGENTS.find((x) => x.id === this.carryQueue[0]?.to)?.name ?? "team");
      case "waiting": case "to-manager": return "Waiting for " + PEOPLE.manager.name + "'s approval";
      case "approved": return "Approved!";
    }
    return "Walking";
  }
  locationName() {
    const A = this.act;
    if (!A || A.type === "walk") return A?.goal === "carry" ? "delivering" : "walking";
    if (A.type === "bar") return A.kind === "food" ? "food-bar" : "milk-bar";
    if (A.type === "meet") return "meeting";
    return { desk: "desk", bed: "bed", drop: "delivering", mgr: "manager" }[A.type] ?? "walking";
  }
}
// hand-held magnifying glass, attached to a front paw (hidden until the cat is working)
function makeMagnifier(k = 1) {
  const mg = new THREE.Group();
  mg.add(place(mesh(G.cyl(8), mat("#6b4430")), 0, 0.0, 0.05 * k, Math.PI / 2, 0, 0, 0.007 * k, 0.07 * k, 0.007 * k));
  mg.add(place(mesh(G.tor(0.035, 0.006, Math.PI * 2, 6, 18), W_gold()), 0, 0, 0.12 * k, Math.PI / 2 - 0.4, 0, 0, k));
  mg.add(place(mesh(G.cyl(16), track(new THREE.MeshStandardMaterial({ color: "#d8f0ff", transparent: true, opacity: 0.35, roughness: 0.05 }))), 0, 0, 0.12 * k, -0.4, 0, 0, 0.033 * k, 0.002, 0.033 * k));
  mg.position.set(0, -0.01, 0.02); mg.rotation.x = -0.5; mg.visible = false;
  return mg;
}
function W_gold() { return mat("#e8b931", { metalness: 0.85, roughness: 0.25, envMapIntensity: 1.2 }); }

// bar queue: a few serving slots + a short waiting line
class BarQueue {
  constructor(cfg) { this.cfg = cfg; this.counter = cfg.spots.map(() => null); this.line = []; }
  request(cat) {
    const free = this.counter.findIndex((c) => c === null);
    if (free >= 0 && this.line.length === 0) { this.counter[free] = cat; return { counter: true, idx: free, pt: this.cfg.spots[free] }; }
    if (!this.line.includes(cat)) this.line.push(cat);
    const i = this.line.indexOf(cat); return { counter: false, idx: i, pt: this.cfg.queue[Math.min(i, this.cfg.queue.length - 1)] };
  }
  check(cat) {
    const i = this.line.indexOf(cat); if (i < 0) return null;
    const free = this.counter.findIndex((c) => c === null);
    if (i === 0 && free >= 0) { this.line.shift(); this.counter[free] = cat; return { counter: true, idx: free, pt: this.cfg.spots[free] }; }
    return { counter: false, idx: i, pt: this.cfg.queue[Math.min(i, this.cfg.queue.length - 1)] };
  }
  release(cat) { this.counter = this.counter.map((c) => (c === cat ? null : c)); this.line = this.line.filter((c) => c !== cat); }
}

// ───────────────────────── humans ─────────────────────────
function buildHuman(o) {
  const root = new THREE.Group();
  const skin = mat(o.skin, { roughness: 0.62 }), skinD = mat(shade(o.skin, -0.12), { roughness: 0.65 });
  const shirt = mat(o.shirt, { roughness: 0.9, envMapIntensity: 0.25 }), pants = mat(o.pants, { roughness: 0.85 }), shoe = mat(o.shoes, { roughness: 0.55 }), sole = mat("#e9e9ea", { roughness: 0.6 });
  const S = o.scale ?? 1;
  const inner = new THREE.Group(); inner.scale.setScalar(S); root.add(inner);
  const seat = o.seatY / S;
  const hips = new THREE.Group(); hips.position.y = seat; inner.add(hips);
  hips.add(place(mesh(G.rbox(0.36, 0.17, 0.32, 0.07), pants, true), 0, 0.08, 0));
  const legs = [], Ls = seat - 0.015;
  [-1, 1].forEach((s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.085, 0.03); hip.rotation.x = -Math.PI / 2; hips.add(hip);
    hip.add(place(mesh(G.cap(0.08, 0.3, 10), pants, true), 0, -0.17, 0));
    const knee = new THREE.Group(); knee.position.y = -0.36; knee.rotation.x = Math.PI / 2; hip.add(knee);
    knee.add(place(mesh(G.cap(0.064, Ls - 0.08, 10), pants, true), 0, -Ls / 2, 0));
    knee.add(place(mesh(G.rbox(0.13, 0.1, 0.27, 0.045), shoe, true), 0, -Ls - 0.045, 0.06));
    knee.add(place(mesh(G.rbox(0.135, 0.03, 0.28, 0.012), sole), 0, -Ls - 0.085, 0.06));
    legs.push({ hip, knee, s });
  });
  const torso = new THREE.Group(); torso.position.set(0, 0.14, -0.02); torso.rotation.order = "YXZ"; hips.add(torso);
  const TL = o.torsoLen ?? 0.3, SH = 0.11 + TL;
  torso.add(place(mesh(G.cap(0.17, TL, 14), shirt, true), 0, 0.06 + TL / 2, 0, 0, 0, 0, 1.18, 1, 0.74));
  [-1, 1].forEach((s) => torso.add(place(mesh(G.sph(14), shirt, true), s * 0.2, SH, 0, 0, 0, 0, 0.088, 0.075, 0.08)));
  torso.add(place(mesh(G.cyl(12), skin), 0, SH + 0.13, 0, 0, 0, 0, 0.052, 0.12, 0.052));
  torso.add(place(mesh(G.tor(0.058, 0.014, Math.PI * 2, 6, 20), shirt), 0, SH + 0.085, 0.0, Math.PI / 2, 0, 0, 1, 1, 1));
  const head = new THREE.Group(); head.position.set(0, SH + 0.27, 0.01); head.rotation.order = "YXZ"; head.scale.setScalar(o.headScale ?? 1); torso.add(head);
  head.add(place(mesh(G.sph(26), skin, true), 0, 0, 0, 0, 0, 0, 0.12 * (o.headW ?? 1), 0.138, 0.128));
  head.add(place(mesh(G.sph(18), skin), 0, -0.055, 0.025, 0, 0, 0, 0.1 * (o.jawW ?? 1), 0.085, 0.1));
  [-1, 1].forEach((s) => head.add(place(mesh(G.sph(10), skinD), s * 0.118, -0.008, 0.0, 0, 0, 0, 0.022, 0.038, 0.03)));
  head.add(place(mesh(G.sph(12), skinD), 0, -0.022, 0.128, 0, 0, 0, 0.02, 0.028, 0.024));
  const arms = {};
  [-1, 1].forEach((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.21, SH, 0); torso.add(sh);
    sh.add(place(mesh(G.cap(0.068, 0.08, 10), shirt, true), 0, -0.05, 0));
    sh.add(place(mesh(G.cap(0.046, 0.14, 10), skin, true), 0, -0.15, 0));
    const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
    el.add(place(mesh(G.cap(0.043, 0.16, 10), skin, true), 0, -0.1, 0));
    const hand = new THREE.Group(); hand.position.y = -0.215; el.add(hand);
    hand.add(place(mesh(G.sph(12), skin, true), 0, -0.01, 0, 0, 0, 0, 0.047, 0.058, 0.035));
    arms[s > 0 ? "L" : "R"] = { sh, el, hand, s, a: 0.25, b: 0.215, tgt: new THREE.Vector3(s * 0.15, 0.1, 0.3), cur: new THREE.Vector3(s * 0.15, 0.1, 0.3) };
  });
  return { root, inner, hips, torso, head, arms, skin, skinD, SH, legs, S, seat, standH: seat + 0.36 };
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
// two-bone arm IK; target in torso space
function armIK(arm) {
  const T = _v1.copy(arm.cur).sub(arm.sh.position);
  const a = arm.a, b = arm.b, d = clamp(T.length(), 0.08, a + b - 0.002);
  const be = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const e = -(Math.PI - be);
  arm.el.rotation.set(e, 0, 0);
  const W0 = _v2.set(0, -a - b * Math.cos(e), -b * Math.sin(e)).normalize();
  T.normalize();
  arm.sh.quaternion.setFromUnitVectors(W0, T);
  // roll the elbow outward a little
  _q.setFromAxisAngle(T, arm.s * 0.5); arm.sh.quaternion.premultiply(_q);
}
function toTorso(h, world) { return h.torso.worldToLocal(world.clone()); }

function buildHani() {
  const h0 = buildHuman({ skin: "#c48c66", shirt: "#141417", pants: "#24252b", shoes: "#f4f4f2", seatY: 0.56, headW: 0.95, headScale: 1.12, torsoLen: 0.3 });
  const h = h0, H = h.head;
  const hairD = mat("#1a110e", { roughness: 0.42, envMapIntensity: 0.7 }), hairS = mat("#2a201c", { roughness: 0.9 });
  const capG = track(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52));
  H.add(place(mesh(capG, hairS, true), 0, 0.006, -0.004, 0.22, 0, 0, 0.126, 0.136, 0.136));
  [-1, 1].forEach((s) => H.add(place(mesh(G.box(), hairS), s * 0.118, -0.012, 0.05, 0, 0, 0, 0.01, 0.05, 0.028)));
  // tall swept-up-and-back quiff: voluminous at the front, flowing back over the crown
  [[0, 0.118, 0.08, 0.118, 0.055, 0.062, -0.45], [0.005, 0.158, 0.05, 0.122, 0.062, 0.08, -0.7], [0, 0.168, -0.015, 0.122, 0.055, 0.09, -0.2], [0, 0.14, -0.075, 0.112, 0.055, 0.08, 0.3], [0, 0.1, -0.11, 0.105, 0.06, 0.06, 0.5]]
    .forEach(([x, y, z, sx, sy, sz, rx]) => H.add(place(mesh(G.sph(18), hairD, true), x, y, z, rx, 0, 0, sx, sy, sz)));
  [[-0.06, 0.18, 0.085], [0.0, 0.195, 0.09], [0.055, 0.18, 0.08]].forEach(([x, y, z], i) => H.add(place(mesh(G.sph(10), hairD), x, y, z, -0.9, x * 2, 0, 0.03, 0.02, 0.05)));
  // brows, shades, eyes
  [-1, 1].forEach((s) => {
    H.add(place(mesh(G.rbox(0.07, 0.02, 0.02, 0.006), hairD), s * 0.047, 0.047, 0.118, 0, 0, s * -0.06));
    H.add(place(mesh(G.sph(10), mat("#1a1210")), s * 0.045, 0.012, 0.112, 0, 0, 0, 0.016, 0.012, 0.008));
  });
  const lens = track(new THREE.MeshStandardMaterial({ color: "#3a2660", transparent: true, opacity: 0.8, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.6 }));
  const silver = mat("#d9dde3", { metalness: 0.9, roughness: 0.2, envMapIntensity: 1.2 });
  [-1, 1].forEach((s) => {
    H.add(place(mesh(G.rbox(0.078, 0.042, 0.008, 0.008), lens), s * 0.046, 0.012, 0.132, 0, s * 0.12, 0));
    H.add(place(mesh(G.box(), silver), s * 0.098, 0.022, 0.07, 0, s * 0.1, 0, 0.004, 0.006, 0.12));
    H.add(place(mesh(G.box(), silver), s * 0.086, 0.022, 0.129, 0, 0, 0, 0.012, 0.008, 0.006));
  });
  H.add(place(mesh(G.cyl(6), silver), 0, 0.025, 0.138, 0, 0, Math.PI / 2, 0.003, 0.03, 0.003));
  // mustache + goatee + mouth
  H.add(place(mesh(G.tor(0.034, 0.011, Math.PI, 6, 14), hairD), 0, -0.05, 0.122, 0, 0, 0, 1, 0.55, 0.8));
  [-1, 1].forEach((s) => H.add(place(mesh(G.sph(8), hairD), s * 0.034, -0.054, 0.117, 0, 0, 0, 0.011, 0.016, 0.01)));
  H.add(place(mesh(G.box(), mat("#8a4a40")), 0, -0.068, 0.126, 0, 0, 0, 0.034, 0.007, 0.006));
  H.add(place(mesh(G.sph(12), hairD), 0, -0.112, 0.097, 0.3, 0, 0, 0.027, 0.02, 0.018));
  H.add(place(mesh(G.sph(8), hairD), 0, -0.084, 0.121, 0, 0, 0, 0.008, 0.009, 0.005));
  // diamond stud (his right ear, appears on the viewer's left)
  H.add(place(mesh(track(new THREE.OctahedronGeometry(1)), mat("#ffffff", { metalness: 0.6, roughness: 0.05, emissive: "#cfe8ff", emissiveIntensity: 0.6, envMapIntensity: 2 })), -0.123, -0.04, 0.012, 0, 0, 0, 0.011));
  // rope chain
  h.torso.add(place(mesh(G.tor(0.088, 0.0045, Math.PI * 2, 4, 36), silver), 0, h.SH + 0.02, 0.1, 1.2, 0, 0, 1, 1.35, 1));
  [h.head, h.torso, h.hips].forEach(compact);
  return h;
}
function buildMuffy() {
  const h = buildHuman({ skin: "#d9a77f", shirt: "#d7262c", pants: "#3e5f8a", shoes: "#f0f0f0", seatY: 0.5, scale: 0.8, headScale: 1.18, headW: 0.98, jawW: 0.92, torsoLen: 0.22 });
  const H = h.head;
  const hair = mat("#141012", { roughness: 0.5, envMapIntensity: 0.5 });
  const capG = track(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55));
  H.add(place(mesh(capG, hair, true), 0, 0.01, -0.012, -0.18, 0, 0, 0.13, 0.142, 0.138));
  const r = rng(9);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, el = 0.25 + r() * 0.9;
    const x = Math.cos(a) * Math.cos(el) * 0.12, y = 0.02 + Math.sin(el) * 0.13, z = Math.sin(a) * Math.cos(el) * 0.12 - 0.02;
    if (z > 0.08 && y < 0.1) continue;
    H.add(place(mesh(G.sph(10), hair, true), x, y, z, r(), r(), r(), 0.045 + r() * 0.02, 0.04 + r() * 0.02, 0.05));
  }
  // fringe swept to his right, falling over the forehead
  [[-0.065, 0.075, 0.095, 0.7], [-0.03, 0.085, 0.11, 0.55], [0.005, 0.09, 0.112, 0.4], [0.04, 0.095, 0.105, 0.3], [-0.085, 0.045, 0.085, 0.9]].forEach(([x, y, z, rz]) => {
    H.add(place(mesh(G.sph(12), hair, true), x, y, z, -0.3, 0, rz, 0.03, 0.06, 0.03));
  });
  H.add(place(mesh(G.tor(0.03, 0.01, Math.PI * 1.2, 6, 12), hair), -0.07, 0.04, 0.1, 0, 0.3, 2.2));
  [-1, 1].forEach((s) => H.add(place(mesh(G.box(), hair), s * 0.117, 0.0, 0.03, 0, 0, 0, 0.012, 0.06, 0.035)));
  // big warm eyes
  const white = mat("#fbf8f4", { roughness: 0.3 }), iris = mat("#3b2116", { roughness: 0.25, envMapIntensity: 1 }), blk = mat("#0d0a0a", { roughness: 0.2 });
  [-1, 1].forEach((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.047, 0.006, 0.112); e.rotation.y = s * 0.2; H.add(e);
    e.add(place(mesh(G.sph(14), white), 0, 0, 0, 0, 0, 0, 0.03, 0.025, 0.014));
    e.add(place(mesh(G.sph(14), iris), 0, 0, 0.008, 0, 0, 0, 0.019, 0.02, 0.009));
    e.add(place(mesh(G.sph(10), blk), 0, 0, 0.013, 0, 0, 0, 0.009, 0.01, 0.006));
    e.add(place(mesh(G.sph(8), basic("#ffffff")), 0.006, 0.007, 0.017, 0, 0, 0, 0.0055));
    H.add(place(mesh(G.rbox(0.062, 0.018, 0.016, 0.006), hair), s * 0.048, 0.045, 0.121, 0, 0, s * -0.1));
    h.eyesL = h.eyesL || []; h.eyesL.push(e);
  });
  H.add(place(mesh(G.tor(0.025, 0.0055, Math.PI, 5, 12), mat("#a5574a")), 0, -0.058, 0.124, 0, 0, Math.PI, 1, 0.6, 1));
  [h.head, h.torso, h.hips].forEach(compact);
  return h;
}

// ───────────────────────── monitor screens ─────────────────────────
function drawScreen(id, g, t, working) {
  const w = 256, h = 160;
  if (!working) {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#151826"); gr.addColorStop(1, "#1e1a33");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(139,123,255,.9)"; rr(g, w / 2 - 16, h / 2 - 22, 32, 32, 9); g.fill();
    g.fillStyle = "#fff"; g.font = "700 20px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("S", w / 2, h / 2 - 5);
    g.fillStyle = "rgba(255,255,255,.4)"; g.font = "500 11px Inter, sans-serif"; g.fillText("zzz…", w / 2, h / 2 + 26); g.textAlign = "left";
    return;
  }
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  const bar = (title, c) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, 18); g.fillStyle = c; g.beginPath(); g.arc(10, 9, 4, 0, 7); g.fill(); g.fillStyle = "#2b2e3a"; g.font = "600 10px Inter, sans-serif"; g.fillText(title, 20, 13); };
  if (id === "finder") {
    g.fillStyle = "#e8efe4"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfe3c4"; g.fillRect(150, 20, 70, 50); g.fillRect(30, 100, 60, 40);
    g.fillStyle = "#bcd9f0"; g.beginPath(); g.ellipse(200, 130, 50, 26, 0, 0, 7); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 6; [[0, 60, w, 80], [90, 0, 120, h], [0, 140, w, 110], [170, 0, 150, h]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
    const n = Math.floor(t * 0.9) % 9;
    const r = rng(3);
    for (let i = 0; i <= n; i++) {
      const x = 20 + r() * 216, y = 30 + r() * 110, k = i === n ? clamp(frac(t * 0.9) * 3, 0, 1) : 1;
      g.fillStyle = i === n ? "#f59e42" : "#e0475a"; g.beginPath(); g.arc(x, y - 10 * k - 4, 6, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - 4, y - 10 * k - 2); g.lineTo(x, y - 10 * k + 6); g.lineTo(x + 4, y - 10 * k - 2); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y - 10 * k - 4, 2, 0, 7); g.fill();
    }
    bar("Finding clinics · " + (n + 1) + " found", "#f59e42");
  } else if (id === "auditor") {
    g.fillStyle = "#f6f7fb"; g.fillRect(0, 0, w, h); bar("Site audit", "#5b8def");
    const items = ["Mobile friendly", "Page speed", "Click-to-call", "Opening hours", "Directions map", "SSL"], n = Math.floor(t * 0.8) % (items.length + 2);
    items.forEach((it, i) => {
      const y = 34 + i * 20; g.strokeStyle = "#c3c8d4"; g.lineWidth = 1.5; g.strokeRect(14, y - 9, 12, 12);
      if (i < n) { g.strokeStyle = i % 3 === 1 ? "#e0475a" : "#2fb67a"; g.lineWidth = 2.5; g.beginPath(); if (i % 3 === 1) { g.moveTo(16, y - 7); g.lineTo(24, y + 1); g.moveTo(24, y - 7); g.lineTo(16, y + 1); } else { g.moveTo(15, y - 3); g.lineTo(19, y + 1); g.lineTo(26, y - 8); } g.stroke(); }
      g.fillStyle = "#3a3f4f"; g.font = "500 11px Inter, sans-serif"; g.fillText(it, 34, y + 1);
    });
    const sc = Math.min(n, items.length) / items.length;
    g.lineWidth = 9; g.strokeStyle = "#e6e9f2"; g.beginPath(); g.arc(205, 90, 30, 0, 7); g.stroke();
    g.strokeStyle = "#5b8def"; g.beginPath(); g.arc(205, 90, 30, -Math.PI / 2, -Math.PI / 2 + sc * Math.PI * 2); g.stroke();
    g.fillStyle = "#2b2e3a"; g.font = "700 15px Inter, sans-serif"; g.textAlign = "center"; g.fillText(Math.round(sc * 100) + "", 205, 95); g.textAlign = "left";
  } else if (id === "developer") {
    g.fillStyle = "#1b1d27"; g.fillRect(0, 0, 120, h);
    const cols = ["#ff8fb1", "#4fd1c5", "#8b7bff", "#f2cc8f", "#9aa0ae"];
    const off = (t * 22) % 12;
    for (let i = 0; i < 16; i++) { const y = 10 + i * 12 - off, r = rng(i + Math.floor(t * 22 / 12)); g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(8 + ((r() * 3) | 0) * 8, y, 20 + r() * 60, 5); g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(70 + r() * 10, y, 10 + r() * 25, 5); }
    const k = frac(t * 0.15);
    g.fillStyle = "#ffffff"; g.fillRect(120, 0, 136, h);
    const gr = g.createLinearGradient(120, 0, 256, 60); gr.addColorStop(0, "#8b7bff"); gr.addColorStop(1, "#4fd1c5");
    g.fillStyle = gr; g.fillRect(124, 4, 128, 60 * Math.min(1, k * 3));
    if (k > 0.25) { g.fillStyle = "#fff"; g.fillRect(134, 22, 70, 8); g.fillRect(134, 34, 50, 5); }
    if (k > 0.4) { g.fillStyle = "#ff8fb1"; rr(g, 134, 46, 44, 12, 6); g.fill(); }
    for (let i = 0; i < 3; i++) if (k > 0.5 + i * 0.12) { g.fillStyle = ["#f2cc8f", "#cfe3dc", "#e8dff7"][i]; rr(g, 126 + i * 43, 72, 38, 40, 5); g.fill(); }
    if (k > 0.85) { g.fillStyle = "#e4e7ef"; g.fillRect(126, 120, 124, 6); g.fillRect(126, 132, 90, 6); }
  } else if (id === "checker") {
    g.fillStyle = "#eceef3"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.fillRect(40, 8, 176, 152);
    for (let i = 0; i < 12; i++) { g.fillStyle = "#c9cdd6"; g.fillRect(54, 22 + i * 11, 120 + ((i * 37) % 30), 4); }
    const hl = Math.floor(t * 0.7) % 12;
    g.fillStyle = "rgba(255,214,90,.65)"; g.fillRect(52, 19 + hl * 11, 130 * clamp(frac(t * 0.7) * 2, 0, 1), 9);
    const mx = 100 + Math.sin(t * 1.3) * 50, my = 50 + Math.cos(t * 0.9) * 35;
    g.strokeStyle = "#7a5233"; g.lineWidth = 4; g.beginPath(); g.arc(mx, my, 18, 0, 7); g.stroke();
    g.fillStyle = "rgba(200,230,255,.35)"; g.fill(); g.beginPath(); g.moveTo(mx + 13, my + 13); g.lineTo(mx + 28, my + 28); g.stroke();
    g.fillStyle = "#2fb67a"; g.font = "700 11px Inter, sans-serif"; g.fillText("✓ " + (hl + 1) + "/12 facts", 176, 152);
  } else if (id === "seo") {
    // SEO audit: a Google results page with the clinic climbing, a score ring, and checks ticking off
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); bar("SEO audit · dentist near me", "#3fae74");
    const rank = 1 + (7 - (Math.floor(t * 0.35) % 7));
    g.fillStyle = "#f1f3f4"; rr(g, 8, 24, 140, 14, 7); g.fill(); g.fillStyle = "#70757a"; g.font = "500 8px Inter, sans-serif"; g.fillText("dentist near me", 18, 34);
    for (let i = 0; i < 6; i++) {
      const y = 46 + i * 18, me = i + 1 === Math.min(rank, 6);
      if (me) { g.fillStyle = "rgba(63,174,116,.14)"; g.fillRect(6, y - 3, 146, 17); }
      g.fillStyle = me ? "#1a73e8" : "#8ab4f8"; g.fillRect(12, y, me ? 78 : 56 + ((i * 23) % 30), 4);
      g.fillStyle = "#c4c7cc"; g.fillRect(12, y + 7, 110 - ((i * 17) % 40), 3);
      if (me) { g.fillStyle = "#3fae74"; g.font = "700 8px Inter, sans-serif"; g.fillText("#" + rank, 128, y + 8); }
    }
    const items = ["Title & meta", "Google profile", "Page speed", "Reviews", "Local links"], n = Math.floor(t * 0.7) % (items.length + 3);
    items.forEach((it, i) => {
      const y = 104 + i * 11; g.fillStyle = i < n ? (i === 2 ? "#e0475a" : "#2fb67a") : "#c3c8d4"; g.font = "700 8px Inter, sans-serif"; g.fillText(i < n ? (i === 2 ? "✗" : "✓") : "○", 160, y);
      g.fillStyle = "#3a3f4f"; g.font = "500 8px Inter, sans-serif"; g.fillText(it, 172, y);
    });
    const sc = Math.min(n, items.length) / items.length * 0.62 + 0.2;
    g.lineWidth = 7; g.strokeStyle = "#e6e9f2"; g.beginPath(); g.arc(205, 62, 24, 0, 7); g.stroke();
    g.strokeStyle = sc > 0.6 ? "#3fae74" : "#e8b931"; g.beginPath(); g.arc(205, 62, 24, -Math.PI / 2, -Math.PI / 2 + sc * Math.PI * 2); g.stroke();
    g.fillStyle = "#2b2e3a"; g.font = "700 13px Inter, sans-serif"; g.textAlign = "center"; g.fillText(Math.round(sc * 100) + "", 205, 67); g.textAlign = "left";
    const mx = 80 + Math.sin(t * 1.1) * 55, my = 80 + Math.cos(t * 0.8) * 28;
    g.strokeStyle = "#8a6a45"; g.lineWidth = 3.5; g.beginPath(); g.arc(mx, my, 14, 0, 7); g.stroke();
    g.fillStyle = "rgba(200,230,255,.3)"; g.fill(); g.beginPath(); g.moveTo(mx + 10, my + 10); g.lineTo(mx + 22, my + 22); g.stroke();
  } else if (id === "sender") {
    g.fillStyle = "#f7f8fb"; g.fillRect(0, 0, w, h); bar("New message", "#3d7be0");
    g.fillStyle = "#6a7080"; g.font = "500 10px Inter, sans-serif"; g.fillText("To:  hello@smiledental.ie", 12, 34); g.fillText("Subject:  A new website for you", 12, 50);
    g.fillStyle = "#e3e6ee"; g.fillRect(12, 56, 232, 1);
    const k = frac(t * 0.12) * 7;
    for (let i = 0; i < 6; i++) { const L = [190, 210, 160, 200, 120, 80][i], f = clamp(k - i, 0, 1); g.fillStyle = "#9aa0ae"; g.fillRect(12, 68 + i * 12, L * f, 5); if (f > 0 && f < 1) { g.fillStyle = "#3d7be0"; g.fillRect(12 + L * f + 2, 65 + i * 12, 2, 10); } }
    g.fillStyle = k > 6.5 ? "#2fb67a" : "#3d7be0"; rr(g, 186, 136, 58, 18, 9); g.fill(); g.fillStyle = "#fff"; g.font = "600 10px Inter, sans-serif"; g.fillText(k > 6.5 ? "Sent ✓" : "Send", 198 + (k > 6.5 ? -4 : 0), 149);
  } else if (id === "inbox") {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); bar("Inbox", "#4fd1c5");
    const names = ["Dr. Byrne", "Smile Dental", "Cork Physio", "Bright Vets", "Lee Dental", "Ash Clinic", "Glen Optics"];
    const shift = frac(t * 0.25), top = Math.floor(t * 0.25);
    for (let i = 0; i < 7; i++) {
      const y = 22 + (i + (i === 0 ? 0 : 0)) * 20 + (i ? 0 : 0) - (1 - Math.min(1, shift * 4)) * (i === 0 ? 20 : 0);
      const isNew = i === 0;
      g.fillStyle = isNew ? "rgba(79,209,197,.12)" : "#fff"; g.fillRect(0, y, w, 19);
      g.fillStyle = isNew ? "#4fd1c5" : "#d5d8e0"; g.beginPath(); g.arc(12, y + 10, 4, 0, 7); g.fill();
      g.fillStyle = "#2b2e3a"; g.font = (isNew ? "700" : "500") + " 10px Inter, sans-serif"; g.fillText(names[(top + 7 - i) % 7], 22, y + 13);
      g.fillStyle = "#c3c8d4"; g.fillRect(110, y + 8, 110 - (i * 13) % 40, 4);
      g.fillStyle = "#eef0f4"; g.fillRect(0, y + 19, w, 1);
    }
    if (shift < 0.3) { g.fillStyle = "rgba(79,209,197," + (0.6 - shift * 2) + ")"; g.beginPath(); g.arc(12, 32, 4 + shift * 40, 0, 7); g.fill(); }
  } else if (id === "followup") {
    g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, w, h); bar("Follow-up plan", "#e8b931");
    const days = ["M", "T", "W", "T", "F"];
    days.forEach((d, i) => { g.fillStyle = "#8a90a0"; g.font = "600 10px Inter, sans-serif"; g.fillText(d, 26 + i * 46, 34); for (let r = 0; r < 4; r++) { g.strokeStyle = "#e6e3da"; g.strokeRect(12 + i * 46, 40 + r * 28, 42, 26); } });
    const k = frac(t * 0.2) * 5;
    for (let r = 0; r < 3; r++) {
      const day = (r * 2) % 5; g.fillStyle = ["#e8b931", "#ff8fb1", "#4fd1c5"][r]; rr(g, 15 + day * 46, 44 + r * 28, 36, 18, 5); g.fill();
      const tx = 15 + Math.min(4, day + Math.floor(k)) * 46;
      if (k > 1) { g.strokeStyle = "#8b7bff"; g.lineWidth = 2; g.beginPath(); g.moveTo(51 + day * 46, 53 + r * 28); g.quadraticCurveTo((51 + day * 46 + tx) / 2, 40 + r * 28, tx, 53 + r * 28); g.stroke(); g.lineWidth = 1; }
    }
    g.fillStyle = "#2fb67a"; g.font = "700 12px Inter, sans-serif"; g.fillText("✓", 30 + (Math.floor(k) % 5) * 46, 150);
  }
}

// Sherlock's second monitor: visibility trend + Core Web Vitals bars
function drawChartScreen(g, t, working) {
  const w = 256, h = 160;
  g.fillStyle = working ? "#11131c" : "#151826"; g.fillRect(0, 0, w, h);
  if (!working) { g.fillStyle = "rgba(255,255,255,.25)"; g.font = "600 12px Inter, sans-serif"; g.textAlign = "center"; g.fillText("Local visibility", w / 2, h / 2 + 4); g.textAlign = "left"; return; }
  g.fillStyle = "#f2f3f7"; g.font = "600 12px Inter, sans-serif"; g.fillText("Local visibility", 12, 20);
  g.fillStyle = "#3fae74"; g.font = "700 12px Inter, sans-serif"; g.fillText("▲ " + (12 + (Math.floor(t * 0.5) % 9)) + "%", 196, 20);
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; for (let y = 36; y < 110; y += 18) { g.beginPath(); g.moveTo(12, y); g.lineTo(244, y); g.stroke(); }
  const k = frac(t * 0.12), N = 12, pts = [];
  for (let i = 0; i < N; i++) pts.push(100 - i * 5.2 - 9 * Math.sin(i * 1.3) - 4 * Math.sin(t * 0.6 + i));
  const shown = Math.max(2, Math.ceil(N * Math.min(1, k * 1.4)));
  const gr = g.createLinearGradient(0, 30, 0, 110); gr.addColorStop(0, "rgba(63,174,116,.45)"); gr.addColorStop(1, "rgba(63,174,116,0)");
  g.beginPath(); g.moveTo(14, 108); for (let i = 0; i < shown; i++) g.lineTo(14 + i * 20.5, pts[i]); g.lineTo(14 + (shown - 1) * 20.5, 108); g.closePath(); g.fillStyle = gr; g.fill();
  g.beginPath(); for (let i = 0; i < shown; i++) g.lineTo(14 + i * 20.5, pts[i]); g.strokeStyle = "#4fd18f"; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(14 + (shown - 1) * 20.5, pts[shown - 1], 3.5, 0, 7); g.fill();
  [["LCP", 0.72, "#4fd18f"], ["CLS", 0.9, "#4fd18f"], ["INP", 0.45, "#e8b931"]].forEach(([lb, v, c], i) => {
    const x = 14 + i * 80; g.fillStyle = "#9aa0ae"; g.font = "600 9px Inter, sans-serif"; g.fillText(lb, x, 128);
    g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x, 134, 66, 7); g.fillStyle = c; g.fillRect(x, 134, 66 * v * (0.85 + 0.15 * Math.sin(t + i)), 7);
  });
}

// ───────────────────────── styles ─────────────────────────
const CSS = `
.so-root{position:absolute;inset:0;overflow:hidden;font-family:Inter,system-ui,-apple-system,sans-serif;-webkit-tap-highlight-color:transparent}
.so-root canvas{display:block;outline:none;touch-action:none}
.so-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.so-lbl{pointer-events:auto;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;user-select:none;-webkit-user-select:none;padding-bottom:26px}
.so-pill{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;border-radius:999px;background:rgba(255,255,255,.74);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);border:1px solid rgba(255,255,255,.9);color:#1b1d2b;font-size:11px;line-height:1.25;white-space:nowrap;box-shadow:0 6px 18px -8px rgba(20,16,40,.45),inset 0 1px 0 rgba(255,255,255,.8);transition:transform .15s ease}
.so-lbl:hover .so-pill{transform:translateY(-1px) scale(1.04)}
.so-pill i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 8px var(--c)}
.so-pill b{font-weight:600;letter-spacing:-.01em}
.so-st{color:#5a6072;font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.so-root.far .so-st{max-width:150px}
.so-st:before{content:"·";margin:0 5px 0 0;color:#a3a8b6}
.so-full{display:none;max-width:230px;white-space:normal;text-align:center;padding:6px 10px;border-radius:12px;background:rgba(17,18,30,.86);color:#f2f3f7;font-size:11px;line-height:1.35;box-shadow:0 10px 24px -10px rgba(0,0,0,.6)}
.so-full small{display:block;color:#a9adbb;margin-top:2px}
.so-lbl:hover .so-full,.so-lbl.open .so-full{display:block}
.so-tag{display:none;padding:3px 9px;border-radius:9px;font-size:10.5px;font-weight:600;color:#fff;background:var(--c);box-shadow:0 6px 16px -6px var(--c);white-space:nowrap}
.so-tag.on{display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.so-root.compact .so-tag.on{max-width:150px;font-size:9.5px}
.so-tag.wait{background:linear-gradient(135deg,#8b7bff,#ff8fb1);animation:soPulse 1.5s ease-in-out infinite}
@keyframes soPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(139,123,255,.55)}50%{transform:scale(1.06);box-shadow:0 0 0 7px rgba(139,123,255,0)}}
.so-root.compact .so-st{display:none}
.so-root.compact .so-pill{padding:3px 8px 3px 6px;font-size:10px}
.so-human .so-pill{background:rgba(23,24,38,.78);color:#fff;border-color:rgba(255,255,255,.25)}
.so-human .so-st{color:#c9ccd8}
.so-bub{display:none;margin-left:6px;padding:4px 7px;border-radius:10px 10px 10px 3px;background:#fff;box-shadow:0 2px 8px -3px rgba(20,16,40,.45),0 0 0 1px rgba(0,0,0,.05);gap:3px;align-items:center}
.so-bub.on{display:inline-flex}
.so-say{display:none;max-width:210px;white-space:normal;text-align:left;padding:6px 10px;border-radius:12px 12px 12px 3px;background:#fff;color:#1b1d2b;font-size:11px;line-height:1.3;font-weight:500;box-shadow:0 8px 20px -10px rgba(20,16,40,.55),0 0 0 1px rgba(0,0,0,.05);border-left:3px solid var(--c);animation:soPop .25s ease-out}
.so-say.on{display:block}
.so-root.compact .so-say{max-width:150px;font-size:10px;padding:4px 7px}
.so-money{display:none;position:relative;padding:5px 12px;border-radius:999px;background:linear-gradient(135deg,#ffd54a,#f0a500);color:#3b2a00;font-weight:800;font-size:12px;box-shadow:0 10px 26px -8px rgba(240,165,0,.9);animation:soPop .35s ease-out}
.so-money.on{display:flex;gap:4px;align-items:center}
.so-money em{font-style:normal}
.so-money span{display:inline-block;animation:soCoin 1.1s ease-in-out infinite}
.so-money span:nth-child(2){animation-delay:.15s}.so-money span:nth-child(3){animation-delay:.3s}
@keyframes soPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes soCoin{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px) rotate(12deg)}}
.so-bub span{width:5px;height:5px;border-radius:50%;background:var(--c);animation:soDot 1s ease-in-out infinite}
.so-bub span:nth-child(2){animation-delay:.15s}.so-bub span:nth-child(3){animation-delay:.3s}
@keyframes soDot{0%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-3px);opacity:1}}
.so-room .so-st{display:none}.so-room .so-pill{background:rgba(79,209,197,.9);color:#0b2a28;border-color:rgba(255,255,255,.7)}
.so-z{pointer-events:none;position:relative;width:40px;height:44px;font-weight:700;color:#8b7bff;text-shadow:0 1px 0 #fff,0 0 8px rgba(255,255,255,.9)}
.so-z span{position:absolute;left:4px;bottom:0;opacity:0;animation:soZ 3.6s ease-in-out infinite}
.so-z span:nth-child(1){font-size:11px}.so-z span:nth-child(2){font-size:15px;animation-delay:1.2s}.so-z span:nth-child(3){font-size:12px;animation-delay:2.4s}
@keyframes soZ{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(20px,-36px);opacity:0}}
`;

// ───────────────────────── mount ─────────────────────────
export function mountOffice(container, { getState, onSelectAgent, onSelectManager, onSelectFounder, onSelectMeeting, onMoney, pollMs = 2000, debug } = {}) {
  let T = 0, srvNow = Date.now(), srvT = 0;
  const res = { mats: new Map(), geos: new Map(), list: [] };
  RES = res;
  const rootEl = document.createElement("div"); rootEl.className = "so-root"; container.appendChild(rootEl);
  const style = document.createElement("style"); style.textContent = CSS; rootEl.appendChild(style);
  const size = () => ({ w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) });
  let { w: CW, h: CH } = size();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CW < 640 ? 1 : 1.5));
  renderer.setSize(CW, CH);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  rootEl.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer(); labelRenderer.setSize(CW, CH);
  labelRenderer.domElement.className = "so-labels"; rootEl.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04); scene.environment = envRT.texture; pmrem.dispose();

  // camera
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const DEF_DIR = new THREE.Vector3().setFromSphericalCoords(1, 0.98, Math.PI / 4);
  const DEF_TARGET = new THREE.Vector3(0, 0, 0.3);
  camera.position.copy(DEF_TARGET).addScaledVector(DEF_DIR, 60);
  camera.lookAt(DEF_TARGET);
  const defZoom = () => (CW / CH < 0.8 ? 1.35 : CW < 640 ? 1.2 : 1);
  const fit = () => {
    const aspect = CW / CH; let halfH = 12.2; if (halfH * aspect < 19.0) halfH = 19.0 / aspect;
    camera.left = -halfH * aspect; camera.right = halfH * aspect; camera.top = halfH; camera.bottom = -halfH; camera.updateProjectionMatrix();
  };
  fit(); camera.zoom = defZoom(); camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEF_TARGET); controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minZoom = 0.75; controls.maxZoom = 6; controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.22;
  controls.minAzimuthAngle = -0.25; controls.maxAzimuthAngle = Math.PI / 2 + 0.25; controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.9;
  controls.update();

  // lights
  const hemi = new THREE.HemisphereLight("#fff5e8", "#cdb79a", 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0da", 2.9); sun.position.set(13, 18, 7); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 17, bottom: -17, near: 1, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.025;

  // world
  const CAB = cabinLayout(), BEDS = bedSpots();
  const office = buildOffice(scene, CAB, BEDS);
  const graph = buildGraph(CAB, BEDS);
  const W = { CAB, BEDS, graph, office, live: { office_open: false, agents: {}, handoffs: [], pending_approvals: 0 }, clock: () => srvNow + (T - srvT) * 1000, coffeeQ: new BarQueue(COFFEE), foodQ: new BarQueue(FOOD) };
  W.addToTray = (id, color) => {
    const tray = office.trays[id]; if (!tray) return;
    const st = tray.userData.stack;
    if (st.length >= 6) { const old = st.shift(); tray.remove(old); st.forEach((f, i) => (f.position.y = 0.02 + i * 0.016)); }
    const f = makeFolder(color); f.position.set((Math.random() - 0.5) * 0.03, 0.02 + st.length * 0.016, (Math.random() - 0.5) * 0.02); f.rotation.y = (Math.random() - 0.5) * 0.25 + Math.PI / 2;
    f.scale.setScalar(0.95); tray.add(f); st.push(f);
  };
  Object.keys(office.trays).forEach((id, i) => { for (let k = 0; k < 1 + (i % 2); k++) W.addToTray(id, LOOK[AGENTS[(i + k + 2) % AGENTS.length].id].accent); });

  // humans
  const hani = buildHani(); hani.root.position.set(office.hani.x, 0, office.hani.z); scene.add(hani.root); hani.root.userData.pick = { kind: "founder" };
  const muffy = buildMuffy(); muffy.root.position.set(office.muffy.x, 0, office.muffy.z); scene.add(muffy.root); muffy.root.userData.pick = { kind: "manager" };
  const readSheet = new THREE.Group(); readSheet.add(place(mesh(G.box(), mat("#ffffff")), 0, 0, 0, 0, 0, 0, 0.2, 0.26, 0.004));
  for (let i = 0; i < 5; i++) readSheet.add(place(mesh(G.box(), mat("#c9cdd6")), -0.02, 0.08 - i * 0.035, 0.003, 0, 0, 0, 0.13, 0.008, 0.002));
  muffy.arms.R.hand.add(readSheet); readSheet.position.set(0.09, -0.06, 0.05); readSheet.rotation.set(-0.9, 0, 0.1);
  const envApproved = mesh(G.plane(), track(new THREE.MeshBasicMaterial({ map: signTex("APPROVED", null, { w: 256, h: 64, color: "#d7262c", size: 36, weight: 800 }), transparent: true, toneMapped: false })));
  place(envApproved, 0, 0.0075, 0.0, -Math.PI / 2, 0, 0.2, 0.15, 0.04, 1); envApproved.visible = false; office.muffy.envelope.add(envApproved);
  W.muffyCtl = {
    envOn: false, stampT: -1, hideT: -1,
    envelope(show) { const e = office.muffy.envelope; this.envOn = show; e.visible = show; envApproved.visible = false; e.position.copy(office.muffy.envSpot); e.rotation.set(0, 0.2, 0); },
    stamp() { this.stampT = 0; if (!this.envOn) this.envelope(true); },
  };

  // cats
  const cats = AGENTS.map((a, i) => { const c = new Cat(a, i, W); scene.add(c.root); return c; });
  const catById = Object.fromEntries(cats.map((c) => [c.id, c])); W.cats = cats;
  cats.forEach((c) => c.placeAt("bed"));

  // labels
  const mkLabel = (name, accent, cls, onClick) => {
    const el = document.createElement("div"); el.className = "so-lbl " + (cls || ""); el.style.setProperty("--c", accent);
    el.innerHTML = `<div class="so-say"></div><div class="so-money"></div><div class="so-full"></div><div class="so-tag"></div><div class="so-pill"><i></i><b>${esc(name)}</b><span class="so-st"></span><span class="so-bub"><span></span><span></span><span></span></span></div>`;
    let downAt = 0;
    el.addEventListener("pointerdown", (e) => { e.stopPropagation(); downAt = performance.now(); });
    el.addEventListener("click", (e) => { e.stopPropagation(); if (e.pointerType !== "mouse" || performance.now() - downAt < 600) { el.classList.toggle("open"); onClick(); } });
    return { el, st: el.querySelector(".so-st"), tag: el.querySelector(".so-tag"), full: el.querySelector(".so-full"), bub: el.querySelector(".so-bub"), say: el.querySelector(".so-say"), money: el.querySelector(".so-money"), last: {} };
  };
  const labelObjs = [];
  cats.forEach((c) => {
    const L = mkLabel(c.def.name, c.look.accent, "", () => select({ kind: "cat", id: c.id }));
    const o = new CSS2DObject(L.el); c.labelAnchor.add(o); c.label = L; labelObjs.push(o);
    const z = document.createElement("div"); z.className = "so-z"; z.innerHTML = "<span>z</span><span>Z</span><span>z</span>";
    const zo = new CSS2DObject(z); c.zAnchor.add(zo); c.zzz = zo; labelObjs.push(zo);
  });
  const hLabel = (h, name, role, accent, kind, y) => {
    const L = mkLabel(name, accent, "so-human", () => select({ kind }));
    L.st.textContent = role; const a = new THREE.Object3D(); a.position.set(0, y, 0); h.root.add(a); const o = new CSS2DObject(L.el); a.add(o); labelObjs.push(o); L.anchor = a; return L;
  };
  const haniLbl = hLabel(hani, PEOPLE.founder.name, PEOPLE.founder.role, "#8b7bff", "founder", 1.78);
  const muffyLbl = hLabel(muffy, PEOPLE.manager.name, PEOPLE.manager.role, "#d7262c", "manager", 1.58);
  const roomLbl = mkLabel("Meeting room", "#0f766e", "so-room", () => select({ kind: "meeting" }));
  const roomObj = new CSS2DObject(roomLbl.el);
  { const a = new THREE.Object3D(); a.position.set(4.8, 2.75, 0.25); scene.add(a); a.add(roomObj); labelObjs.push(roomObj); }

  // ── state polling
  const seen = new Set(); let inited = false, destroyed = false, busy = false;
  const startMorning = (c, delay) => { c.needsCoffee = true; c.wakeAt = W.clock() + delay; };
  function applyState(s) {
    if (!s || typeof s !== "object") return;
    RES = res;
    srvNow = typeof s.now === "number" ? s.now : Date.now(); srvT = T;
    const wasOpen = W.live.office_open;
    W.live = { office_open: !!s.office_open, opened_at: s.opened_at ?? null, agents: s.agents ?? {}, handoffs: s.handoffs ?? [], pending_approvals: s.pending_approvals ?? 0 };
    const now = W.clock();
    let firstApply = false;
    if (!inited) {
      inited = true; firstApply = true;
      const opened = s.opened_at ? Date.parse(s.opened_at) : NaN;
      const morning = W.live.office_open && isFinite(opened) && now - opened >= -60000 && now - opened < MORNING_WINDOW;
      cats.forEach((c, i) => {
        if (!W.live.office_open || morning) { c.placeAt("bed"); if (morning) startMorning(c, 300 + ((i * 937) % 6000)); }
        else { const g = c.desiredGoal(); c.placeAt(g === "manager" ? "manager" : g === "desk" ? "desk" : "bed"); }
      });
      night = nightTarget = W.live.office_open ? 0 : 1;
    } else if (!wasOpen && W.live.office_open) {
      cats.forEach((c, i) => startMorning(c, Math.random() * 6000 + i * 0));
    }
    if (!W.live.office_open) cats.forEach((c) => { c.carryQueue.length = 0; c.needsCoffee = false; c.needsFood = false; });
    // finished work live (working/waiting → idle): stop at the food bar before napping
    cats.forEach((c) => {
      const st = W.live.agents?.[c.id]?.state ?? "idle";
      if (st === "working" || st === "waiting" || st === "ready" || st === "off") c.needsFood = false;
      else if (st === "idle" && W.live.office_open && (c.prevState === "working" || c.prevState === "waiting" || c.prevState === "ready") && inited && !firstApply) c.needsFood = true;
      c.prevState = st;
    });
    for (const h of W.live.handoffs) {
      if (h == null || seen.has(h.id)) continue; seen.add(h.id);
      const at = Date.parse(h.at);
      if (!W.live.office_open || !(now - at < HANDOFF_WINDOW) || h.from === h.to || !catById[h.from] || !CAB[h.to]) continue;
      catById[h.from].carryQueue.push({ to: h.to, lead: h.lead ?? "", id: h.id });
    }
    // speech bubbles ("say") and the 💰 moment ("money") from the pipeline's event feed
    for (const e of s.events ?? []) {
      if (e == null || seen.has("e" + e.id)) continue; seen.add("e" + e.id);
      const c = catById[e.agent]; if (!c) continue;
      const age = now - Date.parse(e.at);
      if (firstApply || !(age < 60000)) continue;
      if (e.type === "say") { c.sayText = trunc(String(e.text || ""), 90); c.sayUntil = T + 5.5; c.speakUntil = T + 2.5; }
      else if (e.type === "money") { c.moneyText = String(e.text || "Paid!"); c.moneyUntil = T + 6; c.sayText = trunc(String(e.text || ""), 90); c.sayUntil = T + 6; onMoney?.(e); }
    }
    nightTarget = W.live.office_open ? 0 : 1;
  }
  async function poll() {
    if (busy || destroyed || typeof getState !== "function") return;
    busy = true;
    try { const s = await getState(); if (!destroyed) applyState(s); } catch (_) { /* ignore */ } finally { busy = false; }
  }
  poll();
  const pollId = setInterval(poll, pollMs);

  // ── selection / picking
  function agentInfo(c) {
    const s = c.live();
    return { ...c.def, accent: c.look.accent, state: s.state ?? "idle", task: s.task ?? null, lead: s.lead ?? null, location: c.locationName(), status: c.statusText() };
  }
  function select(p) {
    if (!p) return;
    if (p.kind === "cat") onSelectAgent?.(agentInfo(catById[p.id]));
    else if (p.kind === "manager") onSelectManager?.();
    else if (p.kind === "founder") onSelectFounder?.();
    else if (p.kind === "meeting") onSelectMeeting?.();
  }
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const find = (objs) => { for (const h of ray.intersectObjects(objs, true)) { let o = h.object; while (o && !o.userData.pick) o = o.parent; if (o) return o.userData.pick; } return null; };
    return find([...cats.map((c) => c.root), hani.root, muffy.root]) || find([office.pick.managerVolume, office.pick.meetingVolume]);
  }
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e) => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dtm = performance.now() - down.t; down = null;
    if (moved < 7 && dtm < 700) select(pickAt(e.clientX, e.clientY));
  };
  let hoverAt = 0;
  const onMove = (e) => {
    if (down || e.pointerType !== "mouse") return; const n = performance.now(); if (n - hoverAt < 90) return; hoverAt = n;
    renderer.domElement.style.cursor = pickAt(e.clientX, e.clientY) ? "pointer" : "grab";
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  // ── camera focus
  const cam = { target: null, zoom: null, follow: null, dir: null };
  const _off = new THREE.Vector3(), _tv = new THREE.Vector3();
  function focusTo(target, zoom, follow = null, dir = null) { cam.target = target ? target.clone() : null; cam.zoom = zoom; cam.follow = follow; cam.dir = dir; }
  controls.addEventListener("start", () => { cam.dir = null; cam.zoom = null; });
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 4);
    if (cam.follow) cam.target = cam.follow();
    if (cam.target) {
      _tv.copy(cam.target).sub(controls.target).multiplyScalar(k);
      controls.target.add(_tv); camera.position.add(_tv);
      if (!cam.follow && controls.target.distanceTo(cam.target) < 0.01) cam.target = null;
    }
    if (cam.zoom != null) { camera.zoom = lerp(camera.zoom, cam.zoom, k); camera.updateProjectionMatrix(); if (Math.abs(camera.zoom - cam.zoom) < 0.005) cam.zoom = null; }
    if (cam.dir) {
      _off.copy(camera.position).sub(controls.target); const len = _off.length();
      _off.normalize().lerp(cam.dir, k).normalize(); camera.position.copy(controls.target).addScaledVector(_off, len);
      if (_off.distanceTo(cam.dir) < 0.002) cam.dir = null;
    }
  }

  // ── day / night
  let night = 0, nightTarget = 0, lastNight = -1;
  const cDaySky = new THREE.Color("#fff5e8"), cNightSky = new THREE.Color("#b9a6d6"), cDayG = new THREE.Color("#cdb79a"), cNightG = new THREE.Color("#5a4340");
  const cSun = new THREE.Color("#fff0da"), cMoon = new THREE.Color("#a8b6ff"), cWin = new THREE.Color("#ffffff"), cWinN = new THREE.Color("#26325e");
  function applyNight() {
    if (Math.abs(night - lastNight) < 0.002) return; lastNight = night; const n = night;
    hemi.intensity = lerp(0.9, 0.42, n); hemi.color.lerpColors(cDaySky, cNightSky, n); hemi.groundColor.lerpColors(cDayG, cNightG, n);
    sun.intensity = lerp(2.9, 0.35, n); sun.color.lerpColors(cSun, cMoon, n);
    office.lampLights.forEach((l) => (l.intensity = n * 11));
    office.lampGlows.forEach((g) => (g.material.opacity = n * 0.5));
    office.shadeMat.emissiveIntensity = n * 1.6; office.bulbMat.emissiveIntensity = 0.25 + n * 1.8;
    office.windowMats.forEach((m) => m.color.lerpColors(cWin, cWinN, n));
    const envK = lerp(1, 0.5, n);
    res.list.forEach((m) => { if (m && m.isMeshStandardMaterial && m.userData.baseEnv != null) m.envMapIntensity = m.userData.baseEnv * envK; });
    renderer.toneMappingExposure = lerp(1.0, 0.92, n);
  }

  // ── humans animation
  const tmpW = new THREE.Vector3();
  const setArm = (h, side, v) => h.arms[side].tgt.copy(v);
  function humanArms(h, dt) {
    for (const k of ["L", "R"]) { const a = h.arms[k]; a.cur.lerp(a.tgt, 1 - Math.exp(-dt * 9)); armIK(a); }
  }
  // humans walking between their own chair and the meeting room
  W.meeting = null;
  const mkWalker = (h, home, homeNode, meetSeat, meetNode, lbl, lblY) => ({ h, home, homeNode, meetSeat, meetNode, lbl, lblY, at: "home", target: "home", phase: "seated", sit: 1, t: 0,
    pos: { x: home.x, z: home.z }, heading: home.h, seatH: home.y / h.S, path: null, s: 0, v: 0, gait: 0, speakUntil: -1 });
  const hw = mkWalker(hani, { x: office.hani.x, z: office.hani.z, h: 0, y: 0.56 }, "hani:desk", { ...MEET.hani, y: MEET.seatY }, "meet:hani", haniLbl, 1.78);
  const mw = mkWalker(muffy, { x: office.muffy.x, z: office.muffy.z, h: 0, y: 0.5 }, "muffy:desk", { ...MEET.muffy, y: MEET.seatY }, "meet:muffy", muffyLbl, 1.58);
  function updateWalker(w, dt) {
    const h = w.h, N = graph.N;
    if (w.phase === "seated") { if (w.target !== w.at) { w.phase = "stand"; w.t = 0; } }
    else if (w.phase === "stand") {
      w.t += dt; w.sit = 1 - ease(w.t / 0.7);
      if (w.t >= 0.7) {
        const from = w.at === "home" ? w.homeNode : w.meetNode, to = w.target === "home" ? w.homeNode : w.meetNode, seat = w.target === "home" ? w.home : w.meetSeat;
        const pts = [{ ...w.pos }, ...route(graph, from, to).map((id) => N.get(id)), { x: seat.x, z: seat.z }];
        w.path = new Path(smoothPath(pts, 0.35)); w.s = 0; w.v = 0; w.phase = "walk"; w.at = "away";
      }
    } else if (w.phase === "walk") {
      const rem = w.path.total - w.s;
      w.v += clamp(Math.min(1.15, Math.sqrt(2 * 1.6 * rem) + 0.1) - w.v, -3 * dt, 2 * dt);
      w.s = Math.min(w.path.total, w.s + w.v * dt);
      const p = w.path.at(w.s), q = w.path.at(Math.min(w.path.total, w.s + 0.4));
      w.pos.x = p.x; w.pos.z = p.z;
      if (Math.hypot(q.x - p.x, q.z - p.z) > 0.01) w.heading += angDiff(w.heading, headingTo(q.x - p.x, q.z - p.z)) * (1 - Math.exp(-dt * 7));
      w.gait += dt * w.v / 0.95;
      if (rem < 0.01) { w.phase = "sitdown"; w.t = 0; w.seatH = (w.target === "home" ? w.home.y : w.meetSeat.y) / h.S; }
    } else if (w.phase === "sitdown") {
      w.t += dt; const seat = w.target === "home" ? w.home : w.meetSeat;
      w.heading += angDiff(w.heading, seat.h) * (1 - Math.exp(-dt * 9)); w.v = Math.max(0, w.v - dt * 3);
      w.sit = ease((w.t - 0.15) / 0.75);
      if (w.t >= 0.95) { w.phase = "seated"; w.at = w.target; w.sit = 1; w.heading = seat.h; }
    }
    // apply body: root, hips height, legs
    const k = w.phase === "walk" ? clamp(w.v / 0.5, 0, 1) : 0, ph = w.gait * Math.PI * 2;
    h.root.position.set(w.pos.x, 0, w.pos.z); h.root.rotation.y = w.heading;
    h.hips.position.y = lerp(h.standH, w.seatH, w.sit) + 0.022 * k * Math.abs(Math.cos(ph));
    h.legs.forEach((L) => {
      const q = ph + (L.s > 0 ? 0 : Math.PI);
      L.hip.rotation.x = -Math.PI / 2 * w.sit - 0.42 * k * Math.sin(q);
      L.knee.rotation.x = Math.PI / 2 * w.sit + 0.65 * k * Math.max(0, Math.cos(q)) + 0.05 * k;
    });
  }
  function humanAway(h, w, t, dt, who) {
    // walking / standing / seated in the meeting room
    const ph = w.gait * Math.PI * 2, k = w.phase === "walk" ? clamp(w.v / 0.5, 0, 1) : 0;
    const talk = w.speakUntil > t;
    let hy = 0, hp = 0.02, lean = 0.04;
    if (w.phase === "seated" && w.at === "meet") {
      const look = (x, z) => clamp(angDiff(w.heading, headingTo(x - w.pos.x, z - w.pos.z)), -1.1, 1.1);
      const cat = W.meeting && catById[W.meeting.agentId];
      const others = [cat ? [cat.pos.x, cat.pos.z] : [MEET.cat.x, MEET.cat.z], who === "founder" ? [mw.pos.x, mw.pos.z] : [hw.pos.x, hw.pos.z]];
      const tgt = cat && cat.speakUntil > t ? others[0] : (who === "manager" && hw.speakUntil > t ? others[1] : (who === "founder" && mw.speakUntil > t ? others[1] : others[Math.floor(t / 4 + (who === "founder" ? 0 : 1.5)) % 2]));
      hy = look(tgt[0], tgt[1]); hp = 0.12; lean = 0.08;
      const ty = who === "founder" ? 0.16 : 0.22, tz = who === "founder" ? 0.34 : 0.3;
      setArm(h, "L", _tv.set(0.15, ty, tz));
      if (talk) { setArm(h, "R", _tv.set(-0.18, h.SH - 0.08 + 0.07 * Math.sin(t * 5), 0.3 + 0.04 * Math.sin(t * 3))); hp = 0.06 + 0.07 * Math.sin(t * 6); }
      else setArm(h, "R", _tv.set(-0.15, ty, tz));
    } else {
      [["L", 1], ["R", -1]].forEach(([side, sd]) => setArm(h, side, _tv.set(sd * 0.25, h.SH - 0.42 + (1 - k) * 0.02, -sd * 0.14 * k * Math.sin(ph) + 0.04)));
      lean = 0.03 + 0.04 * k; hp = 0.04;
    }
    const kk = 1 - Math.exp(-dt * 5);
    const st = who === "founder" ? hs : ms;
    st.hy = lerp(st.hy, hy, kk); st.hp = lerp(st.hp, hp, kk); st.lean = lerp(st.lean, lean, kk);
    h.head.rotation.set(st.hp, st.hy, 0); h.torso.rotation.x = st.lean; h.torso.rotation.y = k * 0.06 * Math.sin(ph);
    humanArms(h, dt);
  }
  function releaseProps() {
    if (hs.mugHeld) { office.dynamic.attach(office.hani.mug); office.hani.mug.position.copy(office.hani.mugHome); office.hani.mug.rotation.set(0, 0, 0); hs.mugHeld = false; }
    if (ms.stampHeld) { office.dynamic.attach(office.muffy.stamp); office.muffy.stamp.position.copy(office.muffy.stampHome); office.muffy.stamp.rotation.set(0, 0, 0); ms.stampHeld = false; }
    readSheet.visible = false;
  }
  function updateHumans(t, dt) {
    for (const [w, who] of [[hw, "founder"], [mw, "manager"]]) {
      updateWalker(w, dt);
      // in the meeting, lift the humans' labels so they clear the cat's label
      w.boost = lerp(w.boost ?? 0, w.at === "meet" ? (who === "founder" ? 0.6 : 0.75) * (CW < 700 ? 1.6 : 1) : 0, 1 - Math.exp(-dt * 4));
      w.lbl.anchor.position.y = w.lblY + (w.h.standH - w.seatH) * w.h.S * (1 - w.sit) + w.boost;
      w.lbl.bub.classList.toggle("on", w.speakUntil > t);
      if (w.phase === "seated" && w.at === "home") { w.h.torso.rotation.y = 0; who === "founder" ? updateHani(t, dt) : updateMuffy(t, dt); }
      else { releaseProps(); humanAway(w.h, w, t, dt, who); }
    }
  }
  const hs = { lean: 0, hy: 0, hp: 0, mugHeld: false };
  function updateHani(t, dt) {
    const H = hani, cyc = t % 26;
    H.root.updateMatrixWorld(true);
    const kx = office.hani.x, kz = -8.62;
    let lean = 0.1, hy = 0.08 * Math.sin(t * 0.4), hp = 0.1;
    let mode = cyc < 15 ? "type" : cyc < 19 ? "lean" : cyc < 23.2 ? "sip" : "type";
    if (mode === "type") {
      [["L", 1], ["R", -1]].forEach(([k, s]) => setArm(H, k, toTorso(H, tmpW.set(kx + s * 0.1, 0.83 + 0.014 * Math.max(0, Math.sin(t * 13 + s * 1.7)), kz))));
    } else if (mode === "lean") {
      lean = -0.16; hy = 0.55 * Math.sin((cyc - 15) * 1.4); hp = -0.05;
      setArm(H, "L", _tv.set(0.3, -0.02, 0.18)); setArm(H, "R", _tv.set(-0.3, -0.02, 0.18));
    } else {
      const u = cyc - 19; lean = 0.02; hp = 0.05;
      setArm(H, "L", toTorso(H, tmpW.set(kx + 0.1, 0.83, kz)));
      const mug = office.hani.mug;
      if (u < 0.7) setArm(H, "R", toTorso(H, tmpW.copy(office.hani.mugHome).add(_v1.set(-0.02, 0.06, -0.05))));
      else if (u < 3.4) {
        if (!hs.mugHeld) { H.arms.R.hand.attach(mug); hs.mugHeld = true; }
        setArm(H, "R", _tv.set(-0.04, H.SH + 0.13, 0.22)); hp = u > 1.2 && u < 2.6 ? -0.18 : 0.0;
      } else {
        setArm(H, "R", toTorso(H, tmpW.copy(office.hani.mugHome).add(_v1.set(-0.02, 0.06, -0.05))));
        if (hs.mugHeld && u > 3.9) { office.dynamic.attach(mug); mug.position.copy(office.hani.mugHome); mug.rotation.set(0, 0, 0); hs.mugHeld = false; }
      }
    }
    if (mode !== "sip" && hs.mugHeld) { office.dynamic.attach(office.hani.mug); office.hani.mug.position.copy(office.hani.mugHome); office.hani.mug.rotation.set(0, 0, 0); hs.mugHeld = false; }
    const k = 1 - Math.exp(-dt * 3);
    hs.lean = lerp(hs.lean, lean, k); hs.hy = lerp(hs.hy, hy, k); hs.hp = lerp(hs.hp, hp, k);
    H.torso.rotation.x = hs.lean; H.head.rotation.set(hs.hp, hs.hy, 0);
    H.torso.scale.setScalar(1 + 0.006 * Math.sin(t * 2.2));
    humanArms(H, dt);
  }
  const ms = { hy: 0, hp: 0, lean: 0, stampHeld: false };
  function updateMuffy(t, dt) {
    const H = muffy, C = W.muffyCtl, M = office.muffy;
    H.root.updateMatrixWorld(true);
    const post = catById.sender, waiting = post.act?.type === "mgr" && ["wait", "hopOn", "approved"].includes(post.act.phase);
    let hy = 0, hp = 0.15, lean = 0.05, reading = false;
    const deskL = toTorso(H, tmpW.set(M.x + 0.16, 0.8, office.muffy.envSpot.z - 0.1)), deskR = toTorso(H, _v1.set(M.x - 0.16, 0.8, office.muffy.envSpot.z - 0.1));
    if (C.stampT >= 0) {
      C.stampT += dt; const u = C.stampT;
      const home = M.stampHome, env = office.muffy.envSpot;
      let p;
      if (u < 0.4) p = tmpW.copy(home).add(_v2.set(0, 0.12, 0));
      else if (u < 0.75) p = tmpW.copy(home).lerp(env, (u - 0.4) / 0.35).add(_v2.set(0, 0.3, 0));
      else if (u < 0.95) p = tmpW.copy(env).add(_v2.set(0, lerp(0.3, 0.13, (u - 0.75) / 0.2), 0));
      else if (u < 1.35) p = tmpW.copy(env).add(_v2.set(0, 0.13 + (u - 0.95) * 0.5, 0));
      else p = tmpW.copy(home).add(_v2.set(0, 0.12, 0));
      if (u > 0.35 && !ms.stampHeld) { H.arms.L.hand.attach(M.stamp); ms.stampHeld = true; M.stamp.position.set(0, -0.2, 0.0); M.stamp.rotation.set(0, 0, 0); }
      if (ms.stampHeld) { M.stamp.position.lerp(_v2.set(0, -0.19, 0.01), 0.2); }
      if (u > 0.95 && !envApproved.visible) envApproved.visible = true;
      setArm(H, "L", toTorso(H, p)); setArm(H, "R", deskR);
      hy = 0.25; hp = 0.35;
      if (u > 1.7) {
        if (ms.stampHeld) { office.dynamic.attach(M.stamp); M.stamp.position.copy(M.stampHome); M.stamp.rotation.set(0, 0, 0); ms.stampHeld = false; }
        C.stampT = -1; C.hideT = 2.2;
      }
    } else if (waiting) {
      const look = headingTo(post.pos.x - M.x, post.pos.z - M.z);
      hy = clamp(look, -0.8, 0.8) * (Math.sin(t * 0.5) > -0.3 ? 1 : 0.2); hp = Math.sin(t * 0.5) > -0.3 ? 0.08 : 0.35;
      setArm(H, "L", deskL); setArm(H, "R", deskR); lean = 0.08;
    } else {
      const cyc = t % 18;
      if (cyc < 10) { reading = true; hp = 0.35 + 0.04 * Math.sin(t * 0.7); hy = 0.06 * Math.sin(t * 0.5); setArm(H, "R", _tv.set(-0.08, H.SH - 0.08, 0.3)); setArm(H, "L", _v2.set(0.12, H.SH - 0.12, 0.28)); }
      else {
        // typing on / reading his laptop
        hy = -0.28 + 0.06 * Math.sin(t * 0.6); hp = 0.32;
        const lx = M.x - 0.28, lz = MANAGER.deskZ - 0.31;
        setArm(H, "L", toTorso(H, tmpW.set(lx + 0.07, 0.81 + 0.012 * Math.max(0, Math.sin(t * 12)), lz)));
        setArm(H, "R", toTorso(H, tmpW.set(lx - 0.09, 0.81 + 0.012 * Math.max(0, Math.sin(t * 12 + 2)), lz)));
      }
    }
    if (C.hideT > 0) { C.hideT -= dt; if (C.hideT <= 0) C.envelope(false); }
    readSheet.visible = reading;
    const k = 1 - Math.exp(-dt * 4);
    ms.hy = lerp(ms.hy, hy, k); ms.hp = lerp(ms.hp, hp, k); ms.lean = lerp(ms.lean, lean, k);
    H.head.rotation.set(ms.hp, ms.hy, 0); H.torso.rotation.x = ms.lean; H.torso.scale.setScalar(1 + 0.007 * Math.sin(t * 2.4));
    if (Math.random() < dt * 0.25) H.eyesL.forEach((e) => (e.scale.y = 0.1)); else H.eyesL.forEach((e) => (e.scale.y = Math.min(1, e.scale.y + dt * 8)));
    humanArms(H, dt);
  }

  // ── labels refresh
  let labelT = 0, bubT = 0;
  function refreshLabels() {
    const compact = CW < 700 ? camera.zoom < 1.8 : camera.zoom < 0.95;
    rootEl.classList.toggle("compact", compact); rootEl.classList.toggle("far", camera.zoom < 1.4);
    for (const c of cats) {
      const L = c.label, s = c.live(), act = c.activity();
      const st = c.statusText();
      if (L.last.st !== st) { L.st.textContent = st; L.last.st = st; }
      let tag = "", tagCls = "";
      if (act === "delivering" && c.carryQueue[0]) { const to = AGENTS.find((a) => a.id === c.carryQueue[0].to); tag = `→ ${to?.name}: ${c.carryQueue[0].lead || "handoff"}`; L.tag.style.setProperty("--c", LOOK[c.carryQueue[0].to].accent); }
      else if (act === "waiting" || act === "to-manager") { tag = `Waiting for approval · ${W.live.pending_approvals || 1}`; tagCls = "wait"; }
      else if (act === "approved") { tag = "Approved ✓"; }
      if (L.last.tag !== tag + tagCls) { L.tag.textContent = tag; L.tag.className = "so-tag" + (tag ? " on " + tagCls : ""); L.last.tag = tag + tagCls; }
      const full = `${esc(c.def.role)}${s.task ? " — " + esc(s.task) : ""}${s.lead ? `<small>Lead: ${esc(s.lead)}</small>` : ""}`;
      if (L.last.full !== full) { L.full.innerHTML = full; L.last.full = full; }
      c.zzz.visible = c.act?.type === "bed" && ["sleep", "lie"].includes(c.act.phase);
      L.bub.classList.toggle("on", c.speakUntil > T);
      const say = c.sayUntil > T ? c.sayText : "";
      if (L.last.say !== say) { L.say.textContent = say; L.say.classList.toggle("on", !!say); L.last.say = say; }
      const money = c.moneyUntil > T ? c.moneyText : "";
      if (L.last.money !== money) { L.money.innerHTML = money ? `<span>💰</span><span>🪙</span><span>💰</span><em>${esc(money)}</em>` : ""; L.money.classList.toggle("on", !!money); L.last.money = money; }
    }
  }

  // ── screens
  let screenT = 0;
  function updateScreens(t, dt) {
    screenT += dt; const redraw = screenT > 0.12; if (redraw) screenT = 0;
    for (const c of cats) {
      const S = office.screens[c.id], working = c.act?.type === "desk" && c.act.phase === "work";
      if (working !== S.working || (working && redraw)) {
        drawScreen(c.id, S.g, t, working); S.tex.needsUpdate = true;
        if (S.chart) { drawChartScreen(S.chart.g, t, working); S.chart.tex.needsUpdate = true; }
        S.working = working;
      }
      const go = working ? 0.32 + night * 0.25 + 0.04 * Math.sin(t * 3 + c.idx) : 0;
      S.glow.material.opacity = lerp(S.glow.material.opacity, go, 1 - Math.exp(-dt * 3));
    }
  }

  // ── loop
  let raf = 0, last = performance.now();
  function tick(dt) {
    RES = res; T += dt;
    for (const c of cats) c.update(dt, T);
    updateHumans(T, dt);
    night = lerp(night, nightTarget, 1 - Math.exp(-dt * 0.8)); if (Math.abs(night - nightTarget) < 0.001) night = nightTarget; applyNight();
    updateScreens(T, dt);
    labelT -= dt; if (labelT < 0) { refreshLabels(); labelT = 0.25; }
    bubT -= dt; if (bubT < 0) { bubT = 0.1; roomObj.visible = !W.meeting; for (const c of cats) c.label.bub.classList.toggle("on", c.speakUntil > T); }
    updateCamera(dt); controls.update();
  }
  function draw() { renderer.render(scene, camera); labelRenderer.render(scene, camera); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    tick(dt); draw();
  }
  const onVis = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && !destroyed) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => {
    const s = size(); if (s.w === CW && s.h === CH) return; CW = s.w; CH = s.h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CW < 640 ? 1 : 1.5));
    renderer.setSize(CW, CH); labelRenderer.setSize(CW, CH); fit();
  });
  ro.observe(container);
  applyNight(); refreshLabels();
  if (!document.hidden) raf = requestAnimationFrame(frame);

  if (debug && typeof debug === "object") Object.assign(debug, {
    applyState, cats, W, hw, mw, camera, controls, draw, refreshLabels, renderer,
    step(sec, h = 1 / 30) { while (sec > 1e-6) { const d = Math.min(h, sec); tick(d); sec -= d; } refreshLabels(); },
    pause() { cancelAnimationFrame(raf); raf = 0; }, resume() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    time: () => T,
  });
  const catWorld = (c) => new THREE.Vector3(c.pos.x, c.y + 0.35, c.pos.z);
  return {
    destroy() {
      if (destroyed) return; destroyed = true;
      cancelAnimationFrame(raf); clearInterval(pollId); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("pointermove", onMove);
      controls.dispose();
      labelObjs.forEach((o) => o.removeFromParent());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); }); });
      res.list.forEach((x) => x?.dispose?.());
      envRT.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
      rootEl.remove();
    },
    focusAgent(id, zoom = 2.6) { const c = catById[id]; if (!c) return; focusTo(catWorld(c), zoom, () => catWorld(c)); },
    focusManager(zoom = 2.4) { focusTo(new THREE.Vector3(-6.25, 0.7, -8.4), zoom); },
    focusFounder(zoom = 2.4) { focusTo(new THREE.Vector3(-12, 0.8, -8.6), zoom); },
    resetView() { focusTo(DEF_TARGET, defZoom(), null, DEF_DIR.clone()); },
    agents() { return cats.map(agentInfo); },
    startMeeting(agentId) {
      const c = catById[agentId]; if (!c) return;
      const prev = W.meeting?.agentId; if (prev && prev !== agentId) catById[prev].speakUntil = -1;
      W.meeting = { agentId }; hw.target = "meet"; mw.target = "meet";
      focusTo(new THREE.Vector3(MEET.focus.x, MEET.focus.y, MEET.focus.z), CW / CH < 0.8 ? 4.4 : 3.1);
    },
    endMeeting() {
      if (W.meeting) catById[W.meeting.agentId].speakUntil = -1;
      W.meeting = null; hw.target = "home"; mw.target = "home"; hw.speakUntil = mw.speakUntil = -1;
    },
    meetingSpeak(who, ms = 2500) {
      const until = T + Math.max(0, Number(ms) || 0) / 1000;
      if (who === "founder") hw.speakUntil = until;
      else if (who === "manager") mw.speakUntil = until;
      else if (who === "agent" && W.meeting) catById[W.meeting.agentId].speakUntil = until;
    },
    meeting() { return W.meeting ? { agentId: W.meeting.agentId } : null; },
    focusMeeting(zoom = CW / CH < 0.8 ? 4.4 : 3.1) { focusTo(new THREE.Vector3(MEET.focus.x, MEET.focus.y, MEET.focus.z), zoom); },
  };
}
