# Deployment

## Render (one click)

The repo includes a `render.yaml` blueprint.

1. Record the demo's AI run locally once (`npm run record-demo`, see [getting started](getting-started.md#record-the-demos-ai-run-once)) and commit `demo/recorded/`. Then push the repo to your GitHub account.
2. Click **Deploy to Render** in the README, or go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** and pick the repo.
3. Render reads `render.yaml` and asks for the secret values: the PayPal **Sandbox** keys (and optionally `PAYPAL_WEBHOOK_ID`, `DEMO_BUYER_HINT`). The blueprint sets `PUBLIC_DEMO=true`: the hosted copy always replays the pipeline on fictional sample data, real searches and AI are switched off (even if keys are added), live PayPal keys are refused, and the Teach editor is read-only. Visitors can click through without a password.
4. Click **Apply**. After the build, open the `https://<name>.onrender.com` URL.
5. Optional: add the PayPal webhook (`https://<name>.onrender.com/webhooks/paypal`) and put its id in `PAYPAL_WEBHOOK_ID` ([paypal.md](paypal.md#5-webhooks)).

Notes:

- `RENDER_EXTERNAL_URL` is set by Render, so links in emails and PayPal return URLs are correct without `PUBLIC_URL`.
- **ADMIN_TOKEN.** If you set it, the dashboard asks for it before any action (start a run, approve, reply). An open demo doesn't need one: demo mode can't contact real businesses or spend AI money. **Add a token before you add an AI key or switch off demo mode.**
- The free plan sleeps when idle (first load takes ~30 s) and its disk is temporary, so `data/db.json` resets on redeploys. For a real studio, use a paid plan with a [persistent disk](https://render.com/docs/disks) mounted at e.g. `/var/data` and set `DATA_DIR=/var/data`.
- Data is a JSON file (`data/db.json`), no database that could expire. The free plan resets it on redeploys, which is fine for a demo.
- The free plan sleeps after ~15 minutes idle; the first request then takes 30–60 seconds (the page shows "Waking up the office…").
- For live mode on Render (your own instance): remove `PUBLIC_DEMO`, set `DEMO_MODE=false`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, keep `ADMIN_TOKEN`, and set up SMTP when you're ready.

## Local

```bash
git clone https://github.com/<you>/siteo-office.git
cd siteo-office
npm install
cp .env.example .env
npm run dev        # restarts on code changes
# or: npm start
```

Open http://localhost:3000. Run the end-to-end test with `npm test`.

## Any other host

It's a single Node process with no build step: `node server.js`, listening on `PORT`. It needs a writable `DATA_DIR`. Put it behind HTTPS and set `PUBLIC_URL` to the public address. A health check is at `/healthz`.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DEMO_MODE` | on when no AI key | `true` forces fictional demo data and rule-based agents |
| `PUBLIC_DEMO` | `false` | `true` locks a hosted copy to demo mode whatever keys are set (Sandbox PayPal only, Teach read-only) |
| `PORT` | `3000` | HTTP port |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` or `http://localhost:PORT` | Base URL for concept links and PayPal return URLs |
| `ADMIN_TOKEN` | – | Require this token for dashboard actions |
| `DATA_DIR` | `data` | Where `db.json` is stored |
| `LLM_PROVIDER` | `claude` | LLM adapter |
| `ANTHROPIC_API_KEY` | – | Claude API key (turns on live mode) |
| `CLAUDE_MODEL` | – | Claude model name (required for live mode) |
| `CLAUDE_TEMPERATURE` | model default | Optional sampling temperature |
| `AI_USD_PER_MTOK_INPUT` / `_OUTPUT` | `3` / `15` | Your model's prices per million tokens (for the cap) |
| `MAX_AI_USD_PER_RUN` | `2` | Stop a run at this AI spend |
| `SEARCH_PROVIDER` | `osm` | `osm`, `google` or `apify` |
| `OSM_CONTACT` | – | Contact URL/email for the OpenStreetMap User-Agent |
| `OVERPASS_URL` | public servers | Your own Overpass endpoint |
| `GOOGLE_PLACES_API_KEY` | – | For `google` |
| `APIFY_TOKEN`, `APIFY_ACTOR` | –, `compass~crawler-google-places` | For `apify` |
| `MAX_BUSINESSES_PER_RUN` | `12` | Businesses Misso returns |
| `SHORTLIST_SIZE` | `3` | Concepts built per run |
| `USE_PAGESPEED` | `true` | Run Google PageSpeed |
| `PAGESPEED_API_KEY` | – | Higher PageSpeed quota |
| `EMAIL_PROVIDER` | `test` | `test` or `smtp` |
| `EMAIL_FROM` | `sender.email` | From address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | – | SMTP settings |
| `SMTP_TEST_RECIPIENT` | – | Send every email here instead (testing) |
| `PAYPAL_ENV` | `sandbox` | `sandbox` or `live` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | – | PayPal app credentials |
| `PAYPAL_WEBHOOK_ID` | – | Enables webhook signature verification |
| `PAYPAL_AGENT_TOOLKIT` | `false` | Use `@paypal/agent-toolkit` for Fluffy's tools |
| `DEMO_BUYER_HINT` | – | Text shown next to Sandbox payment buttons |
| `PACE_MS` | `2200` demo / `600` live | Pause between steps so the office animation keeps up |
| `FOLLOWUP_AFTER_MINUTES` | `2` demo / `4320` live | When Fluffy drafts a payment reminder |
