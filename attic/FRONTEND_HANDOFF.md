# Kimi Radar — frontend agent handoff

## Start here

This is a local interview demo for a Kimi AI Operations / Builder role. The user explicitly asked to prioritize backend progress and hand off frontend work to another agent. A preliminary frontend already exists in `static/`; you may replace or refine it. It has passed JavaScript syntax checking, but has not yet undergone browser/visual QA. Do not assume it is a finished design.

Read `BUILD.md` for the product reasoning. The product is **not simply a tweet dashboard or caption generator**. It helps a Kimi growth/content operator decide what use case to demonstrate next, inspect the evidence, prepare a reproducible workflow, and record learning.

## Confirmed user decisions

- Primary user: Kimi growth/content operator.
- Audience: English-speaking knowledge workers, focused on research, slides, spreadsheets and documents.
- **Chinese interface; English X captions.** Reusable Kimi prompts should also be English. Brief explanations and validation notes use Chinese.
- The actual first use case must be chosen from collected Twitter evidence, not predetermined.
- Local HTML web app + dashboard. No hosting, auth system, or auto-posting needed.
- Owned account: `Kimi_Moonshot`.
- Competitors, confirmed by user: `OpenAI`, `claudeai`, `GeminiApp`, `deepseek_ai`, `Zai_org`.
- Provider: Moonshot / Kimi API platform. The supplied key was verified against the CN endpoint `https://api.moonshot.cn/v1`; the private configuration has been updated accordingly.
- Ask three focused clarification questions per discussion round when further decisions are useful. Do not block routine implementation on questions already answered here.

## Product goal and demonstration

Decision: “下一条内容，为什么值得做？”

Proposed operator target: move from a collected signal to a reviewed experiment brief in under ten minutes. This is an unmeasured target. Long-term outcome: attributed users who complete a useful Kimi task. Product analytics are not available; do not fabricate activation or conversion.

Demo flow:
1. View real, ranked opportunities.
2. Read original posts; distinguish a user need from a brand announcement.
3. Inspect the scoring reasons, capability reference and possible reason to pass.
4. Generate an experiment via Kimi: English captions, reusable prompt, demo steps, hypothesis and measurement plan.
5. Manually run the prompt in Kimi, inspect output, record pass/fail and what changes next.
6. Save/reopen/export the experiment with its original evidence snapshot.
7. Use public competitor metrics to inform the next experiment, not to claim causal growth.

## Run

```bash
cd "/Users/cc/Documents/Work/X Tracker CC copy"
python3 kimi-radar/server.py --port 3477
```

Open `http://127.0.0.1:3477`. Python standard library only. No npm build required. The server may already be running; check before starting a duplicate.

Current server serves only `/`, `/app.js`, `/styles.css` and the documented API. It deliberately does not expose the repository, `.env`, or data files. If adding local fonts/icons/assets, extend the explicit static allowlist in `server.py` narrowly. Do not switch to unrestricted directory serving.

Runtime data is in `kimi-radar/data/state.json`, ignored by Git. Credentials are in `kimi-radar/.env`, ignored by Git, mode 0600. **Never print, expose, overwrite or copy those values into frontend files.** `.env.example` contains only empty keys and public defaults. The app does not use the original tracker's credentials or Feishu integration.

## Existing files

| File | Responsibility |
|---|---|
| `server.py` | Local server, private credential loading, API calls, async collection job, model grounding, persistence, API validation |
| `engine.py` | Normalization, sample data, grouping fallback, scoring, public metrics, offline brief templates |
| `static/index.html` | Chinese app shell, dialogs, navigation |
| `static/styles.css` | Responsive editorial workspace styling |
| `static/app.js` | Five views, API client, state, filtering, editor, saving/export, polling |
| `test_engine.py` | Evidence and metric edge cases |
| `test_server.py` | API and collection/persistence guardrails, when present |
| `BUILD.md` | Product goal, hypotheses, scope and acceptance |
| `VALIDATION.md` | Live smoke-test outcome and remaining limitations |

The original tracker in the parent directory has substantial preexisting changes. Confine edits to `kimi-radar/`.

## Visual / interaction direction

Quiet, legible Chinese operations workspace; light canvas, restrained blue accent, flat surfaces, clear hierarchy. This is a working tool, not a marketing landing page. Prioritize evidence reading and the next action over decorative metrics.

Primary navigation:
- **机会雷达** — ranked cards, search, all/shortlisted/passed filters; inspect an opportunity.
- **实验工作室** — editable brief, caption preview, copy prompt/caption, manual validation and saved experiments.
- **表现对标** — account metrics, topic coverage, actual posts and metric definitions.
- **信号来源** — owned account, competitor handles, keyword queries, paging cap, scoring weights, connection status.
- **目标与方法** — product hypothesis, outcome/proxy distinction, evidence limitations.

Required states: loading, no results, no keys, request failure, partial collection, sample vs real mode, unsaved edits, model failure and clearly labeled template fallback. Every visible control should work. Preserve keyboard navigation, dialog semantics and responsive layout.

## HTTP conventions

Use same-origin requests. GET `/api/state` returns an ephemeral `token`. Every POST requires:

```js
headers: {
  'Content-Type': 'application/json',
  'X-Radar-Token': state.token
}
```

Token is a local anti-CSRF token, not an external API key. Refresh the state after a server restart. Server binds loopback only, checks Host/Origin and accepts JSON bodies up to 3 MB. API failures return HTTP 400/403/500 and `{"error":"Chinese message"}`. No CORS dependency.

### GET /api/state

Returns:

```text
{
  token,
  config: { owned, accounts: string[], queries: string[], pages: 1..10,
            window_days: 1..90, replies: boolean, collect_accounts: boolean,
            query_type: "Latest" | "Top", slice_days: 0..30,
            weights: {fit, need, signal, angle, effort} },
  mode: "sample" | "live",
  dataset: Dataset,
  opportunities: Opportunity[],
  dashboard: {accounts: AccountMetric[], topics: TopicMetric[], posts: Tweet[], window, denominator},
  experiments: Experiment[],
  reviews: { [opportunityId]: {status: "new"|"shortlist"|"pass", note, updated_at} },
  connections: {twitter: boolean, kimi: boolean, model: string},
  job: {running, stage, error, done, total},
  has_live: boolean
}
```

Connection booleans mean a key is configured, not that an API probe succeeded. All metrics, counts, weights and timestamps should come from this response. Do not hardcode live results.

### POST /api/scan `{}`

Starts a background collection job and returns `{ok:true}` immediately. Poll GET `/api/job` every ~2 seconds; when `running` becomes false, reload state. Model analysis runs within the job if configured. A second concurrent scan is rejected.

Collection uses TwitterAPI.io Advanced Search, `Latest`, deduplication by tweet ID, per-query cursor pagination capped by `config.pages`. Errors and truncation are retained per source. A total collection failure preserves the previous dataset. A model failure retains new tweets with explicit keyword-fallback warnings.

**Time window (changed).** The window is no longer a fixed eight days. Each query resolves its own range:

- A query containing `since:` / `until:` is passed through untouched and filtered against its own dates. `until:D` follows X semantics and excludes `D`; it is capped at collection time. This makes long-range use-case mining (for example `"I used Kimi" since:2026-07-01 until:2026-09-05`) work; previously such a query was silently overridden and its posts discarded.
- Any other query gets a rolling `config.window_days` window (default 8).
- An unparsable date falls back to the rolling window rather than failing the scan.

**Sources.** Owned account query, plus — when `config.collect_accounts` is true — competitor timelines (`-filter:replies`) and, if `config.replies` is also true, one combined competitor-reply query. `collect_accounts: false` still keeps `config.accounts` populated: brand membership is what stops a competitor's own post, found by a keyword, from being counted as user evidence, and it is the corpus any future distinctiveness comparison needs. Replies are excluded from dashboard metrics but do reach analysis.

**Ranking and slicing.** `query_type` selects TwitterAPI.io `Latest` or `Top`. `slice_days > 0` splits a range-scoped query into consecutive `since_time:` / `until_time:` unix slices, each requested separately. This exists because `Top` over one long range returns whatever is strongest overall, which in practice is dominated by recent posts — asking for the top of each week is what actually samples a long window. A slice inherits its parent query's bucket, so recurrence across weeks is not confused with recurrence across topics. `validate_config` rejects a configuration whose estimated `slices × pages` exceeds 200 requests, before any spend.

**Mechanical filter.** Collection ends with a free, pre-model pass (`engine.mechanical_filter`) dropping reposts, near-duplicate copy-paste (token Jaccard ≥ 0.8, keeping the highest-engagement copy) and keyword-matched engagement bait. It reports `dataset.filter = {input, kept, dropped:{near_duplicate, promo, repost}, brand_kept}`.

**Brand posts are kept, not dropped.** A competitor launch or demo is legitimate input for "what is being demonstrated". They stay labelled `brand: true`, which already excludes them from author counts and user evidence in `make_opportunities`. Because brand membership is configured membership and not a classifier, an official account missing from `config.accounts` is counted as an ordinary user — this actually happened, with `@ClaudeDevs` (34k likes) and `@OpenAIDevs` scoring as user evidence until their handles were added. The account list holds up to 12 handles for this reason.

Display the filter report: the rules are keyword heuristics and still leak listicle bait ("15 Claude Code combinations…", "40+ best claude code tips" both survive), so the operator must read source posts before trusting a high social score.

### POST /api/analyze `{}`

Reanalyzes cached real tweets with Kimi without collecting them again. Starts a background job with the same `/api/job` polling contract. Requires cached live tweets and a Kimi key. Prior analysis survives a model failure. This endpoint is implemented; the preliminary frontend does not yet expose a dedicated button. Add “重新分析缓存” near source settings if useful.

### POST /api/config

Send the complete `config` object. Weights must sum to 100. Owned and competitor handles are bare usernames; 1–8 competitor accounts and 1–8 query strings. `pages` is 1–10, `window_days` 1–90, `replies` boolean. A query whose `since:` is later than its `until:` is rejected with a 400 rather than silently returning nothing. Keys omitted from the request keep their stored value, so an older client cannot reset `window_days` / `replies`; still, prefer sending the full object. Configuration changes are rejected while a scan is running. Saving refreshes sample data and current ownership classifications; new keyword settings require a new scan. Existing experiment snapshots remain unchanged.

### POST /api/mode `{"mode":"sample"|"live"}`

Switch cached datasets. Live requires a completed dataset. Sample mode never calls a model to generate a draft. No synthetic/real mixing.

### POST /api/review

```json
{"id":"opportunity-id","status":"shortlist","note":"运营判断"}
```

Status `pass` requires a nonempty note. `new` removes the selection. Rejected opportunities are retained for the “why we passed” story.

### POST /api/generate

```json
{"id":"opportunity-id","template":false}
```

Returns `{brief, usage?, warnings?}`. On real data with `template:false`, calls Kimi synchronously; allow a loading state of up to two minutes. Errors are explicit, not disguised as AI output. `template:true`, or any request in sample mode, returns a clearly labeled deterministic editable template with no API call.

`brief` contains these required string fields:

```text
title, audience, hypothesis, angle, prompt, caption, caption_alt,
demo, metric, decision_rule, claim_checks, generation
```

All editorial explanation is Chinese; captions and prompt are English. Model captions over 280 Unicode code points are retained as editable drafts and returned with warnings; show the warning and character counter. An editor counter is advisory, not an exact X weighted-character validator. Never auto-publish. Copy/export are local user actions.

### POST /api/experiment

```text
{
  experiment_id: existing ID or null,
  opportunity_id: current opportunity ID for a new experiment,
  brief: complete Brief,
  checks: {sources:boolean, usable:boolean, repeatable:boolean},
  status: "draft"|"testing"|"validated"|"failed",
  notes: string
}
```

Returns `{ok:true, experiment}`. Validation requires all three checks and actual notes. Failed status requires notes. Saving a new experiment snapshots its opportunity, mode and evidence; later scans cannot rewrite its provenance. Saving an existing experiment preserves those snapshots. The frontend exports Markdown from the saved/current brief and evidence; no export API is needed.

## Data schemas and interpretation

### Tweet

```text
id, handle, name, text, created_at (ISO or null), url (X permalink or null),
likes, replies, reposts, quotes, views, followers (numbers or null),
is_reply, is_repost, source (account/keyword), topic,
signal ("Brand post"|"User need"|"Workflow example"|"Conversation"),
brand: boolean, sample: boolean
```

Display tweet text as text, never executable HTML. Sample tweets have no permalink and must be labeled simulated. Signal labels and dashboard topics use simple English keyword heuristics, not verified human intent. Quoted posts may count as originals; reposts are excluded from ranking/metrics. Brand membership is configured account membership, not a platform-wide brand classifier.

### Dataset

```text
mode, collected_at, tweets, complete, warnings[],
coverage: [{query, source, returned, kept, pages, complete, error,
             explicit_range, since, until}],
method, usage, analysis_coverage? {included,eligible}
```

`source` is now `account` | `keyword` | `reply`. `returned` is what the API sent; `kept` is what survived the query's time window — show both, because a large `returned` with `kept: 0` means the window discarded everything, not that the topic is quiet. `explicit_range` marks a query that carried its own dates; `since` / `until` are the resolved ISO bounds actually applied. `usage.tweet_records_kept` mirrors this at dataset level.

`complete` means selected queries exhausted pagination. It does NOT mean representative coverage of X. Model input is capped at 120 eligible tweets, prioritizing non-brand/user-need signals. Show `analysis_coverage` when present. No infinite scan or silent uncapped spend.

### Opportunity

**Reframed.** This object is a *use-case idea*, not detected product demand. It answers "people are already demonstrating this workflow; could Kimi do a useful version, and would it make a strong post?" It must never be presented as proof that users need a feature. The API field is still named `opportunities` — renaming was deliberately deferred to keep the working experiment loop intact — so the UI carries the honest label while the contract stays stable.

Model-produced ideas must supply all of `IDEA_FIELDS`: `title, problem, audience, angle, observed_pattern, kimi_adaptation, social_format, risk, next_action`. A card missing any one is rejected, as are invented evidence IDs.

**Rejection is per idea, not per batch.** An idea citing evidence that does not exist is never shown, but the remaining valid ideas from that already-paid call are kept, and `dataset.analysis_rejected` plus a warning record how many were discarded. Only a wholly invalid response fails the run. The earlier all-or-nothing rule threw away a complete paid analysis because of one bad sibling — the same failure the caption-length fix addressed.

```text
observed_pattern, kimi_adaptation, social_format, risk, next_action,
social (0..100 | null), social_detail {engagement_rate, amplification, rate_n, amp_n},
evidence_strength (0..100), quadrant (string), buckets (int),
id, title, topic (Research/Slides/Spreadsheets/Documents), problem, audience,
angle, score (0..100), scores {fit,need,signal,angle,effort} (0..5),
rationale (same keys, strings), evidence_ids[], authors, needs,
recent, previous, growth (number or null), confidence, fit, action, why_pass,
capability {name, description, url}, method
```

Model-generated opportunity title/problem/angle come from supplied evidence and a curated capability reference. References are checked against input tweet IDs. Grouping fallback is simple keyword buckets. The ranking is deterministic: fit 4/5, angle 3/5, effort 4/5 are transparent initial assumptions; need is capped matching-need count +1, signal is capped distinct non-brand-author count. Both cap at 5. Default weights: 30/25/20/15/10. No success probability. Current signal weight measures breadth, not a model-estimated momentum score.

`growth = recent24h / (preceding7days / 7)` only if at least three baseline posts, collection is complete, `config.query_type` is not `Top` (Top is not a time-uniform sample, so a per-day rate from it is meaningless), **and `config.window_days >= 8`** — a shorter window truncates the denominator and would inflate the ratio, so it is withheld instead. Otherwise null. Label as sample discussion growth, never global trending. Each opportunity remains “needs testing”; the actual trial is stored on its experiment, not asserted by the model.

### AccountMetric and dashboard

```text
handle, owned, posts, views_n, median_views (number|null),
interaction_rate (number|null), rate_n
```

Dashboard uses posts aged 24 hours through less than 8 days at the dataset's collection timestamp. **This window is pinned and does NOT follow `config.window_days`** — widening collection must never silently change what these numbers mean. Consequence to surface in the UI: a scan using a custom `until:` well in the past can produce a fully populated dataset and an empty dashboard. That is a window mismatch, not weak performance; the scan emits a warning saying so. Excludes replies/reposts. Metrics are lifetime snapshots, NOT first-24-hour metrics. `interaction_rate` is the median of per-post `(likes+replies+reposts+quotes)/views*1000`. All component metrics must be present and views positive. Missing values stay null; legitimate zero remains zero. Display sample sizes. No conversion, follower-growth history, sentiment or paid/organic classification is available.

`TopicMetric`: handle, topic, n, views_n, median_views. Topic counts are exploratory content distribution; a gap is not proof of a growth opportunity.

### Experiment

```text
id, created_at, updated_at, opportunity (snapshot), mode,
evidence (Tweet[] snapshot), brief, checks, status, notes
```

### The two scoring axes

Both are **deterministic**; no model call decides ranking.

- `social` (0–100) — percentile rank **within the current collection** of the evidence posts' median engagement-per-1k-views and median views-per-follower. The first reuses the performance dashboard's `interaction_rate` definition, so an idea's score and the account dashboard speak one language; the second measures how far a post travelled past its author's own audience, the closest available proxy for "this topic would travel for us too", since Kimi inherits none of that author's followers. `null` when neither metric is available. **Scores are ranks inside one batch and are not comparable across collections** — label them that way.
- `evidence_strength` (0–100) — distinct non-brand authors on a fixed ladder (1→20, 2→45, 3→65, 4→80, 5+→90), +10 when the pattern recurs across more than one query bucket.

**Never blend them into one number.** A one-off oddity can be excellent content while representing no pattern; a common pattern can be dull. `quadrant` names the combination. Sorting is by social first, then evidence. `social` describes how *other people's* posts performed — it is not a prediction of Kimi's reach.

## Current limitations / frontend priorities

1. Existing UI is preliminary: perform browser QA on navigation, evidence dialog, text editing, save/reload, validation failure, export and responsive layout.
2. No real Kimi product trial has been performed. Never mark a use case verified without the user's actual input/output trial.
3. No first-class compare-to-own-baseline uplift, lifecycle tracking or experiment A/B analysis is implemented. Don't add invented charts for them.
4. Scoring assumptions are transparent but intentionally simple. A later evidence evaluation can refine them. The first live model batch contains several weak or off-brief ideas (including disputed political estimates / stock research). These are unreviewed candidates, not endorsements. The analysis prompt has since been tightened to routine professional productivity; it was not rerun merely for cosmetic output. Preserve the reject-with-reason interaction and inspect evidence before selecting a demo.
5. No import endpoint; current data entry is collection or sample mode. No automatic publishing.
8. Cost is now operator-controllable and unbounded in the UI's direction of travel: `window_days` up to 90 × `pages` up to 10 × sources. Show an estimated request count before a scan, and surface `usage.requests` / `tweet_records_kept` after. Long-range scans have not been run; `queryType` remains `Latest`, so "top" ranking is not available — sorting by engagement would have to be done client-side over what was collected.
9. Competitor-reply collection is implemented and unit-tested against a mocked API, but has never been run against the live API. Reply volume for a large account is unverified and may dominate the 120-tweet analysis cap.
10. `Top` + slicing and the reframed idea prompt are implemented and unit-tested, but **have not been run against the live API**. Whether TwitterAPI.io honours `since_time:` / `until_time:`, and how its `Top` ranking behaves per slice, are both unverified.
11. The bait filter leaks. Across two real batches it removed 16 then a further 13 posts, yet listicles such as "15 Claude Code combinations…" still score in the 80s. A high social score on unread evidence is not trustworthy.
13. `Top` + 14-day slicing is now **verified against the live API**: 5 slices returned 20 posts each, spread 31/30/10 across July/August/September, versus 60 posts from a single day before slicing. `since_time:` / `until_time:` are honoured.
15. One live analysis has now run end to end on the sliced corpus: 71 posts in, 6 idea cards out, 0 rejected, ~24.9k tokens (22.5k cached). The cards mapped a developer-heavy corpus onto knowledge-worker use cases and their `risk` fields correctly flagged the recurring gap that the original posts demonstrate persistent agents while Kimi offers a manual one-shot flow. Nothing downstream of the card was exercised.
16. Evidence counts are posts, not people. One card cited 3 posts from a single author; `evidence_strength` correctly scored it 20, but any UI must show the author count beside the post count or the card reads stronger than it is.
14. Both live batches landed off Kimi's four documented capabilities — the first on 3D/video creative work, the second on developer tooling (68 of 71 posts mention app/tool/agent/code; only 18 touch office or knowledge work). The capability taxonomy and the query are not yet aimed at the same audience.
12. Everything downstream of the idea card — caption schema, brief fields, the performance dashboard's framing — was intentionally left on the old contract. Only the card stage was reworked.
6. API polling should avoid replacing dirty editor state. Preserve or explicitly discard unsaved edits during navigation/refresh.
7. If adding assets or a framework, keep the loopback credential boundary and preserve the API contract.

## Tests

```bash
python3 -m unittest discover -s kimi-radar -p 'test_*.py' -v
node --check kimi-radar/static/app.js
```

Do not use new paid API calls as a substitute for UI testing. Use cached live data or sample mode. Consult `VALIDATION.md` for what was actually tested.
