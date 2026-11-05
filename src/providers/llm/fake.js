// A fake LLM for tests and offline development (LLM_PROVIDER=fake). It answers each agent's request with
// simple, well-formed output and calls Fluffy's tools, so the AI code paths (including record/replay) can be
// tested without a key. Never use it for real work.
export const name = "fake";
export function ready() { return process.env.LLM_PROVIDER === "fake"; }

const jsonAfter = (s, marker) => { const i = s.indexOf(marker); if (i < 0) return null; const a = s.indexOf("{", i); let depth = 0; for (let j = a; j < s.length; j++) { if (s[j] === "{") depth++; if (s[j] === "}" && --depth === 0) { try { return JSON.parse(s.slice(a, j + 1)); } catch { return null; } } } return null; };
const reply = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], text: JSON.stringify(obj), stopReason: "end_turn", usage: { input: 1000, output: 200 } });

export async function complete({ messages, tools }) {
  const first = String(messages[0].content);
  if (tools?.length) {
    const last = messages.at(-1);
    const results = Array.isArray(last.content) ? last.content.filter((c) => c.type === "tool_result") : [];
    if (!results.length) {
      const d = jsonAfter(first, "Do nothing else.") || {};
      return { content: [{ type: "tool_use", id: "t1", name: "create_invoice", input: d }], text: "", stopReason: "tool_use", usage: { input: 1200, output: 150 } };
    }
    const id = (String(results[0].content).match(/(INV2-[A-Z0-9-]+|SIM-INV-[A-Z0-9]+)/) || [])[1];
    if (messages.length < 4) return { content: [{ type: "tool_use", id: "t2", name: "send_invoice", input: { invoice_id: id } }], text: "", stopReason: "tool_use", usage: { input: 1300, output: 60 } };
    return { content: [{ type: "text", text: "Invoice created and sent." }], text: "Invoice created and sent.", stopReason: "end_turn", usage: { input: 1400, output: 20 } };
  }
  if (first.includes('{"facts"')) return reply({ facts: {} });
  if (first.includes('"headline"')) {
    const f = jsonAfter(first, "FACTS") || {};
    return reply({ headline: f.name, subheadline: (f.services || []).slice(0, 2).join(" · "), about: `${f.name} is at ${f.address}.`, services: (f.services || []).map((n) => ({ name: n, description: "" })), cta: "Get in touch" });
  }
  if (first.includes("COPY LINES")) return reply({ issues: [] });
  if (first.includes('"points"')) return reply({ points: ["Not mobile-friendly, so phone visitors struggle"] });
  if (first.includes('"intent"')) return reply({ intent: /yes|want it/i.test(first) ? "interested" : "question", summary: "Fake summary." });
  if (first.includes('"subject"')) { const v = jsonAfter(first, "Facts you may use:") || {}; return reply({ subject: `Hello ${v.business}`, body: `Hi ${v.owner_or_team},\n\n${v.concept_url || ""} ${v.checkout_url || ""} ${v.invoice_url || ""}\n\n${v.signature}` }); }
  return reply({});
}
