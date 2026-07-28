# Scout

Find the problem, build the wedge, message the founder.

Scout auto-pulls target startups, scrapes signals about each (site, open roles,
user complaints, founder, funding), and uses an LLM to produce a per-company
**brief**: their real problems (each backed by an evidence link), the specific
thing you could build to prove yourself, the role to pitch for, and a ready-to-send
founder DM. Ranked by opportunity. Built to get a strong builder hired through the
side door, not the application pile.

## How it works
```
sources/yc.ts   pull target startups (yc-oss public JSON API, no keys)
signals.ts      per company, gather via Beast: site+gaps, jobs, complaints, founder, funding
lib/ai.ts       Vercel AI SDK generateObject + Zod BriefSchema (synthesis)
pipeline/score  opportunity = problem_clarity + buildability + role_fit + heat
lib/db.ts       SQLite store (companies + briefs), dedupe by website
app/            dashboard (/) + brief page (/company/[id])
```

- **Scraping** runs through the **Beast** HTTP API (`/search`, `/fetch`, `/extract`, `/research`).
- **LLM** is **Groq** (`openai/gpt-oss-120b`, free + structured output), the same stack Beast
  uses. OpenAI/Gemini are used instead only if their keys are set.
- **Grounding:** the schema requires an `evidence_url` for every problem and the prompt omits
  anything not in the signals, so the dashboard always shows the source to verify.
- **No em dashes / no emojis** in generated copy (enforced post-LLM).

## Run
```bash
bun install
bun run dev            # dashboard at http://localhost:3000
```
Then: **Pull YC targets** -> **Analyse next 3**. Or trigger the pipeline directly:
```bash
curl "http://localhost:3000/api/run?pull=10&analyze=3"
```
Quick integration probe (Beast + yc-oss + Groq): `bun run scripts/probe.ts`.

## Config (`.env.local`, gitignored)
| var | what |
|---|---|
| `BEAST_URL` | Beast API (VPS `http://100.119.35.108:8001` or local `:8001`) |
| `BEAST_API_KEY` | Beast auth |
| `GROQ_API_KEY` | LLM (primary) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | optional, used if set instead of Groq |

## Built on (OSS)
Vercel AI SDK (`generateObject` + Zod), the yc-oss companies API for targets, and the
fire-enrich phased-enrichment pattern. Beast is the scraper. Done > perfect.

## Honest limits
- Briefs are only as good as the signals; obscure companies yield thinner, more inferred
  problems (still grounded). Bigger companies with public complaints give richer briefs.
- Founder contact is name + LinkedIn/X URL from search, not a verified email.
- Heavy runs can throttle Beast's egress IP; analyse in small batches.
