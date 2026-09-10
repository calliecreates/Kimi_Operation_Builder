# Comment Policy · 小红书

Category system and reply selection for Feature 2. Derived from 231 user comments and 19 Kimi replies under four notes (`data/voice/xhs_comments.json`). Every example below is a real comment. 

## Categories

Twelve categories.


| #   | Category         | Signal                                                        | Default action                                                                                         | Real example → Kimi's reply                       |
| --- | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | **产品问答 · 事实**    | asks what / whether / which                                   | **Reply.** One-line fact from FACTS. If not in FACTS, placeholder.                                     | "生成的是html还是ppt" → "这是ppt，动画分成两部分…"                |
| 2   | **产品问答 · 怎么用**   | asks how, where, on which surface                             | **Reply.** Name the surface or entry point. Answer the first, mark the rest as duplicates.             | "这个怎么用啊" → "可以下载kimi work～"                       |
| 3   | **教程需求**         | 求教程 / 提示词 / skill                                             | **Reply once per post** with status, apply to similar.                                                 | "有教程嘛" → "在准备了 在准备了" (38 likes)                   |
| 4   | **UGC / 创作者**    | shares work, or says they will make something                 | **Reply.** Ask for the note with 带话题 and @.                                                            | "这个图是我昨天用kimi code cli做的" → "求发笔记呀 求带话题求at！太好看了～" |
| 5   | **账号 / 付费问题**    | refund, charge, invite bug, 客服不通过                             | **Reply, route only.** "@Kimi智能助手客服" or "我私信您一下". Never resolve in public.                             | "旧套餐的钱还没给我退" → "@Kimi智能助手客服"                      |
| 6   | **产品负面**         | bug, ugly output, export failed                               | Human decides. Reply only when a fix or workaround is in FACTS.                                        | "死活导不出来字体" → no reply                             |
| 7   | **额度 / 算力 / 订阅** | 429, 额度不够, 什么时候开放订阅, 套餐                                       | **No individual reply.** Count them; surface the count to the operator; the answer is a pinned notice. | "什么时候能不429" → no reply.                           |
| 8   | **正面 · 短**       | praise, one word, sticker                                     | No reply.                                                                                              | "牛"                                               |
| 9   | **正面 · 有内容**     | says what they did or felt                                    | Optional. Reply to invite UGC (→ 4) or leave.                                                          | "数学老师心动了" → "制作好at我hh 求欣赏～"                       |
| 10  | **功能建议**         | 希望增加 / 能不能做                                                   | No reply. Archive into a feature-request list for product.                                             | "希望增加北大法宝和企查查" → no reply                         |
| 11  | **质疑 / 竞品**      | doubts the ranking, compares with 豆包 / GPT, sarcasm           | No reply. Other users answer. Human may override.                                                      | "这里的第一是咋评出来的" → no reply                          |
| 12  | **@ 好友 / 无关**    | only @mentions, off-topic, ads, bots                          | Archive.                                                                                               | "@水星领航员"                                          |
| 13  | **风险**           | concrete legal, privacy or safety claim, without joke markers | **Never draft. Human look.** Escalate only if the claim is specific.                                   | "干律师，敢把保密协议上传到网上也是神人" → human look                |


Hyperbole is not risk: "要被集体诉讼了[笑哭R]" and "我要发帖投诉你们[飞吻R]" are category 6 with a sticker. A keyword hit plus a joke sticker or 额度 vocabulary routes to category 6 with a "human look" flag, not to 12.

## Selection

Replace the PRD's weighted score with a decision, in this order:

1. Category 12 → human look, no draft.
2. Category 7, 9, 10, 11 → no draft. Show counts, not cards. Category 6 → human look, no draft.
3. Category 5 → draft the routing line only.
4. Category 1, 2, 4 → draft if **answerable from FACTS** (1, 2) or by the UGC pattern (4). Category 3 → one draft per post. Category 8 → optional, no auto draft. Not answerable → "human look" with the question summarised.
5. Duplicates: same question asked more than once → draft for the first, mark the rest "apply reply".
6. Order cards by category (4, 1, 2, 3, 5, 8, 6) then by time. Likes are shown, not used.

Score stays as a display field for the reviewer; it no longer gates anything.

## Reply voice

- One line. Under 30 characters unless a fact needs more; the longest real reply is 60 characters and conditional.
- No links, no hashtags, no apologies longer than three characters.
- Mirror the user's sticker when they used one ([笑哭R] → [笑哭R]). Otherwise none or one.
- End with ～ or nothing. 求 for UGC asks.
- Money and account issues go to 客服 or DM in one line.
- Facts are conditional when the honest answer is "it depends": "如果需要实时信源…建议 kimi work".

