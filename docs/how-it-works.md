# How it works

Siteo Office is one Node app. A run goes through 8 agents in order; each step updates a small "office state" that the 3D office polls every 1.5 seconds and turns into animation.

```
"dentists in Galway"
   │
   ▼
 Misso ──► Tom ──► Knight ⇄ Snow Bell ──► Sherlock ──► Nemo ──► [ YOU APPROVE ] ──► sent
 find      audit   build     fact-check   SEO note     email                         │
                     ▲  (max 3 rounds)                                               ▼
                     └── sent back with notes                            reply ──► Scrapper
                                                                                    │ "yes"
                                                                                    ▼
                                    PayPal Checkout deposit ◄── [ YOU APPROVE ] ◄── deposit email
                                              │ captured (return URL / webhook)
                                              ▼
                                    Fluffy: create_invoice → send_invoice (PayPal Invoicing)
                                              │ paid (webhook / check)        │ unpaid
                                              ▼                               ▼
                                             💰                     reminder drafts [ YOU APPROVE ]
```

## The agents in detail

Each agent is a small file in `src/agents/` plus its editable instructions in `agents/*.md`. With an AI key they use Claude; without one (demo mode) every agent has a rule-based path, so the whole pipeline works with no keys.

### 1. Misso · Lead Finder (`src/agents/misso.js`)
- Parses your line into **what** and **where** (`dentists` / `Galway`) and picks the niche pack whose `search.json` keywords match (or the one you chose).
- Asks the search provider for businesses with a website: OpenStreetMap (Nominatim to find the town, Overpass for places with the niche's `osmTags` and a `website` tag), Google Places Text Search, or the Apify Google Maps actor.
- Drops social pages and directories, keeps one per website domain, and skips anyone who unsubscribed.
- **Office:** works at her desk, says how many she found, carries a folder to Tom.

### 2. Tom · Site Auditor (`src/agents/tom.js`)
- Fetches each website (15 s timeout, 2 MB cap) and measures objective signals: viewport tag (mobile), HTTPS, title, meta description, table layouts and old tags, copyright year, tappable phone, booking link, page weight.
- Runs **Google PageSpeed** (mobile performance) when reachable.
- Adds up a **weakness score** (0–100, higher = weaker) using the niche's `audit.json` weights.
- Extracts **facts** (the fields in `facts.json`): with AI, by reading the visible text with strict "copy exactly, null if missing" rules; without AI, with simple patterns (phone, email, hours lines, list items).
- Shortlists the weakest sites (at least `shortlistMinScore`, with a public email), up to `SHORTLIST_SIZE` (default 3). Everyone else is marked **skipped** with a reason.
- **Office:** a speech bubble per site with its score and main problem.

### 3. Knight · Web Developer (`src/agents/knight.js`)
- Writes the concept's words (headline, subheadline, about, services, call to action) **only from Tom's facts**.
- Fills the niche's `template/index.html`. The concept always shows a banner: "Concept preview made by <your studio> … not the live site".
- On a send-back, he fixes exactly the lines Snow Bell flagged.
- **Office:** "Building a concept for …", then carries the folder to Snow Bell.

### 4. Snow Bell · Fact Checker (`src/agents/snow-bell.js`)
- Splits the copy into lines and checks each one:
  - **Rules check (always):** forbidden phrases from the niche's `rules.md`; any number, email or link that isn't in the facts.
  - **AI check (with a key):** "can you point to the fact that proves this line?"
- Any issue → the draft goes **back to Knight** with the notes. Up to **3 rounds**; still failing → **set aside** (never emailed).
- **Office:** this is the visible send-back: Snow Bell walks the folder back to Knight's desk with a bubble like `Sending back: "Rated the best…" ✗`.

### 5. Sherlock · SEO Expert (`src/agents/sherlock.js`)
- Turns Tom's measured issues into up to 4 plain-English points ("No meta description, so Google shows a random snippet"). Never promises rankings.

### 6. Nemo · Email Writer (`src/agents/writer.js`, instructions in `agents/nemo.md`)
- Writes the first email from the niche's `emails.md` (tone + example) with the concept link, Sherlock's points, the price and your signature, plus the unsubscribe line.
- The email **stops in the approval inbox**. **Office:** Nemo walks to the approvals desk (the manager's office) and waits there, with a "Waiting for approval · N" tag, until you approve.

### 7. Scrapper · Inbox & Deposits (`src/agents/scrapper.js`)
- Reads a reply and classifies it: **interested**, **question**, **not interested**, **unsubscribe**.
- Interested → creates a **PayPal Orders v2** order for the deposit (`depositPercent` of `conceptPrice`) and drafts an email with the PayPal link (you approve it).
- Question → drafts a short answer. Not interested → closes the lead. Unsubscribe → adds the address and domain to the do-not-contact list and cancels any drafts.
- When the deposit is captured: **💰 Deposit paid!** and a handoff to Fluffy.

### 8. Fluffy · Invoices & Follow-ups (`src/agents/fluffy.js`)
- Creates the PayPal invoice for the balance **as an agent tool call**: Claude is given the tools `create_invoice`, `send_invoice` and `get_invoice` (named like PayPal's Agent Toolkit) and the exact invoice details; the app runs the calls against **PayPal Invoicing v2**. With `PAYPAL_AGENT_TOOLKIT=true` and `@paypal/agent-toolkit` installed, the official toolkit executes them. In demo mode the same two calls are scripted.
- Every minute the app checks unpaid invoices. When one is overdue (`FOLLOWUP_AFTER_MINUTES`), Fluffy drafts a reminder for you to approve, up to `safety.maxFollowups`.
- Paid (webhook `INVOICING.INVOICE.PAID`, the **Check invoices now** button, or the background check) → **💰 Invoice paid!**

## The state machine

Each business ("lead") has a `status`:

| Status | Meaning | Next |
|---|---|---|
| `found` | Misso found it | `audited` / `skipped` |
| `audited` | Tom scored it and extracted facts | `shortlisted` / `skipped` |
| `skipped` | Site didn't load, already decent, no public email, or not in the top N | – |
| `shortlisted` | One of the weakest | `building` |
| `building` ⇄ `checking` | Knight writes, Snow Bell checks (max 3 rounds) | `seo` / `set_aside` |
| `set_aside` | Still had unsupported lines after 3 rounds | – |
| `seo` | Passed; Sherlock's note | `awaiting_approval` |
| `awaiting_approval` | Nemo's email waits for a human | `sent` / `closed` (rejected) |
| `sent` | Email sent (or delivered to the test inbox) | `replied` |
| `replied` | Scrapper read a reply | `deposit_pending_approval` / `closed` / `unsubscribed` |
| `deposit_pending_approval` | PayPal order created; deposit email waits for a human | `deposit_link_sent` |
| `deposit_link_sent` | Customer has the PayPal link | `deposit_paid` |
| `deposit_paid` | PayPal capture confirmed | `invoice_sent` |
| `invoice_sent` | Fluffy's PayPal invoice is out | `paid` |
| `paid` | Balance paid | – |

The dashboard funnel is cumulative: **Concepts** (reached `awaiting_approval`) → **Approved & sent** → **Deposit paid** → **Invoice sent** → **Paid**.

Runs have their own status: `queued` → `running` → `done` / `stopped` (cost cap) / `error`. Up to two runs can be queued; they execute one at a time.

## The 3D office

`public/office.js` is the original procedural three.js office (no external assets), ported and made configurable. It polls `GET /api/office`:

```json
{
  "now": 1767000000000,
  "office_open": true,
  "agents": { "finder": { "state": "working", "task": "Searching for dental practices in Galway", "lead": null }, "...": {} },
  "handoffs": [ { "id": "h1", "from": "checker", "to": "developer", "lead": "Pearlgate Dental: fix 1", "at": "2026-..." } ],
  "events":   [ { "id": "e1", "type": "say", "agent": "checker", "text": "Sending back: ...", "at": "2026-..." },
                { "id": "e2", "type": "money", "agent": "inbox", "text": "Deposit paid! $100", "at": "2026-..." } ],
  "pending_approvals": 1
}
```

| Agent state | What the cat does |
|---|---|
| `working` | Sits at its desk, screen lit, status "Working · task" |
| `ready` | Sits at its desk between tasks (during a run) |
| `waiting` | Nemo only: walks to the approvals desk and waits with an envelope |
| `idle` | Goes for a snack, then naps in the lounge |
| `off` | Switched off in `team.config.json`: stays in bed |

| Event | Animation |
|---|---|
| `handoff` | The `from` cat picks up a folder in the `to` cat's colour, walks to that desk's tray and drops it (tag: "→ Snow Bell: …") |
| `say` | A speech bubble above the cat for ~5 seconds |
| `money` | A gold 💰 badge above the cat, plus coin rain and a toast in the dashboard |

The server-side helpers are in `src/office-state.js` (`working`, `say`, `handoff`, `money`, `idle`). If you add a step, call them and the office follows.

## Data

Everything is stored in `data/db.json` (runs, leads, emails, payments, activity log, unsubscribes). It's small and human-readable. For a bigger studio, replace `src/store.js` with a database.
