# Providers

Everything that talks to the outside world is a small adapter in `src/providers/`. Pick one with an environment variable, or add your own.

| Kind | Folder | Choose with | Built in |
|---|---|---|---|
| LLM | `src/providers/llm/` | `LLM_PROVIDER` | `claude` |
| Business search | `src/providers/search/` | `SEARCH_PROVIDER` | `osm`, `google`, `apify` (+ `demo`) |
| Email | `src/providers/email/` | `EMAIL_PROVIDER` | `test`, `smtp` |
| Payments | `src/providers/payments/` | PayPal keys present? | `paypal`, `simulated` |

## LLM

**Claude (default).** Uses the Anthropic Messages API with plain `fetch` (no SDK).

```
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=...                 # required; choose from Anthropic's model list
AI_USD_PER_MTOK_INPUT=3          # your model's prices, for the cost cap
AI_USD_PER_MTOK_OUTPUT=15
MAX_AI_USD_PER_RUN=2
```

The model name is never hardcoded: set `CLAUDE_MODEL` to the model you want. Set the two price variables to your model's current per-million-token prices so the cost cap is accurate.

**Cost cap.** Every call adds its token cost to the run. When a run reaches `MAX_AI_USD_PER_RUN`, the next AI call throws and the run stops with status `stopped` and a clear note. Work already done (concepts, drafts) is kept.

**Interface** (`src/providers/llm/<name>.js`):

```js
export const name = "myllm";
export function ready() { return Boolean(process.env.MYLLM_KEY); }
// messages: [{ role: "user" | "assistant", content: string | blocks }]
// tools: [{ name, description, input_schema }]  (Anthropic-style)
export async function complete({ system, messages, maxTokens, tools }) {
  return {
    content: [/* { type: "text", text } | { type: "tool_use", id, name, input } */],
    text: "…",                          // all text blocks joined
    stopReason: "end_turn" | "tool_use",
    usage: { input: 123, output: 45 },  // tokens, for the cost cap
  };
}
```

Register it in `src/providers/llm/index.js` (`const PROVIDERS = { claude, myllm }`) and set `LLM_PROVIDER=myllm`. Tool use is only needed for Fluffy's invoicing agent; if your model has no tool calling, translate to its format inside `complete`.

## Business search

All return `[{ name, website, phone?, address?, email?, source, sourceId }]`.

| Provider | Setting | Notes |
|---|---|---|
| `osm` (default) | `OSM_CONTACT` (your URL/email for the User-Agent) | Free. Nominatim finds the town's bounding box; Overpass finds places with the niche's `osmTags` and a website. Follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) (max 1 request/second, identify yourself). Set `OVERPASS_URL` for your own Overpass server. Coverage of websites varies by country. |
| `google` | `GOOGLE_PLACES_API_KEY` | Places API (New) Text Search, field mask limited to name, website, address, phone. Billed by Google. |
| `apify` | `APIFY_TOKEN`, optional `APIFY_ACTOR` (default `compass~crawler-google-places`) | Runs the actor synchronously and reads its dataset. Billed by Apify. |

Shared settings: `MAX_BUSINESSES_PER_RUN` (default 12), `SHORTLIST_SIZE` (default 3).

**Add one:** write `async function mine(niche, town, limit)` in `src/providers/search/index.js`, add it to `PROVIDERS`, set `SEARCH_PROVIDER=mine`. Use official APIs only.

## Email

| Provider | Setting | Notes |
|---|---|---|
| `test` (default) | – | Approved emails are stored and shown in the dashboard's **Inbox** tab. Nothing leaves the app. Always used in demo mode. |
| `smtp` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Needs `npm install nodemailer` (an optional dependency). `SMTP_TEST_RECIPIENT` reroutes every email to you while testing. A `List-Unsubscribe` header is added. |

Replies: in v1 you paste or type replies into the Inbox tab and Scrapper reads them. An IMAP/inbound-webhook adapter is a good first contribution.

**Add one:** implement `send({ from, to, subject, text, html, headers })` → `{ provider, messageId, deliveredTo }` in `src/providers/email/index.js`.

## Payments

`src/providers/payments/index.js` picks **PayPal** when `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set, otherwise the **simulated** adapter (clearly labelled pages at `/sim/...`, no money, for keyless demos).

The interface (both adapters):

| Function | PayPal API |
|---|---|
| `createOrder({ amount, currency, description, referenceId, returnUrl, cancelUrl, brandName })` → `{ id, status, approveUrl }` | `POST /v2/checkout/orders` |
| `getOrder(id)`, `captureOrder(id)` | `GET /v2/checkout/orders/{id}`, `POST …/capture` |
| `createInvoice({ referenceId, currency, items, recipient, invoicer, note, terms })` → `{ id, number, status }` | `POST /v2/invoicing/invoices` |
| `sendInvoice(id)` → `{ payerUrl }`, `getInvoice(id)`, `remindInvoice(id, note)` | `POST …/send`, `GET …`, `POST …/remind` |
| `verifyWebhook(headers, event)` → boolean | `POST /v1/notifications/verify-webhook-signature` |

**Adding Stripe:** create `src/providers/payments/stripe.js` with the same exports (Checkout Sessions for `createOrder`, Stripe Invoicing for `createInvoice`/`sendInvoice`), select it in `index.js` (e.g. `PAYMENTS_PROVIDER=stripe`), and add a webhook route in `server.js` that calls `pipeline.depositConfirmed()` / `pipeline.invoicePaid()`. The pipeline doesn't know which provider is behind it.

See [paypal.md](paypal.md) for the full PayPal setup.
