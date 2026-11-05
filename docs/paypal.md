# PayPal

Siteo Office uses three PayPal REST APIs:

| API | Used by | For |
|---|---|---|
| **Orders v2** (Checkout) | Scrapper | The deposit link when a customer says yes |
| **Invoicing v2** | Fluffy | The invoice for the balance, sent once the deposit is confirmed, plus reminders |
| **Webhooks** | the server | Knowing when money arrives (with signature verification) |

Always start in **Sandbox**: fake money, real APIs.

## 1. Create a Sandbox app

1. Go to **[developer.paypal.com](https://developer.paypal.com)** and log in with your PayPal account (any account works; you never spend real money in Sandbox).
2. Open **Apps & Credentials** in the top menu.
3. Make sure the toggle at the top says **Sandbox** (not Live).
4. Click **Create App**. Name it e.g. "Siteo Office", type **Merchant**, and pick the default Sandbox business account. Create.
5. You now see the app's **Client ID** and a **Secret** (click to show). Copy both.
6. In the app's settings, check that **Invoicing** is listed among the enabled features (it is for new Sandbox apps; if you see a features list, tick it).

Put the keys in `.env` (or your Render environment), never in code or config files:

```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=<your sandbox client id>
PAYPAL_CLIENT_SECRET=<your sandbox secret>
```

Restart. The header badge changes from **Payments simulated** to **PayPal sandbox**.

## 2. Sandbox test accounts

PayPal creates two test accounts for you: a **business** account (you, the studio, receiving money) and a **personal** account (the test buyer).

1. In the developer dashboard, open **Testing Tools → Sandbox Accounts**.
2. Find the **Personal** account. Click the **⋯ → View/Edit account** to see its email and password (you can set a new password there).
3. Use these when the PayPal Checkout page asks you to log in. Its Sandbox balance pays the deposit.
4. To see money arriving, log in to **[sandbox.paypal.com](https://www.sandbox.paypal.com)** with the **Business** account.

On a public demo you can show judges which test buyer to use with `DEMO_BUYER_HINT` (for example, "Log in with the sandbox buyer shown in the README"). Only ever share **sandbox** test credentials, never real ones.

## 3. The Checkout flow (deposit)

1. A customer replies "yes". Scrapper calls `POST /v2/checkout/orders` with:
   - `intent: CAPTURE`, one purchase unit: `amount` = `depositPercent` × `conceptPrice`, `reference_id` = the lead id, a description;
   - `payment_source.paypal.experience_context`: your studio as `brand_name`, `user_action: PAY_NOW`, `shipping_preference: NO_SHIPPING`, `return_url` = `<PUBLIC_URL>/paypal/return`, `cancel_url`.
   - A `PayPal-Request-Id` header makes it idempotent (asking twice gives the same order).
2. The `payer-action` link goes into the deposit email, which you approve.
3. The customer pays on PayPal and is redirected to `/paypal/return?token=<order id>`.
4. The server calls `POST /v2/checkout/orders/{id}/capture`. When the capture is `COMPLETED`: **💰 Deposit paid**, and Fluffy starts.

The return URL works without webhooks, so this is enough for local testing. If the customer closes the tab before returning, the webhook (below) captures it instead.

## 4. The Invoicing flow (balance)

1. Fluffy is given three tools: `create_invoice`, `send_invoice`, `get_invoice`, and the exact details (customer, item "Website build: … (balance)", amount = price − deposit, currency, note).
2. The AI calls `create_invoice` → the app calls `POST /v2/invoicing/invoices` (a draft with your studio as invoicer, the business as recipient, your `invoiceTerms`, NET-10).
3. It calls `send_invoice` → `POST /v2/invoicing/invoices/{id}/send`. PayPal emails the invoice (in Sandbox, PayPal doesn't email real inboxes; open the payer link from the **Money** tab instead).
4. When the invoice is paid: webhook `INVOICING.INVOICE.PAID`, or the **Check invoices now** button / background check (every minute, `GET /v2/invoicing/invoices/{id}`), sets the lead to **paid**: second 💰.
5. While unpaid, Fluffy drafts reminder emails (with the PayPal payer link) after `FOLLOWUP_AFTER_MINUTES`, up to `safety.maxFollowups`, each one approved by you.

### PayPal Agent Toolkit (optional)

Fluffy's tools are named like those in PayPal's official [Agent Toolkit](https://github.com/paypal/agent-toolkit). To have the official toolkit execute them:

```bash
npm install @paypal/agent-toolkit
```
```
PAYPAL_AGENT_TOOLKIT=true
```

Fluffy then takes the toolkit's own tool definitions for `create_invoice`, `send_invoice` and `get_invoice` and the toolkit makes the PayPal calls. The Money tab shows "(PayPal Agent Toolkit)" next to the tool calls. Without it, the built-in adapter runs the same tools. The toolkit is used in live mode (with an AI key), because the AI reads the toolkit's tool schemas; in demo mode Fluffy's two calls are scripted against the built-in tools.

## 5. Webhooks

Webhooks need a public HTTPS URL (Render gives you one; locally use a tunnel such as `cloudflared` or `ngrok`, or rely on the return URL).

1. In your app on developer.paypal.com, scroll to **Sandbox Webhooks → Add Webhook**.
2. URL: `https://<your app>/webhooks/paypal`
3. Events: **Checkout order approved** (`CHECKOUT.ORDER.APPROVED`), **Payment capture completed** (`PAYMENT.CAPTURE.COMPLETED`), **Invoicing invoice paid** (`INVOICING.INVOICE.PAID`).
4. Save and copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`.

How the server treats a webhook:

- If `PAYPAL_WEBHOOK_ID` is set, it asks PayPal to verify the signature (`/v1/notifications/verify-webhook-signature`) and rejects anything that fails.
- In every case it **re-reads the order or invoice from PayPal's API** before changing anything, so a forged webhook can't mark something paid.
- Handling is idempotent: a capture or invoice is only processed once, whether it arrives by return URL, webhook or the background check.

You can send test events from the developer dashboard's **Webhooks simulator**; real Sandbox payments are the best test.

## 6. Going live

1. Test the whole flow in Sandbox first.
2. On developer.paypal.com switch the toggle to **Live**, create a Live app, copy its Client ID and Secret.
3. Add a Live webhook with the same URL and events; copy its Webhook ID.
4. Set `PAYPAL_ENV=live` and the three Live values. Restart.
5. Make sure your PayPal business account is verified and can receive money and send invoices in your country and currency.
6. Real customers now pay real money. Check your local tax and invoicing rules (VAT numbers, invoice numbering, terms).

## Troubleshooting

| Problem | Fix |
|---|---|
| "PayPal auth failed" | Keys and `PAYPAL_ENV` don't match (Sandbox keys need `sandbox`). |
| `UNPROCESSABLE_ENTITY` on invoices | Usually currency or email format. Use a currency your account supports; recipient emails must look valid. |
| Payment done but nothing happened | Locally, make sure you came back through the return URL. Otherwise set up webhooks, or press **Check invoices now**. |
| Webhook "signature check failed" | `PAYPAL_WEBHOOK_ID` is from a different app or environment. |
