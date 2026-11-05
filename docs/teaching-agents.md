# Teaching your agents

Each cat's instructions are a plain text file in `agents/`:

| Cat | File | Used for |
|---|---|---|
| Misso | `agents/misso.md` | Documentation of the search behaviour (Misso runs code, not a prompt, in v1) |
| Tom | `agents/tom.md` | System prompt when extracting facts from a website |
| Knight | `agents/knight.md` | System prompt when writing and fixing concept copy |
| Snow Bell | `agents/snow-bell.md` | System prompt for the AI fact-check |
| Sherlock | `agents/sherlock.md` | System prompt for the SEO note |
| Nemo | `agents/nemo.md` | System prompt for the first email |
| Scrapper | `agents/scrapper.md` | System prompt for reading replies and drafting deposit/answer emails |
| Fluffy | `agents/fluffy.md` | System prompt for the invoicing tool calls and reminders |

**This is teaching, not training.** Nothing is fine-tuned. The text is sent to the AI as instructions on every call, so a change takes effect on the next run. In demo mode (no AI key) agents use their rule-based path and these files aren't used.

You can edit them in your editor, or in the dashboard's **Teach** tab (saves the file; disabled on a public Render demo).

## What each agent also receives

You don't need to repeat these in the instructions; the app adds them:

- **Tom:** the niche's `facts.json` fields, the page's visible text, and "copy exactly, null if missing".
- **Knight:** the niche's `rules.md`, the facts, and (on a send-back) Snow Bell's notes.
- **Snow Bell:** `rules.md`, the facts and the numbered copy lines. Her deterministic checks (forbidden phrases, numbers not in the facts) always run, whatever her instructions say.
- **Nemo, Scrapper, Fluffy:** the niche's `emails.md` Tone and the matching template as an example, plus the facts and links they may use.

## Tips

- **Be concrete.** "Under 120 words, no exclamation marks" beats "be concise".
- **Say what to do when information is missing.** "Leave it out" prevents invented details.
- **Give examples** of good and bad lines. Snow Bell learns your bar quickly from two examples.
- **Keep safety rules in the niche pack** (`rules.md`), not only in an agent's file: Snow Bell enforces the pack, which protects you even if a writer agent drifts.
- **Change one thing at a time** and run on the same town to compare.

## Examples

Make Nemo shorter and more personal:

```markdown
- Maximum 90 words.
- Start with one specific thing you noticed on their current website (from Sherlock's points).
- End with a question, not a sales line.
```

Make Snow Bell stricter about opening hours:

```markdown
- Opening hours must match the facts character for character. "9–5" when the facts say "9:00–17:30" is a fail.
```

Teach Scrapper your local language:

```markdown
- Replies may be in Irish or English. Answer in the language they used.
```

## Changing behaviour beyond instructions

Instructions shape what the AI writes. To change what the pipeline does (more rounds, different shortlist rules, a new step), edit the agent's code in `src/agents/` and the orchestration in `src/pipeline.js`. See [how it works](how-it-works.md) and [contributing](contributing.md).
