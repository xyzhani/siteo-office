# Getting started

This guide takes you from zero to a full run: the cats find businesses, you approve an email, play the customer, pay a deposit with PayPal Sandbox and watch Fluffy invoice the balance.

## 1. Run it

You need [Node.js](https://nodejs.org) 20.12 or newer.

```bash
git clone https://github.com/<you>/siteo-office.git
cd siteo-office
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**. You'll see the office and a yellow **DEMO · fictional businesses** badge.

> Prefer the cloud? See [deployment](deployment.md) for one-click Render.

## 2. Your first run (demo mode)

1. In the **Run** tab, press **Start the team 🐾** (the box is pre-filled with an example; in demo mode the town is always the fictional "Sampleton").
2. Watch the office:
   - **Misso** searches and carries a folder to **Tom**.
   - **Tom** audits each fake "old website" (they're served by the app at `/demo-sites/...`, so Tom really fetches and reads them).
   - **Knight** builds a concept, walks it to **Snow Bell**.
   - On the first business, Knight's draft contains a deliberate slip ("the best dentist in town, 5-star reviews…"). **Snow Bell sends it back**: you'll see her carry the folder back to Knight and a speech bubble saying why. Round 2 passes.
   - **Sherlock** adds the SEO note, **Nemo** writes the email and then walks to the approvals desk and waits.
3. The **✉️ to approve** button turns pink. Open **Approvals**: read the email, edit anything, then **Approve & send**. (In demo mode emails go to the built-in **test inbox**, never to anyone real.)

## 3. Play the customer

1. Open **Inbox**. You'll see the email you approved, with a link to the concept site. Click it to see the concept.
2. Click the quick reply **"Yes, I want it"** (or type your own).
3. **Scrapper** reads it, creates a PayPal order for the 20% deposit and drafts a reply with the payment link. Approve it in **Approvals**.
4. Back in **Inbox** (or **Money**), click the payment link.
   - With no PayPal keys you get a clearly marked **simulated** checkout. Press pay.
   - With PayPal Sandbox keys you get the real PayPal Checkout. Log in with a **sandbox test buyer** (see [PayPal](paypal.md)).
5. You land back in the office: **💰 Deposit paid!** Scrapper hands the folder to **Fluffy**, who calls `create_invoice` → `send_invoice` and the funnel moves to **Invoice sent**.
6. In **Money**, click **Pay invoice as the customer**. When it's paid you get the second 💰 moment and the funnel shows **Paid**.

If the invoice stays unpaid, Fluffy drafts a friendly reminder for you to approve (after 2 minutes in demo mode, 3 days live).

## 4. Add PayPal Sandbox (recommended)

Follow [paypal.md](paypal.md). In short: create a Sandbox app at developer.paypal.com, then put its keys in `.env`:

```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

Restart. The badge says **PayPal sandbox** and deposits and invoices are real Sandbox transactions you can see in your Sandbox business account.

## 5. Go live with real businesses

1. Add an AI key and model:
   ```
   ANTHROPIC_API_KEY=...
   CLAUDE_MODEL=...           # pick a model from Anthropic's docs
   ```
   Demo mode switches off automatically when a key is set (force it back with `DEMO_MODE=true`).
2. Optional: choose a search provider (`SEARCH_PROVIDER=osm` is free; `google` or `apify` need keys).
3. Make it yours: [studio and team config](configuration.md), your [niche](niche-packs.md), your agents' [instructions](teaching-agents.md).
4. Start with the **test inbox** (`EMAIL_PROVIDER=test`) and read what the agents write. When you're happy, set up SMTP and use `SMTP_TEST_RECIPIENT` to send everything to yourself first.
5. Read [safety](safety.md) and check your local email laws before contacting real businesses.

## Troubleshooting

- **The office says it couldn't load.** It needs WebGL and loads three.js from a CDN. Everything else still works.
- **"Say where"**: in live mode type `<what> in <town>`, e.g. `restaurants in Bristol`.
- **OpenStreetMap is slow or busy**: public Overpass servers get busy; the app tries mirrors. You can set `OVERPASS_URL`.
- **PayPal auth failed**: check `PAYPAL_ENV` matches your keys (Sandbox keys only work with `sandbox`).
- **Reset everything**: Run tab → **Reset demo data** (or delete `data/db.json`).
