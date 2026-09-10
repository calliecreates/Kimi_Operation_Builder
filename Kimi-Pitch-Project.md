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

**4. Chat UI** ✅ 2026-09-11 — `copilot/static/`, Preact + htm from CDN, no build. Chinese. Main tab is the chat: 写 Caption / 处理评论; candidate cards with checklist badges, type chips, refine, adopt / edit / skip; comment cards grouped by action with folded no-reply and archive lists. Records tab: adoption rate, edit ratio, recent runs, voice hashes. 语气手册 tab: the four guides read-only.

**5. Automation policy** — now expressed in code and docs rather than a page: COMMENT_POLICY.md decision table, lint in code, human decisions recorded. A one-screen policy page is optional.

**6. Deploy** ⏳ 2026-09-11 — GitHub `calliecreates/Kimi_Operation_Builder` → Railway project `kimi-content-copilot`, service `copilot`, volume `/data`, domain https://copilot-production-ada7.up.railway.app. No access code by owner's decision; per-IP rate limit (12/min, 150/day) instead. Nixpacks needs `requirements.txt` to detect Python.

## Log

- 09-11 Policy: 额度/算力/订阅 category merged into 产品负面 (owner's call), with a `quota` topic tag from the keyword rule; tagged complaints are counted, not queued. Twelve categories now. Offline replay: human-look cards per post 10 / 22 / 4 / 9 instead of 22 / 40 / 5 / 22 without the tag.
- 09-11 UI v3.1: 记录 tab removed (metrics stay in /api/state); 语气手册 shows a Chinese header per guide (what / source / how used / version) and section links above the full text; composer smaller and pinned to the viewport bottom.
- 09-11 UI v3 after second review: type is confirmed before generation (brief job → type picker card → generate job; the picker stays for changing type); comment 发送 locks the card as 已发送, human-look cards get an empty reply box; post chooser persists with 已选. Buttons unified: 发送 / 采纳. Classification temperature: kimi-k3 rejects anything but 1, so the client now forces 1 for K3 models; the low-temperature attempt broke production for a few minutes on 09-11.
- 09-11 UI v2 after owner review: 生成文案 / 处理评论 as the two primary pages; live stage progress (提取简介 → 类型 → 各平台候选 → checklist) from job stages; material collapsed; brief with numbered facts visible; platform tabs; type bar with 重新生成; XHS title / body / tags split; placeholder list per card. Comments became a guided flow (owner's choice): 选帖子 (four real notes) → 筛选与起草 with live stages → 逐条决定 (确认回复 / 编辑后回复 / 跳过 / 升级) → tally → 本轮小结. Cards show 官号当时回复了 where the data has a real reply. Paste stays as a fold.
- 09-11 Server + chat UI built and tested locally end to end (caption run, adopt, comments run). Pushed to GitHub; Railway project created; first two builds failed on Python detection, fixed with requirements.txt.
- 09-11 Comment replay on 231 real comments: precision 0.39 / recall 0.47 vs Kimi's own reply choices; 13 categories covered every comment; biggest lever is a product FAQ as extra FACTS (see COMMENT_POLICY.md Evaluation).
- 09-10 Step 2 backend: first real run 60 s end to end (brief 28 s, X 19 s, XHS 32 s in parallel); zero lint failures, placeholders used instead of invented links. Fixed: X prompt must say English; blank-line instruction caused malformed JSON. PRD's 30 s target needs a faster model for brief extraction or skipping it when the operator gives structured facts.
- 09-10 Step 1 done for X and Xiaohongshu. Both guides have a three-register (XHS) or type-based structure, verbatim few-shot examples, and a model cross-check. `model_json` gained `timeout` and `max_tokens` params; failed parses keep the raw reply in `data/last_model_raw.txt`. Next: Step 2, backend first (generator + review + webhook), then frontend.
