# Job watch

Two self-hosted n8n workflows for job seekers in Sweden:

- **Job watch** watches the job market for several people at once (below).
- **Cover letter** drafts a personal letter for a chosen ad, with a link in every job email ([see further down](#cover-letter)).

**Job watch** is a workflow that watches the Swedish job market for several people at once. Every morning it searches [JobTech's JobSearch API](https://jobsearch.api.jobtechdev.se/) (the Swedish Public Employment Service's open ad data), filters and ranks the new ads per person, works out door-to-door travel times, and emails each person a short digest.

Everything that differs between people lives in one JSON profile per person. The workflow holds no personal data, so it can be versioned and shared.

**Can run fully locally**: by default, ranking uses a local embedding model (bge-m3 via Ollama) and the letters and the short "daily thought" come from local LLMs, so no profile or letter leaves your server; only the searches and travel-time lookups go out. You can use a cloud provider instead (see [Using another LLM provider](#using-another-llm-provider)).

## Prerequisites

This is not a ready-to-run app. It is two n8n workflows you install on your own infrastructure and personalise. You need:

- **n8n**, self-hosted (Docker is easiest), running continuously so the schedule and the form work. Cloud n8n does not work, because the workflows read profile files from disk.
- **An LLM for writing** the cover letters and the daily thought. By default that is a local model through [Ollama](https://ollama.com/), but any provider n8n has a chat model node for works (see [Using another LLM provider](#using-another-llm-provider)).
- **An embedding model** for ranking ads. By default that is `bge-m3` in Ollama; any OpenAI-compatible embeddings API also works.
- **Hardware for local models**, if you run them yourself: a GPU with about 12 GB of memory runs `gemma3:12b` with a 12288-token context fully on the GPU; on 8 GB part of it runs on the CPU, which works but is slower. Smaller models need less but write worse letters. Embeddings alone run fine on a CPU.
- **API keys** (free tiers are enough): [Trafiklab ResRobot](https://www.trafiklab.se/api/our-apis/resrobot-v21/) for public transport and [OpenRouteService](https://openrouteservice.org/) for driving times. JobTech's ad API needs no key.
- **An email account with SMTP access** to send the emails, for example Gmail with an app password.
- **Python 3** to build the workflow files from the code, and **Node.js** only if you want to run the tests.
- **The Swedish job market.** The ads come from Arbetsförmedlingen's open data, and the regexes, prompts and email texts are in Swedish.

Then you write one profile per person: what to search for, what to filter out, how to rank, and, for the letters, their background and writing style. That is the real work, and what makes the results good. See `config.example/` for a complete made-up profile.

## Design principles

- **Code decides, the model only ranks and writes.** Filtering, distances, travel times and grouping are deterministic code. Embeddings are used only to order ads by similarity to a profile.
- **Explainable scores.** Every ad gets a score made of a profile-match part plus named rules, and the email shows *why* ("nära din profil · Dataanalys · obs: tecken på högt tempo").
- **One engine, many people.** Adding a person means adding a profile file, not copying a workflow.
- **Personal data stays out of the workflow.** Profiles are mounted read-only from a private folder; the exported workflow can go straight into Git.

## Flow

```
Schedule (hourly 07-11) / Manual
→ Read profiles → Parse profiles → Select people          who runs now (sendHour)
→ Build searches → Search jobs                            JobTech searches per person (paginated)
→ Filter ads                                              per-person rules
→ Prepare matching → Match profile → Rank                 bge-m3 similarity + weighted rules
→ Plan trips                                              which travel times are missing from the cache
→ Car trips → Car → Save car                              OpenRouteService
→ Transit trips → Transit → Save transit                  ResRobot (depart at, or arrive by)
→ Flight trips → Transit from Arlanda → Save flight       weekly commuting by air
→ Attach travel times → Compose email → Daily thought → Add thought → Send email
```

State lives in the workflow's static data: ads already seen per person, a travel-time cache (keyed by home position, so people living in the same place share it), and earlier daily thoughts so they aren't repeated.

## Layout

```
nodes/job-watch/            Code of each Code node in Job watch
nodes/cover-letter/         Code of each Code node in Cover letter
build.py                    Builds out/job-watch.json and out/cover-letter.json
test/run.js                 Runs Job watch with a mock n8n runtime and mock APIs
test/ads.js                 Made-up ads, each exercising a filter or scoring rule
test/run-cover-letter.js    Runs Cover letter with a made-up ad and model answer
test/cover-letter-cases.js  The cases, with answers full of things the cleanup must catch
config.example/             A made-up person and shared settings
```

## Profiles (`/private/people/<id>.json`)

| Section | Controls |
|---|---|
| `home`, `email` | Home position (distances, travel) and recipient |
| `jobs.sendHour` | Hour the digest is sent |
| `jobs.search` | Queries, days back, optional radius, optional `nationwide` searches |
| `jobs.filter` | Topic areas (at least one must match), rejected titles, driving licence, degree requirements, employment forms, occupation field, max distance |
| `jobs.matching.profile` | Text the ads are compared with |
| `jobs.ranking` | Weight of the profile match, scoring rules, how many ads to send |
| `jobs.travel` | Car, public transport (`depart` at a time, or `arrive` before work starts), flights via Arlanda |
| `jobs.email` | Groups by travel time, texts, labels, cover letter form link |
| `jobs.thought` | Prompt and themes for the daily thought (`{theme}`, `{earlier}`) |

`_global.json` holds shared settings: sender, embedding endpoint, form base URL, and **test mode**: `testTo` sends every email there instead, and `testPerson` limits manual runs to one person.

Regexes, labels, group names and email texts in the profiles are in Swedish because they match and address Swedish ads and readers. Regexes are case-insensitive; in JSON, backslashes are doubled (`\\bai\\b`).

### Scoring rules

```json
{ "name": "stress", "when": [{ "re": "högt tempo|stresstålig" }], "maxCount": 3,
  "weight": -0.2, "reason": "obs: tecken på högt tempo" }
```

| Key | Meaning |
|---|---|
| `when` | Conditions, any may match: `{ "re": "...", "field": "text" \| "title" \| "workingHours" }` or `{ "flag": "remote" \| "salaryStated" \| "licenceMerit" \| "experienceRequired" \| "staffing" }` |
| `maxCount` | Count matches and scale to 0–1. Without it a match counts as 1 |
| `exceptAreas` | Skip the rule if the ad matches one of these areas |
| `exceptRule` | Skip the rule if the named earlier rule matched |
| `reason`, `reasonFrom` | Text shown in the email (from this value up) |
| `label` | Tag shown in the email |

Score = 100 × (`matchWeight` × profile match + Σ `weight` × rule value). Profile match is the ad's percentile among the day's ads, so it is comparable across days.

### Arriving before work starts

With `"mode": "arrive"` public transport is searched as *arrive by*. With `fromAd: true` the ad text is scanned for working hours ("kl. 9-17", "arbetstid 07.00–16.00", "dagtid 8-17") and the earliest start is used; otherwise `time`. Arrival is `marginMin` before that, and the email says which assumption was used.

### Email language

The fixed wording of the email (labels like "Publicerad", "Sista ansökningsdag") is in the `STRINGS` table at the top of `nodes/job-watch/14_compose_email.js`, Swedish by default. Override any entry with `"strings": { ... }` in `_global.json`.

## Cover letter

A form (`/form/cover-letter`) takes an ad id, a few words on what attracts the person to the job, and a hidden `person` field. The job emails link to it with everything filled in. The workflow fetches the ad, builds a prompt from the person's `coverLetter` profile, lets a local model (gemma3 via Ollama) write the letter's paragraphs as JSON, and emails a draft with a Word file attached.

```
Cover letter form → Read profiles → Parse profiles → Select person → Fetch ad → Prepare ad
→ Build profile → Write letter (LLM) → Build email → Create Word file → Send email
```

The model writes; the code makes sure it stays honest:

- **Gaps are stated, not hidden.** When the ad asks for something the profile lacks (`gaps`), the prompt says so and the model must say it plainly. For specific skills (`missingSkills`), the model may not write about them at all: the code removes any sentence that mentions one and inserts its own honest sentence instead ("Azure har jag ännu inte arbetat med."), so that sentence is always true.
- **Unbacked claims are removed.** Sentences claiming a system, law or tool from `unknownTerms` that the profile doesn't contain are dropped (unless they say the person does *not* have it), and the person is told.
- **Filler is cleaned.** Dashes, clichés and hedges ("jag tror att", "passionerad", "ser fram emot" outside the closing) are rewritten or removed. Person-specific rules live in `cleanup.replacements`.
- **Wrong field, no letter.** With `outOfField`, an ad for a different occupation gets a short note instead of a letter that would have to invent experience.
- **The ad's language decides the letter's.** With `detectLanguage`, English ads get English letters. The email around the letter stays Swedish.

The person always gets a draft to read and change, with warnings ("Kontrollera") and tips, never a letter sent on their behalf.

| `coverLetter` key | Controls |
|---|---|
| `contact` | Letter header: name, town, phone, email |
| `profile`, `variables` | Facts the model may use. `{name}` placeholders are filled from `variables`, which depend on the ad (`adMatches`) or the date (`dateBefore`) |
| `style` | The person's voice, ideally a sample of their own writing |
| `prompt` | The full prompt, with `{profile}`, `{style}`, `{ad}`, `{motivation}`, `{languageName}`, `{remote}` |
| `gaps`, `gapHeader` | Requirements the person doesn't meet, each with a regex on the ad and a text for the model |
| `missingSkills` | Skills with a regex each, the gap text, and the honest sentences per language |
| `previousEmployers` | Regex on the employer name and a text to use when applying there again |
| `extraSections` | Text added when the ad matches (`ifAd`) or doesn't match (`unlessAd`) a regex |
| `unknownTerms`, `outOfField`, `cleanup`, `strings` | See above; `strings` overrides the email wording |

## Setup details

n8n does not read a `.env` file for this project. API keys are stored as **credentials inside n8n**, and the shared settings live in **`_global.json`** next to the profiles. Here is everything required.

### Software

| What | Notes |
|---|---|
| Self-hosted n8n (Docker) | Must be able to read the profile folder (see Install) |
| Ollama, reachable from n8n | With the two models below, or another provider (next section) |
| `bge-m3` | Embeddings for ranking ads (Job watch) |
| `gemma3:12b` | Writes the letters (*Letter model*) and the daily thought (*Thought model*). Both nodes use the same model and context length (12288), so Ollama keeps one model loaded instead of swapping. If you change one, change both |

### Credentials to create in n8n

| Credential | n8n type | Fields | Used by | Get it from |
|---|---|---|---|---|
| ResRobot | Query Auth | Name `key`, Value: your API key | *Transit*, *Transit from Arlanda* | [Trafiklab](https://www.trafiklab.se/api/our-apis/resrobot-v21/) (free) |
| OpenRouteService | Header Auth | Name `Authorization`, Value: your API key | *Car* | [openrouteservice.org](https://openrouteservice.org/) (free) |
| Ollama | Ollama | Base URL, e.g. `http://ollama:11434` | *Thought model*, *Letter model* | Your Ollama instance (or another provider's credential) |
| SMTP | SMTP | User, password, host, port, SSL/TLS | *Send email* (both workflows) | Your mail provider. Gmail: `smtp.gmail.com`, port 465, SSL on, and an [app password](https://support.google.com/accounts/answer/185833) |

JobTech's JobSearch API needs no key. If nobody needs car travel times, set `"car": false` in the profiles. The *Car* node still needs a credential selected, but it makes no real lookups.

### Using another LLM provider

**Chat models** (*Thought model* in Job watch, *Letter model* in Cover letter) are separate sub-nodes. Delete the Ollama node and connect any chat model node n8n offers, such as OpenAI, Anthropic, Mistral, Groq or an OpenAI-compatible server (LM Studio, vLLM, llama.cpp), with its credential. The prompts ask for plain JSON, so most capable models work. Letters are written in Swedish, so check that the model writes good Swedish.

**Embeddings** are a plain HTTP request in the *Match profile* node. It sends `{ "model": embedModel, "input": [texts] }` to `embedUrl` and understands both Ollama's answer and the OpenAI format. For an OpenAI-compatible service:

1. In `_global.json`, set `embedUrl` (e.g. `https://api.openai.com/v1/embeddings`) and `embedModel` (e.g. `text-embedding-3-small`).
2. In the *Match profile* node, set Authentication to a Header Auth credential with Name `Authorization` and Value `Bearer <your key>`.

With a cloud provider, the person's profile, the ads and the letter drafts are sent to that provider. With local models nothing personal leaves your server; only searches and travel-time lookups go out.

### `_global.json`

| Key | Meaning |
|---|---|
| `from` | Sender address for all emails (must be allowed by your SMTP account) |
| `testTo` | When set, **every** email goes here instead, marked `[TEST id]`. Empty = live |
| `testPerson` | Limits manual runs of Job watch to one person |
| `timezone` | Used to decide which hour it is (`sendHour`) |
| `embedUrl` | Ollama's embedding endpoint, e.g. `http://ollama:11434/api/embed` (called directly, no credential) |
| `embedModel` | Embedding model, normally `bge-m3` |
| `formBaseUrl` | Base address of n8n's forms as the *readers* reach it, e.g. `http://n8n.local:5678/form/`. Used for the cover letter links in the job emails |

### n8n container settings

| Setting | Why |
|---|---|
| Volume `~/n8n-private:/private:ro` | Makes the profiles readable at `/private/people/` |
| `N8N_RESTRICT_FILE_ACCESS_TO=/private` | Lets the *Read profiles* nodes read that folder. If the variable is already set, append `;/private` |

## Install

1. Create the credentials and pull the Ollama models listed above, or connect another provider.
2. Copy `config.example/` to a private folder on the n8n host, e.g. `~/n8n-private/people/`, and edit `_global.json` and one file per person (`<id>.json`).
3. Mount the folder and set the container settings above, then restart n8n.
4. `python3 build.py --no-state`, import `out/job-watch-no-state.json` and `out/cover-letter.json`, and pick your credentials in the *Car*, *Transit*, *Transit from Arlanda*, *Thought model*, *Letter model* and *Send email* nodes.
5. Activate **Cover letter** (forms only work when the workflow is active). Run **Job watch** manually with `testTo` set, check the emails, then activate it and clear `testTo`.

## Test

```bash
cd test && npm install && cd ..
python3 build.py --no-state
node test/run.js                       # Job watch with config.example/
node test/run-cover-letter.js          # Cover letter for the example person
PEOPLE_DIR=/path/to/people node test/run.js
PEOPLE_DIR=/path/to/people node test/run-cover-letter.js <id>
```

Writes the emails (and the Word files) to `test/results/`.
