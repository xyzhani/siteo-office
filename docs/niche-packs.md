# Niche packs

A niche pack teaches the team one kind of business: what to search for, which facts to collect, how to judge a weak site, what the concept looks like, what must never be claimed, and how to write the emails. Two packs ship: **`dental`** and **`restaurants`**.

```
niches/
  dental/
    search.json      what Misso searches for
    facts.json       what Tom extracts
    audit.json       how Tom scores weak sites
    template/
      index.html     Knight's concept design
    rules.md         what Snow Bell forbids
    emails.md        tone + templates for Nemo, Scrapper and Fluffy
```

A new folder with a `search.json` appears automatically in the niche dropdown. The pack is picked by matching your query against `keywords` ("dentists in Galway" → `dental`), or chosen in the dropdown.

## search.json

```json
{
  "label": "dental practices",
  "example": "dentists in Galway",
  "query": "dentist",
  "keywords": ["dentist", "dentists", "dental", "orthodontist"],
  "osmTags": ["amenity=dentist", "healthcare=dentist"],
  "cta": "Book an appointment",
  "demoSlip": "Rated the best dentist in Sampleton, with 5-star reviews from every patient."
}
```

| Field | Use |
|---|---|
| `label` | Plural name shown in the UI and speech ("Found 5 dental practices"). |
| `example` | Placeholder in the run box. |
| `query` | Search phrase for Google Places / Apify (`<query> in <town>`). |
| `keywords` | Words that select this pack from the run line. |
| `osmTags` | OpenStreetMap tags (`key=value`) for the Overpass search. Find tags at [wiki.openstreetmap.org/wiki/Map_features](https://wiki.openstreetmap.org/wiki/Map_features). |
| `cta` | Suggested call to action on the concept. |
| `demoSlip` | Demo mode only: the deliberately wrong sentence in Knight's first draft, so you can see Snow Bell catch it. It should break your `rules.md`. |

## facts.json

```json
{ "fields": [
  { "key": "name", "label": "Practice name, exactly as written" },
  { "key": "hours", "label": "Opening hours, one line per day range", "type": "list" }
] }
```

Each field is something Tom copies from the website. `type: "list"` means a list of short strings. The `label` is the instruction Tom's AI sees, so be precise ("only if stated"). Knight may use **only** these facts, so if you want a fact on the concept, add a field for it.

The template always receives `business.<key>` for every field, plus `business.phoneHref` (digits only, for `tel:` links).

## audit.json

```json
{
  "weights": { "noViewport": 22, "noHttps": 10, "slowMobile": 18, "noMetaDescription": 6, "noTitle": 4, "tableLayout": 12, "oldTags": 6, "oldCopyright": 10, "noTelLink": 6, "noBooking": 10, "heavyPage": 6 },
  "bookingWords": ["book", "appointment"],
  "shortlistMinScore": 30
}
```

| Signal | Triggered when |
|---|---|
| `noViewport` | No `<meta name="viewport">`: not mobile-friendly |
| `noHttps` | The site doesn't end up on `https://` |
| `slowMobile` | PageSpeed mobile score under 50 (or, without PageSpeed, more than 400 KB of HTML) |
| `noMetaDescription` / `noTitle` | Missing description / generic title ("Welcome", "Home") |
| `tableLayout` / `oldTags` | Table-based layout / `<font>`, `<center>`, `bgcolor` |
| `oldCopyright` | Newest copyright year more than 3 years ago |
| `noTelLink` | No `tel:` link |
| `noBooking` | No link containing one of `bookingWords` |

The score is the sum of triggered weights (max 100). Sites under `shortlistMinScore` are left alone ("already decent").

## template/index.html

Plain HTML with a tiny mustache-style syntax:

| Syntax | Meaning |
|---|---|
| `{{business.name}}` | Insert a value (HTML-escaped) |
| `{{#business.phone}}…{{/business.phone}}` | Show the block only if the value exists; for a list, repeat it per item |
| `{{^business.phone}}…{{/business.phone}}` | Show only if the value is missing |
| `{{.}}` | The current item inside a list loop |

Don't nest a block inside another block **with the same name**; use the `show.*` flags for "has any" checks.

Available data:

- `business.*`: every fact, plus `phoneHref`
- `copy.headline`, `copy.subheadline`, `copy.about`, `copy.cta`, `copy.services[]` (`name`, `description`)
- `show.services`, `show.hours`: true when there's something to show
- `studio.name`, `studio.website`, `studio.colors.*`
- `credit` (true = show "Built with Siteo Office"), `fictional` (demo business), `year`

Keep the "Concept preview… not the live site" banner. It's honest and it protects you.

## rules.md

```markdown
## Forbidden phrases
- best
- guaranteed
- 5-star

## Rules
- No prices unless they are in the facts.
```

Every bullet under a heading containing **"forbidden"** is a phrase Snow Bell blocks (case-insensitive, whole words). The whole file is also given to Knight and to Snow Bell's AI check, so plain-language rules under other headings count too.

## emails.md

```markdown
## Tone
Warm, short, plain English…

## First email
Subject: A new website idea for {business}
Hi {owner_or_team},
…
```

Sections the app uses: **Tone**, **First email** (Nemo), **Deposit email** and **Reply to a question** (Scrapper), **Follow-up** (Fluffy). The first line of each template is `Subject: …`. Without an AI key the templates are used as written; with one, the agent rewrites them in the Tone, keeping the links and facts.

Placeholders: `{business}`, `{owner_or_team}`, `{concept_url}`, `{issues}` (Sherlock's points), `{price}`, `{deposit}`, `{deposit_percent}`, `{balance}`, `{currency}`, `{checkout_url}`, `{invoice_url}`, `{invoice_number}`, `{studio}`, `{sender}`, `{signature}`, `{website}`, `{their_message}`.

The unsubscribe line is added automatically; don't add your own.

## Worked example: a "hair salons" pack

1. Copy a pack: `cp -r niches/restaurants niches/salons`
2. `niches/salons/search.json`:
   ```json
   { "label": "hair salons", "example": "hair salons in Leeds", "query": "hair salon",
     "keywords": ["salon", "salons", "hairdresser", "hairdressers", "barber", "barbers"],
     "osmTags": ["shop=hairdresser", "shop=beauty"], "cta": "Book an appointment",
     "demoSlip": "The best stylists in Sampleton, loved by 2,000 clients." }
   ```
3. `facts.json`: change `services` to "Cuts, colour and treatments they list (only as written)" and add `{ "key": "stylists", "label": "Stylists named on the site", "type": "list" }`.
4. `audit.json`: set `bookingWords` to `["book", "appointment", "booking"]`.
5. `rules.md`: add salon-specific forbidden phrases (`best`, `award-winning`, `celebrity`, `guaranteed`, `organic`) and "No prices unless stated".
6. `template/index.html`: change the emoji to ✂️, the "On the menu" heading to "Services", the colours, and add a stylists card: `{{#business.stylists}}<li>{{.}}</li>{{/business.stylists}}` inside a block guarded by your own check.
7. `emails.md`: adjust the tone.
8. Restart and type `hair salons in <your town>`.

Demo mode only has fictional data for the shipped packs; a new pack falls back to the dental demo businesses until you add your own to `src/demo/businesses.js`.
