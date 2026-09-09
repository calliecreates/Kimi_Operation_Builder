# Kimi Pitch Project

Second-round demo for the Kimi (Moonshot AI) AI Ops / Builder role. Single source of progress.

## Context

- v1 Kimi Radar shown 2026-09-08. Feedback: results are raw posts you must click into; how would you iterate it for product, ops and R&D who have no spare time; have you thought about a bot?
- Human-in-the-loop scenarios posed: (1) auto-reply to community questions, (2) triage 1000 feedback items, (3) write launch copy for a new feature.
- A competitor-monitoring "detect → write → auto-distribute" case came from someone at another company. Reference only.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 09-10 | Web app deployable to Railway, bot-shaped; no Feishu as the host | Interviewers can open a URL, not my Feishu |
| 09-10 | One feature at a time. First: scenario 3, launch copy | Due tomorrow. Kimi's own scenario, no X-scraping dependency, clearest HITL story |
| 09-10 | Scenario 2 deferred; synthetic data if ever built | Not enough real feedback |
| 09-11 | Comment policy: 额度 complaints get no individual reply; 功能建议 archived with a tag; Xiaohongshu only | Matches what Kimi actually does in the data; X has no comment data |
| 09-10 | Copy generation is constrained by Kimi's real voice, distilled from its own posts | Must read like Kimi, not like AI marketing |

All functionality is real: Kimi API, TwitterAPI.io, outbound webhooks. No replay data.

## Steps

**1. Research Kimi's voice** ✅ 2026-09-10
- `voice_collect.py` → `data/voice/kimi_posts.json` (100 posts, Jan–Sep 2026)
- `voice_distill.py` → `data/voice/kimi_voice_profile.json` (machine-readable, Kimi K3, 19.7k tokens)
- `KIMI_VOICE.md` → X guide, Spotify structure, loaded when generating an X post
- `KIMI_VOICE_XHS.md` → Xiaohongshu guide (title / body / tags), from 100 「Kimi智能助手」 notes, `data/voice/xhs_posts.json`

**2. Caption generator** ⏳ backend built 2026-09-10 — `copilot/` package (stdlib Python, no framework). `llm.py` Kimi JSON client · `voice.py` guide loader, few-shot selection by type, checklist as regex · `caption.py` material → brief with numbered facts → type suggestion → per-platform candidates (parallel) → lint in code · `store.py` JSONL run records with voice hash and prompt version. CLI: `python3 -m copilot.caption --material ...`. 15 unit tests for lint and grounding. Every claim traced to a brief line; unsupported claims flagged.

**3. Comment triage** ⏳ rebuilt 2026-09-11 to `COMMENT_POLICY.md` — 13 categories derived from 231 real Xiaohongshu comments and 19 Kimi replies (`data/voice/xhs_comments.json`). Selection is a decision table in code, not a score; likes are displayed, never used. Risk = keyword rules with a hyperbole guard (joke sticker or 额度 vocabulary → quota + human look). `KIMI_VOICE_REPLY.md` rewritten from the 19 real replies: one line, no links, sticker mirroring. Xiaohongshu only. `copilot/eval_comments.py` replays the real comments and reports precision / recall of "reply" against Kimi's actual choices.

**3b. Review state** — adopt / edit / skip / escalate with edit distance. Track adoption and edit rate.

**4. Outbound** — Feishu custom-bot webhook, Slack incoming webhook. Push on approve.

**5. Automation policy page** — autonomy level and reason for each of the three scenarios. Criteria: reversible? internal or external? cost of error vs cost of delay? can the model self-verify?

**6. Deploy to Railway** — PORT, 0.0.0.0, host check, access code, volume.

## Log

- 09-11 Comment replay on 231 real comments: precision 0.39 / recall 0.47 vs Kimi's own reply choices; 13 categories covered every comment; biggest lever is a product FAQ as extra FACTS (see COMMENT_POLICY.md Evaluation).
- 09-10 Step 2 backend: first real run 60 s end to end (brief 28 s, X 19 s, XHS 32 s in parallel); zero lint failures, placeholders used instead of invented links. Fixed: X prompt must say English; blank-line instruction caused malformed JSON. PRD's 30 s target needs a faster model for brief extraction or skipping it when the operator gives structured facts.
- 09-10 Step 1 done for X and Xiaohongshu. Both guides have a three-register (XHS) or type-based structure, verbatim few-shot examples, and a model cross-check. `model_json` gained `timeout` and `max_tokens` params; failed parses keep the raw reply in `data/last_model_raw.txt`. Next: Step 2, backend first (generator + review + webhook), then frontend.
