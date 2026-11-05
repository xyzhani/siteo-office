# Configuration

Two JSON files at the project root make the office yours: **`studio.config.json`** (your brand and business terms) and **`team.config.json`** (your cats). Changes apply on the next page load / next run; no build step.

Secrets never go in these files. Keys live in `.env` (see [deployment](deployment.md)).

## studio.config.json

```json
{
  "name": "Your Studio",
  "logo": "/brand/logo.svg",
  "officeSign": "STUDIO",
  "website": "https://example.com",
  "colors": { "primary": "#6a5cff", "accent": "#ffb347", "ink": "#1b1d2b", "paper": "#f7f5f0" },
  "sender": { "name": "Alex from Your Studio", "email": "hello@example.com", "signature": "Alex\nYour Studio · example.com", "address": "Your Studio, 1 Example Street, Example City" },
  "people": { "founder": { "name": "You", "role": "Founder" }, "manager": { "name": "Muffy", "role": "Approvals" } },
  "conceptPrice": 500,
  "depositPercent": 20,
  "currency": "USD",
  "language": "en",
  "invoiceTerms": "Balance due before the website goes live. Includes one round of changes.",
  "credit": true,
  "safety": { "unsubscribeLine": true, "approveInvoices": false, "maxFollowups": 3 }
}
```

| Field | What it does |
|---|---|
| `name` | Your studio name: page title, header, concept banner ("Concept preview made by …"), PayPal brand name, invoice "from". |
| `logo` | Path or URL of your logo. Put the file in `brand/` and use `/brand/<file>`. Shown in the header and favicon. |
| `officeSign` | The big sign on the office wall (up to 14 characters). Defaults to your name in capitals. |
| `website` | Your website: invoice details, concept footer link. |
| `colors.primary` | Main button colour in the dashboard. (`accent`, `ink`, `paper` are available to templates as `studio.colors.*`.) |
| `sender.name` | The "From" name on emails. |
| `sender.email` | The "From" address (or set `EMAIL_FROM` in `.env`). |
| `sender.signature` | Placed at the end of every email (`{signature}` in `emails.md`). Use `\n` for new lines. |
| `sender.address` | Your postal address, shown above the unsubscribe line. Many email laws require one. |
| `people.founder` | The human at the founder desk in the office (name + role on the sign and label). |
| `people.manager` | The human at the approvals desk, where Nemo brings emails for approval. |
| `conceptPrice` | Price of the full website, in `currency`. Used in emails and to compute deposit and balance. |
| `depositPercent` | Deposit taken with PayPal Checkout when a customer says yes (1–100, default 20). The balance is invoiced. |
| `currency` | Three-letter code PayPal supports, e.g. `USD`, `EUR`, `GBP`. |
| `language` | Language hint for your own templates and agent instructions (the shipped packs are English; translate `emails.md` and `agents/*.md` to change language). |
| `invoiceTerms` | Terms printed on Fluffy's PayPal invoice. |
| `credit` | `true` shows "Built with Siteo Office" in the dashboard footer and on concept pages. Set `false` to remove it. |
| `safety.unsubscribeLine` | Adds the unsubscribe line to every email. Keep it on. |
| `safety.approveInvoices` | Reserved: invoices are created and sent automatically once a deposit is paid (the customer already agreed and paid). |
| `safety.maxFollowups` | Maximum reminder drafts per unpaid invoice. |

Human approval of every email is always on in v1 and can't be switched off from config.

## team.config.json

Eight fixed roles in v1. You can rename, recolour, restyle or switch off each one.

```json
{
  "agents": {
    "finder": { "name": "Misso", "role": "Lead Finder", "color": "#f59e42", "fur": "#e3893a", "pattern": "tabby", "accessory": "scarf", "enabled": true, "instructions": "misso.md" }
  }
}
```

Role ids (the keys) are fixed: `finder`, `auditor`, `developer`, `checker`, `seo`, `sender`, `inbox`, `followup`.

| Field | What it does |
|---|---|
| `name` | The cat's name everywhere: office labels, desk signs, speech, activity log, dashboard. Up to 24 characters. |
| `role` | Role label on the desk sign and in the office (up to 28 characters). |
| `color` | The cat's accent colour: label dot, folders it receives, rug, dashboard name colour. Hex `#rrggbb`. |
| `fur` | Main fur colour. Hex. |
| `furDark` | Optional: colour of stripes/points/patches. Hex. |
| `belly` | Optional: belly/muzzle colour. Hex. |
| `eyes` | Optional: eye colour. Hex. |
| `pattern` | `tabby`, `solid`, `points` or `patches`. |
| `accessory` | `scarf`, `glasses`, `beret`, `deerstalker`, `inverness`, `mailcap`, `headset`, `bell` or `none`. |
| `enabled` | `false` puts the cat to bed (state `off`). Note that the pipeline still needs the roles; switching off `followup` stops automatic invoicing, the others are cosmetic in v1. |
| `instructions` | File in `agents/` with this cat's instructions (see [teaching agents](teaching-agents.md)). |

### Example: a rebrand

```json
"finder":  { "name": "Pixel", "role": "Scout", "color": "#00a3ff", "fur": "#3b3b3b", "pattern": "solid", "accessory": "headset" },
"checker": { "name": "Judge", "role": "Truth Keeper", "color": "#7c3aed", "fur": "#ffffff", "pattern": "patches", "furDark": "#222222", "accessory": "glasses" }
```

## Environment settings

Behaviour that depends on your setup (keys, providers, pacing, cost cap) is set in `.env`. Every variable is documented in [`.env.example`](../.env.example) and [deployment](deployment.md#environment-variables).
