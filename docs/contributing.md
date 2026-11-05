# Contributing

Thanks for helping the cats! Siteo Office is MIT-licensed and deliberately simple: one Node process, no framework, no build step, no runtime dependencies (nodemailer is optional).

## Setup

```bash
git clone https://github.com/<you>/siteo-office.git
cd siteo-office
npm install
cp .env.example .env
npm run dev
npm test          # end-to-end demo flow, no keys needed
```

Screenshots of the office with Playwright (headless Chromium renders WebGL slowly, so the script advances the office clock itself):

```bash
npm start &
NODE_PATH=$(npm root -g) node test/screens.cjs http://localhost:3000 test-results
```

## Project map

```
server.js                 HTTP routes (API, concepts, PayPal return/webhook, demo + simulated pages)
src/config.js             .env + studio/team config + niche packs + agent instructions
src/pipeline.js           the state machine (runs, approvals, replies, deposits, invoices, follow-ups)
src/office-state.js       what the 3D office polls (agent states, handoffs, events)
src/agents/*.js           the 8 agents (writer.js is shared email writing)
src/providers/            llm/, search/, email/, payments/ adapters
src/demo/businesses.js    fictional demo businesses and their "old websites"
public/office.js          the procedural three.js office
public/app.js, styles.css the dashboard
niches/<id>/              niche packs
agents/*.md               agent instructions
docs/                     these docs
```

## Good first contributions

- A niche pack (salons, plumbers, gyms, law firms…) with fictional demo businesses.
- An inbound email adapter (IMAP or a provider's inbound webhook) so Scrapper reads replies automatically.
- A Stripe payments adapter.
- Another LLM adapter.
- Translations of the shipped packs and agent instructions.
- Accessibility improvements in the dashboard.

## Guidelines

- **Safety first.** Don't add anything that sends email without human approval, scrapes search engines, or invents facts. PRs that weaken safety defaults won't be merged.
- **No real business names** in demo data, tests, screenshots or docs. Use fictional names and `.example` domains.
- **No secrets** in code, config or tests. No hardcoded model names: models come from env.
- Keep it dependency-light and readable. Plain modern JavaScript (ES modules, Node 20+).
- Run `npm test` before opening a PR, and include a screenshot for visual changes.
- Describe what you changed and why in the PR.

## Code of conduct

Be kind. Assume good intent. Help newcomers. Harassment of any kind isn't tolerated.
