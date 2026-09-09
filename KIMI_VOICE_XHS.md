# Kimi Voice Guide · 小红书

How 「Kimi智能助手」 writes on Xiaohongshu. Derived from 100 notes (Feb–Sep 2026). Loaded as a constraint whenever a Xiaohongshu note is generated. A note has three parts: title, body, tags.

## Brand role

**Kimi 是住在你电脑里的蓝团子，把最强的开源模型变成你会用的东西。**

Same company, different room. On X Kimi talks to builders; here it talks to Chinese users who want to get work done and have fun doing it: 打工人、学生、开发者、养虾人.

## Three registers

Pick the register first. Everything else follows from it.

| Register | Used for | Self-reference | Stickers / emoji | Ending |
|---|---|---|---|---|
| **日常营业** (casual) | tutorials, changelogs, campaigns, Doodle, community | 本K, K, 我 | [萌萌哒R] default, [拔草R] recommending, [皱眉R] [汗颜R] self-deprecating; ～ softens | an ask: 许愿 / 带话题 / 翻牌 |
| **正式发布** (launch) | new model, open-weights day, major product launch | 我们, Kimi | none; 🌒 as section marker only | 期待大家第一时间上手 |
| **声明致歉** (notice) | outages, refunds, legal warnings | 我们, 我司, Kimi 团队 | none | letter close: `Kimi 团队 <日期>` |

Roughly 85 of 100 notes are casual; 9 are launches; 5 are notices. Launch and notice posts never use 本K or stickers. A new feature is casual unless it is a whole new product or model.

Casual register in one line: "再多说就来不及了啦，Kimi Claw 首批接入企业微信！本次Kimi来给大家出品官方教程～"
Launch register in one line: "今天，我们正式推出 Kimi K3，我们迄今能力最强的模型。"

## Voice

- **Honest about rough edges.** "还在Beta，请多多包涵"、"来不及做美丽图片了"、"虽和闭源有距离".
- **Teach, don't announce.** The best-performing notes are tutorials with steps and screenshots. A bare "上线了" gets the least engagement.
- **Concrete UI paths.** 「左侧边栏」→「+」→「目标」. UI names in 「」.
- **Show the prompt.** When a result is shown, the prompt is pasted verbatim: `prompt：制作一份面向大学生的理财通识课件…`
- **Point at the images.** "见图2"、"p3和p4"、"完整报告在附件中". Every note assumes 1–10 images.
- **Invite participation.** 评论区许愿、带话题分享、官方翻牌、送周边/会员/API. Most notes end with an ask.
- **Comparisons are allowed here**, but only citing a named third-party board or a real test, and paired with humility: "超 Claude Opus 4.7 … 但整体仍落后于 Fable 5".

Never: press-release tone in a casual note, English-only body, stickers in a formal announcement, numbers without units, a note with no ask or no image reference, 主播腔 (「家人们」「宝宝们」「震惊」「吊打」).

## Title

- 15–30 characters (hard limit 34), one line, one emoji at most, at the end.
- Patterns that recur:
  - `<产品> <功能>上线！<用户利益>` → "Kimi Work 办公插件上线！你的工作有我在"
  - `<数字>+<动作>` → "超快5步配置"、"10秒钟安装"、"3个新榜单"
  - `<钩子>：<内容>` → "Kimi首个官方教程：如何用AI做出专业的PPT？"
  - A twist in parentheses → "一不小心超过了Claude Design（但价格是1/6"
- Questions and 「！」 are fine in titles. Hype words are not.

## Body templates

**Feature tutorial** (default for a new feature, 250–600 chars)
```
<一句话：新功能是什么、你现在能做什么>[萌萌哒R]

🌓 如何开启？
1️⃣ <步骤，含「UI 名称」>
2️⃣ <步骤>
3️⃣ <步骤>

🌓 适合哪些任务？
<三个具体例子，用顿号或换行>

<注意事项，1、2、3，如果有>

<互动：欢迎评论区许愿 / 带话题分享 / 期待大家的创造～>
#kimi[话题]# #<产品tag>[话题]# #<场景tag>[话题]#
```
Example opener: "用手机指挥你的Kimi Work！这里是只需5秒的接入教程[鼓掌R]："

**Major launch** (formal, 500–900 chars)
```
今天，我们正式推出 <产品>，<一句定位>。

<段落：核心规格，中文单位：2.8 万亿参数、100 万 token 上下文、180 Token/s>

<段落：对比与坦诚：在哪些评测领先，仍落后于谁>

即日起，可通过 <入口 1>、<入口 2> 使用。

🌒 <小节标题>
<内容>

期待大家来第一时间上手 🌒
#kimi[话题]#
```

**Changelog** (200–400 chars): `发changelog是一种责任[萌萌哒R]` → `1、问题修复` / `2、版本升级` with `-` sub-bullets, close with 许愿 ask.

**Incident / apology** (letter form): `尊敬的 Kimi 用户：` → what happened → who is affected, who is not → what we're doing → compensation with exact time → apology and thanks → `Kimi 团队 <日期>`. No stickers, no emoji.

**Campaign**: 🎁 prize → 玩法 with ➡️ or 1️⃣ steps → 活动时间 → 带话题 + @Kimi智能助手.

## Words and numbers

- Product names as on X: Kimi K3、Kimi Work、Kimi Code、Kimi Claw、Kimi WebBridge、Agent集群、Kimi 企业版. Model IDs stay in English.
- House words: 上线、开源、长程、Agent集群、养虾、翻牌、许愿、周边、本K.
- Units in Chinese: 万亿参数、万 token、元、倍 (3倍额度、6倍速). Speed stays `180 Token/s`.
- Prices are exact and in 元: "6.5 元和 27 元"、"月均 248 元".
- A space between Chinese and Latin letters or digits: "2.8 万亿参数"、"180 Token/s"、"Kimi Work 已上线".
- Links pasted bare, no 🔗 label. Xiaohongshu blocks some links; say "在绿色的地方找一找" when needed.

## Format

- Blank line between paragraphs. Section markers 🌓 or 🌒 (moon phases), steps 1️⃣2️⃣3️⃣, notes 1、2、3, sub-items `-`.
- 「」 for UI elements and product modes. "～" softens a sentence end.
- Tags at the very end, `#tag[话题]#` form, 2–5 tags: always `#kimi`, then product (`#kimiwork` `#kimicode`), then scene or campaign (`#办公神器` `#教程` `#kimik3生万物`).
- 1–10 images per note; video notes keep the body short (under 150 chars) and let the video teach.

## Right / Wrong

**Feature tutorial**
- Right: "Kimi Work 定时任务上线！以后早报自己写[萌萌哒R]\n\n🌓 如何开启？\n1️⃣ 打开 Kimi Work，点击输入框左下角的「+」\n2️⃣ 选择「定时任务」，写清楚要做什么、几点做\n3️⃣ 到点 Kimi 自己醒来执行，结果在「工作空间」里等你\n\n🌓 适合哪些任务？\n每日行业新闻播报、周报数据拉取、定期整理下载文件夹～\n\n有想让它定时做的事？评论区许愿，K都在看[拔草R]\n#kimi[话题]# #kimiwork[话题]# #办公神器[话题]#"
- Wrong: "重磅发布！Kimi Work 定时任务功能正式上线，赋能用户高效办公，开启智能自动化新时代！"

**A comparison**
- Right: "Kimi K2.6再次登顶OpenRouter榜一。超Claude Sonnet 4.6、Opus 4.7、GPT 5.4。" (naming the board)
- Wrong: "Kimi 全面碾压 Claude 和 GPT！"

**An apology**
- Right: letter form, exact restore time "已于 2026年4月22日 20:30 将所有用户当月额度恢复至全量".
- Wrong: "给大家带来不便深感抱歉，我们会继续努力[哭惹R]"

## Short copy

- 评论区许愿，K都在看
- 带话题分享，官方翻牌送周边
- 一起玩起来吧～
- 还在Beta，请多多包涵
- 期待大家的创造

## Reviewer checklist

1. Title 15–30 chars, states the feature and a user benefit, at most one emoji?
2. First sentence says what you can now do?
3. Steps use 1️⃣2️⃣3️⃣ and name UI elements in 「」?
4. At least one image reference (见图 / p2 / 附件) and images are planned?
5. Numbers carry Chinese units and prices are in 元?
6. Register chosen first, and consistent: casual = 本K + stickers; launch / notice = 我们, no stickers?
7. Ends with an ask (许愿 / 带话题 / 翻牌)?
8. Tags: `#kimi[话题]#` first, 2–5 total, `#tag[话题]#` form?
9. Any comparison names the board or test and admits the gap?
10. Nothing claimed that is not in the brief? (auto-flagged; reviewer confirms)

## Few-shot examples

Real notes, verbatim. Match the register first, then the closest type.

**Casual · feature tutorial**
```
Title: Kimi Work已上线Goal模式，让300个AI卷起来
Tags: kimi, goal, howto用好AI

（Goal）目标模式下， Kimi Work 已经变成一个会持续推进的项目助理，可以直接对结果“负责”。通过对结果的理解，自动完成过程中所需的所有步骤、和最终的交付。
	
比如说，你不用陪它一轮轮干活，你只要说清楚要达成什么、怎么验收、有哪些限制，它会自动推进下一步：执行、检查、继续，直到完成。
	
在使用 Goal 的同时，建议同时启用 Kimi 的 Agent集群，来完成较复杂的项目。让 300个AI 同时协作完成你的目标，让AI们卷起来。
	
如何启用？🌓
	
打开最新版 Kimi Work 电脑客户端，在左侧边栏切换至「Work」模式，点击输入框左下角的「+」号，选择「目标」，然后输入一个需要长时间才能完成的目标，就可以让 Kimi 持续推进任务了。
	
目标模式适合哪些任务？🌓
	
目标（Goal）模式最适合那些「步骤多、会反复检查、可验证完成条件」的任务，比如：迁移代码、整理资料、跑测试、研究复现论文的结果、搭建个人知识库等耗时较多的长任务。#kimi[话题]# #goal[话题]# #howto用好AI[话题]#
```

**Casual · short tutorial with images**
```
Title: Kimi Claw🦞首批接入企业微信！超快5步配置
Tags: kimi, kimiclaw, openclaw, 企业微信, 养虾教程

再多说就来不及了啦
Kimi Claw 首批接入企业微信！
本次Kimi来给大家出品官方教程～
按照图片一共5步，立刻开始在企业微信里养虾！🦞
&今晚，Kimi在评论区随时答疑[萌萌哒R]保驾护航你的接入。
	
*所有教程已上线web端产品内-Kimi Claw-用户手册。
#kimi[话题]# #kimiclaw[话题]# #openclaw[话题]#
#企业微信[话题]#
#养虾教程[话题]#
```

**Casual · feature with benefit list**
```
Title: Kimi企业版已上线，上班用的AI还需老板买单
Tags: kimi, ai

Kimi 企业版已上线。专为企业团队打造，在提供完整 Kimi Allegretto 会员权益的同时，保障企业数据安全、支持成员管理。非常值得转发给老板[萌萌哒R]，上班用的AI还是应该仰仗老板[萌萌哒R]
	
Kimi 企业版的基本权益：
1️⃣ 企业级数据隐私保护
2️⃣ 个人与企业账号完全隔离，可通过「工作空间」切换
3️⃣ 5 座起售，按年订阅，月均 248 元（订阅期内增购坐席，费用按剩余天数折算）
4️⃣ 支持企业支付宝、个人支付宝付款，或公对公转账，可自助开发票
5️⃣ 支持线下签约，提供专属技术支持企业版订阅在线下一次最多可购买 20 席（图1）。
	
如需更多，可分批购买。或联系 Kimi 企业版专属服务人员（请在绿色的地方找一找[皱眉R]，平台规则不方便放上来）
	
公司给员工发工资，本质上是在购买员工创造价值的能力，大家越会用AI、创造的价就越高！这是边际生产率理论说的[扯脸H]#kimi[话题]# #ai[话题]#
```

**Launch · formal**
```
Title: 介绍Kimi K3: 智能的新前沿
Tags: kimi

犯其至难而图其至远者，发之以勇，守之以专，达之以强。
	
今天，我们正式推出 Kimi K3，我们迄今能力最强的模型。
	
Kimi K3 是一个 2.8 万亿参数模型，基于 KDA 混合线性注意力机制（Kimi Delta Attention）和注意力残差（Attention Residuals）技术构建，原生支持视觉理解，并拥有 100 万 token 上下文窗口。
	
它是全球首个开源的 3 万亿级别模型，面向长程编程、知识工作和推理等前沿智能场景而设计。
	
虽然 Kimi K3 的整体表现仍落后于最强的闭源模型 Claude Fable 5 和 GPT-5.6 Sol，但它在我们的整套评测中展现出前沿水平的能力，并稳定超过了其他所有模型（详见图2、图3）。
	
Kimi K3 的发布只是开始，我们会继续挖掘 K3 模型的潜力，持续提升它在真实任务中的性能表现。
	
即日起，可通过 kimi.com、最新版 Kimi 手机App、最新版 Kimi Work 桌面客户端、Kimi Code 和 Kimi API，使用 Kimi K3 模型。当前默认思考强度为 max（极致），后续更新后会增加 low 和 high 两种模式。
…（后略）
```

**Notice · apology letter**
```
Title: 致用户：关于算力紧缺与会员暂停开放的说明
Tags: kimi

尊敬的 Kimi 用户：
	
自 Kimi K3发布以来，我们收获了远超预期的支持，但也面临始料未及的算力挑战。过去48 小时，用户请求量已大幅超出我们的预估，并且逼近现有集群的承载极限。
	
为了保障已有订阅用户的体验，我们决定即日起，暂停C端新用户订阅，将已有算力全部投入于服务已订阅用户，保障已订阅用户的全部权益不受影响。同时，我们已在全速推进算力扩容。随着新算力陆续到位，我们将逐步开放更多订阅名额直至全面恢复正常订阅。
	
对于后续新订阅用户，我们将拆分 Kimi主权益（包含Kimi Web, Kimi APP, Kimi Work）和 Kimi Code 权益，以方便更精准匹配算力，保障用户体验。
	
我们向满怀期待、却没能获得期待中体验的朋友郑重道歉，也对给予我们理解和包容的朋友深表谢意。
	
Kimi 团队
2026年7月19日
#kimi[话题]#
```

## Cross-check with the model profile

`data/voice/xhs_voice_profile.json` is Kimi K3's independent read of the same 100 notes (one call, 39k tokens). It agrees on the register split, 本K, stickers, tutorial-first, third-party boards with candor, `#kimi[话题]#` first, and exact Chinese units. Two rules above came from it: the 中英文 spacing rule and the 主播腔 ban. One disagreement: it reads titles as "almost never a question"; 8 of 100 titles are questions, so questions stay allowed but rare.

## Not covered by the sample

Comment-section replies, video scripts, and paid-partnership notes. The X guide (KIMI_VOICE.md) does not apply here beyond product names and number precision.
