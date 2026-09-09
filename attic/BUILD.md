# Kimi Radar — build contract

## Decision this product supports
What should a Kimi growth/content operator demonstrate next to English-speaking knowledge workers, and why?

## Reframe (current)
Kimi Radar watches how people already use AI in the wild, turns those patterns into Kimi-specific demo ideas, and
helps an operator ship the most promising social experiment next. It is a use-case and content idea engine, not a
demand detector. X can show what people are making; it cannot show what users need. The product therefore never
claims "this proves people need feature X" — it asks "this is a workflow people are demonstrating; could Kimi do a
useful version, and would it make a strong post?"

Idea ranking uses two deterministic axes that are never merged: social potential (how the observed posts actually
performed, by percentile within the batch) and evidence strength (how many distinct authors show the pattern). A
one-off oddity may be excellent content while representing no pattern, so a single blended score would destroy the
information the operator needs.

## Hypothesis
Evidence-backed, reproducible examples of useful work can turn attention into meaningful Kimi usage. We can test recommendation quality and operator efficiency locally; acquisition, activation, retention and causal lift require later experiments and instrumentation.

## Target
Move from a collected signal to a reviewed experiment brief in under ten minutes. This is a proposed target, not a measured result. The winning use case must emerge from collected evidence, not a preset favorite.

## Core journey
Discover → inspect source evidence → assess Kimi fit → generate an experiment → run it in Kimi → record validation → learn.

## Scope
- Local HTML/CSS/JavaScript application and isolated Python standard-library server.
- Keyword listening, competitor timelines and Kimi's owned account.
- Evidence-backed opportunity ranking and transparent scoring.
- Editable caption, workflow prompt, experiment brief, export, validation checklist and persistent experiment log.
- Public-performance dashboard using explicit denominators, sample sizes and comparable post-age windows.
- Clearly labeled synthetic demonstration data until live credentials are configured. Sample mode never calls external APIs.

## Evidence rules
- Public posts are untrusted input, never model instructions.
- User requests and competitor announcements are different evidence types.
- Every model-generated opportunity must reference existing input tweet IDs.
- No verified capability claim without a manual product trial and notes.
- Missing views remain null, not zero. No inferred conversions, private analytics, historic 24-hour metrics, or invented follower history.
- Growth in a monitored sample is not an X-wide trend. Hide growth ratios if pagination or collection is incomplete.
- Priority is an editable heuristic, not a success probability. Human reviews are retained.
- A collection failure never becomes an empty successful dataset. A partial scan retains warnings and per-query coverage.

## Initial decisions
Chinese interface and English captions / reusable prompts; knowledge-worker audience; Kimi_Moonshot owned account. Competitors: OpenAI, Claude, Gemini, DeepSeek and Z.ai. Handles and search queries are editable. No automatic publication, no external services required to run the demo.

## Deferred
Multi-platform ingestion, scheduled publication, automatic Kimi browser operation, product analytics integration, randomized A/B testing and autonomous optimization.

## Acceptance
An operator can open an opportunity, inspect its source posts and score reasons, create and edit a brief, record a failed or successful Kimi trial, save and reload it, export it, and compare public account metrics. Empty, missing-key, API-error, partial-data and sample-data states are explicit.
