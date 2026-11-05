# Safety

Siteo Office contacts real businesses and handles real money, so it's built to be careful by default.

## What's on by default

| Safeguard | How it works |
|---|---|
| **Human approval before any email** | Agents only write drafts. Every email (first contact, deposit link, answers, reminders) waits in **Approvals** until a person clicks **Approve & send**. You can edit or reject it. This can't be switched off in v1. |
| **Unsubscribe line** | Every email ends with your postal address (`sender.address`) and "Reply 'unsubscribe' and we won't email you again". SMTP emails also carry a `List-Unsubscribe` header. |
| **Unsubscribes are honoured** | When a reply asks to stop, Scrapper adds the email and domain to a do-not-contact list, cancels pending drafts and future runs skip that business. |
| **Facts only** | Knight writes only from facts on the business's own website. Snow Bell blocks invented claims, superlatives, reviews, prices and numbers that aren't in the facts. 3 failed rounds → the concept is set aside, never sent. |
| **Honest concepts** | Every concept page says it's a concept preview by your studio, not the live site, and is `noindex`. |
| **Official APIs only** | OpenStreetMap (Nominatim/Overpass), Google Places API, Apify, Google PageSpeed, PayPal. No scraping of search engines. Website fetches identify themselves, time out after 15 s and read at most 2 MB. |
| **AI cost cap** | `MAX_AI_USD_PER_RUN` (default $2) stops a run before it spends more. |
| **Payments verified** | PayPal webhooks are signature-checked (with `PAYPAL_WEBHOOK_ID`) and the order/invoice is always re-read from PayPal before anything is marked paid. Sandbox is the default. |
| **Secrets stay secret** | Keys only in `.env` (git-ignored) or your host's environment. Nothing is logged or shown in the dashboard. |
| **Optional lock** | `ADMIN_TOKEN` protects every action on a public deployment. |
| **Demo is fictional** | Demo mode uses made-up businesses in a made-up town, on `.example` addresses, and never sends email. |

## Your responsibilities

Siteo Office is a tool. **You** are the sender and you must follow the laws where you and your recipients are. Before contacting real businesses:

- **Know your email law.** Examples: CAN-SPAM (US), GDPR and ePrivacy/PECR (EU/UK), CASL (Canada), Spam Act (Australia). Some countries allow one relevant, honest business-to-business email with an easy opt-out; others require prior consent. If in doubt, ask a professional.
- **Identify yourself** truthfully (real name, studio, postal address) and keep the unsubscribe line.
- **Send at a human pace.** Review each email; don't approve in bulk.
- **Respect data rules.** You're processing business contact data. Keep only what you need; delete data you no longer use (`data/db.json`).
- **Be honest in sales.** Don't promise rankings or results. The concept is a free sample; be clear about price and what's included.
- **Respect the APIs' terms** (OpenStreetMap usage policies, Google and Apify terms, PayPal's acceptable use).
- **Taxes and invoicing.** Live PayPal invoices are real invoices; check your local invoicing and tax requirements.

## Reporting a problem

Found a security issue? Please don't open a public issue; contact the maintainers privately (see the repository's security contact). For anything else, open an issue.
