# FAQ

**Do I need any keys to try it?**
No. With an empty `.env` you get demo mode: fictional businesses, a replay of a recorded real AI run (or rule-based agents if there's no recording), a simulated checkout. Add PayPal Sandbox keys for real Sandbox payments.

**Is the demo's AI real?**
Yes: it replays outputs recorded from the real Claude agents on the fictional businesses (`npm run record-demo`). Nothing is invented for the demo except one deliberate slip in the first draft, so you can watch the real fact-check catch it. Typed replies that weren't recorded use the rule-based path.

**Are the demo businesses real?**
No. Every demo business, person, address and the town "Sampleton" are made up. Their old websites are served by the app itself and carry a "fictional" banner; their emails use the reserved `.example` domain.

**Does it send emails on its own?**
Never. Every email waits for a human to approve it. By default approved emails go to the built-in test inbox; real sending needs SMTP settings.

**Is this "training" the AI?**
No. You teach agents with plain-text instructions in `agents/*.md`, sent with each request. No fine-tuning, no data leaves your setup except the API calls you configure.

**Which AI model does it use?**
Whatever you set in `CLAUDE_MODEL`. Nothing is hardcoded. Set your model's prices (`AI_USD_PER_MTOK_INPUT/OUTPUT`) so the cost cap is accurate.

**How much does a run cost?**
Demo: nothing. Live: AI is the main cost. In Siteo's own use, about 125 concepts cost about $17 in total, so roughly $0.10–0.15 per business with a concept. A run stops at `MAX_AI_USD_PER_RUN` (default $2).

**Can I use another LLM?**
Yes, add an adapter in `src/providers/llm/` ([providers](providers.md)).

**Can I use Stripe instead of PayPal?**
The payments layer is an adapter; Stripe isn't included in v1, but [providers](providers.md#payments) describes exactly what to implement.

**Why does OpenStreetMap find few businesses in my town?**
OSM only knows websites that volunteers have added. Try Google Places or Apify, or a bigger town. You can also improve OSM yourself.

**What if a concept says something wrong?**
Snow Bell checks every line against the facts and rules, and you review the email (with the concept link) before it's sent. Add stricter rules in the niche's `rules.md`.

**Why is the 3D office slow on my laptop?**
It's WebGL. It pauses when the tab is hidden and lowers resolution on small screens. The dashboard works without it.

**Can I change the cats?**
Yes: names, roles, colours, fur pattern and accessories in `team.config.json` ([configuration](configuration.md)). Adding new roles is planned for a later version.

**Can I remove the "Built with Siteo Office" credit?**
Yes, set `"credit": false` in `studio.config.json`. We'd appreciate it if you kept it.

**Where is my data?**
In `data/db.json` on your server. Delete it (or press **Reset demo data**) to start over.

**Can I run it for clients other than dentists and restaurants?**
Yes. Make a niche pack in a few files ([niche packs](niche-packs.md)).
