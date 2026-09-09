"""Evidence and metrics engine. No network or persistence on import."""
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from statistics import median

UTC = timezone.utc
WEIGHTS = {'fit': 30, 'need': 25, 'signal': 20, 'angle': 15, 'effort': 10}
CAPABILITIES = {
    'Research': {'name': '带来源引用的研究', 'description': '研究、汇总和比较资料；需人工核对引用与事实完整性。', 'url': 'https://www.kimi.ai/features/'},
    'Slides': {'name': '可编辑演示文稿', 'description': '根据要求或资料生成幻灯片；需检查排版、来源准确性与可编辑性。', 'url': 'https://www.kimi.ai/features/'},
    'Spreadsheets': {'name': '电子表格分析与生成', 'description': '处理表格、公式和图表；需对照原始数据核算。', 'url': 'https://www.kimi.ai/features/'},
    'Documents': {'name': '文档生成与审阅', 'description': '起草和审阅文档；需检查事实与结构。', 'url': 'https://www.kimi.ai/features/'},
}
DEFAULT_CONFIG = {
    'owned': 'Kimi_Moonshot',
    'accounts': ['OpenAI', 'claudeai', 'GeminiApp', 'deepseek_ai', 'Zai_org'],
    'queries': ['("AI research" OR "deep research") lang:en', '("AI slides" OR "AI presentation") lang:en', '("AI spreadsheet" OR "Excel AI") lang:en', '("Kimi" OR "@Kimi_Moonshot") lang:en -from:Kimi_Moonshot'],
    'pages': 2,
    'window_days': 8,
    'replies': True,
    'collect_accounts': True,
    'query_type': 'Latest',
    'slice_days': 0,
    'weights': WEIGHTS.copy(),
}
# Dashboard and growth denominators are defined against this fixed window.
# Collection may reach further back; comparability must not silently follow it.
METRIC_WINDOW_DAYS = 8
QUERY_SINCE = re.compile(r'\bsince:(\d{4}-\d{2}-\d{2})')
QUERY_UNTIL = re.compile(r'\buntil:(\d{4}-\d{2}-\d{2})')
QUERY_SINCE_TS = re.compile(r'\bsince_time:(\d{9,12})')
QUERY_UNTIL_TS = re.compile(r'\buntil_time:(\d{9,12})')
# Engagement-bait and tutorial funnels survive keyword negation in the query
# itself, so they are removed locally before anything reaches the model.
PROMO = re.compile(
    r'\btutorial\b|\bfollow me\b|\bDM me\b|\bretweet\b|\bgiveaway\b|\bfree access\b'
    r'|\bmillion dollar\b|\b\d+ (?:tips|rules|prompts|ways|steps|hacks)\b|\bthread\b|🧵'
    # Listicles and money-making funnels rank well under 'Top' and survived the
    # query's own negation. Patterns are deliberately narrow: an earlier
    # '$N/month' rule also caught legitimate pricing and tool-comparison posts.
    r'|\b\d{1,2}\s+(?:best|top|free|essential|official)\b'
    r'|\bincome stream\b|\bcash flow\b|\bfaceless (?:youtube|channel)\b|\bmake money\b'
    r'|\bremote income\b|\bmonetizes? every\b'
    r'|\bthe most dangerous thing\b|\bgreatest opportunity in the history\b'
    r'|\bsave you (?:dozens|hundreds|thousands)\b|\banyone want it\b|➣', re.I)


def query_window(query, end, default_days):
    """Resolve one query's effective window.

    An explicit since:/until: written by the operator wins over the rolling
    default, so a long-range advanced search is no longer silently discarded.
    until:D follows X semantics and excludes D itself. Returns
    (start, stop, explicit).
    """
    text = query or ''
    start, stop = end - timedelta(days=default_days), end
    ts_since, ts_until = QUERY_SINCE_TS.search(text), QUERY_UNTIL_TS.search(text)
    if ts_since or ts_until:
        # A sliced collection addresses exact instants; date-only operators cannot.
        if ts_since:
            start = datetime.fromtimestamp(int(ts_since.group(1)), UTC)
        if ts_until:
            stop = datetime.fromtimestamp(int(ts_until.group(1)), UTC)
        return start, min(stop, end), True
    found_since = QUERY_SINCE.search(text)
    found_until = QUERY_UNTIL.search(text)
    for found, attr in ((found_since, 'start'), (found_until, 'stop')):
        if not found:
            continue
        try:
            parsed = datetime.strptime(found.group(1), '%Y-%m-%d').replace(tzinfo=UTC)
        except ValueError:
            continue
        if attr == 'start':
            start = parsed
        else:
            stop = parsed
    return start, min(stop, end), bool(found_since or found_until)
TOPICS = {
    'Research': (r'\bresearch\b|\bsources?\b|\bcitations?\b|\breports?\b', '把研究结果变成有据可查的决策简报', '需要整合信息、支持决策的知识工作者', '演示如何生成一份简洁的研究简报：有来源、有不确定性说明、有明确建议。'),
    'Slides': (r'\bslides?\b|\bpresentation\b|\bdeck\b|\bppt\b', '从原始资料到一份真正能用的演示文稿', '准备向团队或客户汇报的知识工作者', '用真实资料生成可编辑的演示文稿，展示叙事结构、来源引用与交付结果。'),
    'Spreadsheets': (r'\bspreadsheet\b|\bexcel\b|\bformulas?\b|\bcsv\b|\bpivot\b', '把电子表格变成业务决策，而不只是图表', '处理业务数据的分析师和运营人员', '分析真实表格、核对公式，并生成包含图表和行动建议的业务简报。'),
    'Documents': (r'\bdocument\b|\bpdf\b|\bproposal\b|\bwriting\b', '把零散信息整理成可交付的文档', '需要起草和整理文档的知识工作者', '把给定资料整理成结构清楚、保留来源的文档。'),
}

IDEA_FIELDS = ['title', 'problem', 'audience', 'angle',
               'observed_pattern', 'kimi_adaptation', 'social_format', 'risk', 'next_action']


def now_iso():
    return datetime.now(UTC).isoformat()


def parse_time(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        try:
            dt = datetime.strptime(str(value), '%a %b %d %H:%M:%S %z %Y')
        except ValueError:
            return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def number(value):
    if value is None or value == '' or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return int(result) if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError):
        return None


def topic_for(text):
    scores = [(len(re.findall(v[0], text.lower())), k) for k, v in TOPICS.items()]
    score, topic = max(scores)
    return topic if score else 'Other'


def classify_signal(text, brand=False):
    if brand:
        return 'Brand post'
    if re.search(r'\?|\bwish\b|\bneed\b|\bstruggl|\bwrong\b|\bhallucinat|\bfrustrat|\bcan.t\b|\btired\b|\bhours\b', text, re.I):
        return 'User need'
    if re.search(r'\bmade\b|\bbuilt\b|\bcreated\b|\busing\b|\btried\b', text, re.I):
        return 'Workflow example'
    return 'Conversation'


def engagement(t):
    return sum(t[k] or 0 for k in ['likes', 'replies', 'reposts', 'quotes'])


def engagement_rate(t):
    """Per-impression pull. Same definition as the performance dashboard, so an
    idea's social score and the account dashboard speak one language."""
    if not t.get('views') or t['views'] <= 0:
        return None
    return engagement(t)/t['views']*1000


def amplification(t):
    """Views per follower: how far a post travelled past its author's own
    audience. The closest available proxy for 'this topic would travel for us
    too', because Kimi will not inherit that author's followers."""
    if not t.get('followers') or t['followers'] <= 0 or not t.get('views'):
        return None
    return t['views']/t['followers']


def percentile(values):
    """Rank each value inside this corpus, 0..1. Ranking avoids absolute
    thresholds that nobody can defend; the cost is that scores compare posts
    within one collection only, never across collections."""
    ordered = sorted(v for v in values if v is not None)
    if not ordered:
        return {}
    return {v: (sum(1 for o in ordered if o < v)+sum(1 for o in ordered if o <= v))/(2*len(ordered))
            for v in set(ordered)}


def social_potential(posts, ranks):
    """Deterministic. Measures how the observed posts performed, NOT how a Kimi
    post would perform, and never a prediction of reach."""
    rates = [engagement_rate(t) for t in posts]
    amps = [amplification(t) for t in posts]
    rates = [r for r in rates if r is not None]
    amps = [a for a in amps if a is not None]
    if not rates and not amps:
        return None, {'rate_n': 0, 'amp_n': 0}
    parts, detail = [], {'rate_n': len(rates), 'amp_n': len(amps)}
    if rates:
        detail['engagement_rate'] = round(median(rates), 1)
        parts.append(ranks['rate'].get(median(rates), 0.5))
    if amps:
        detail['amplification'] = round(median(amps), 1)
        parts.append(ranks['amp'].get(median(amps), 0.5))
    return round(sum(parts)/len(parts)*100), detail


def evidence_strength(authors, buckets):
    """Deterministic breadth of the pattern. A one-off can still be good
    content, so this is reported beside social potential and never merged
    into it."""
    ladder = {0: 0, 1: 20, 2: 45, 3: 65, 4: 80}
    base = ladder.get(authors, 90)
    return min(100, base + (10 if buckets > 1 else 0))


def quadrant(social, strength):
    if social is None:
        return '数据不足'
    high_s, high_e = social >= 50, strength >= 50
    if high_s and high_e:
        return '优先 · 有共性且表现好'
    if high_s:
        return '值得一赌 · 表现好但证据薄'
    if high_e:
        return '稳但平淡 · 有共性但表现一般'
    return '低优先'


def near_duplicates(tweets, threshold=0.8):
    """Copy-pasted marketing text shares no tweet ID, so ID dedup misses it.
    Returns the IDs to drop, keeping the highest-engagement post per cluster."""
    def tokens(t):
        return frozenset(re.sub(r'https?://\S+', ' ', t['text'].lower()).split())
    kept, drop = [], set()
    for t in sorted(tweets, key=lambda x: -engagement(x)):
        tok = tokens(t)
        if not tok:
            continue
        for other, otok in kept:
            overlap = len(tok & otok)
            if overlap and overlap/len(tok | otok) >= threshold:
                drop.add(t['id'])
                break
        else:
            kept.append((t, tok))
    return drop


def mechanical_filter(tweets):
    """Free pre-model pass. Returns (kept, report) and never silently drops
    everything: the report is shown so the operator can audit each rule."""
    dup = near_duplicates(tweets)
    kept, dropped = [], {'near_duplicate': 0, 'promo': 0, 'repost': 0}
    for t in tweets:
        if t['is_repost']:
            dropped['repost'] += 1
        elif t['id'] in dup:
            dropped['near_duplicate'] += 1
        elif PROMO.search(t['text']):
            dropped['promo'] += 1
        else:
            # Brand posts are kept: a competitor launch or demo is legitimate
            # input for 'what is being demonstrated'. They stay labelled, so
            # they never count as an author or as user evidence.
            kept.append(t)
    return kept, {'input': len(tweets), 'kept': len(kept), 'dropped': dropped,
                  'brand_kept': sum(1 for t in kept if t['brand'])}


def normalize(raw, config, source='import'):
    author = raw.get('author') or {}
    if not isinstance(author, dict):
        author = {'name': str(author)}
    handle = str(author.get('userName') or raw.get('handle') or raw.get('username') or 'unknown').lstrip('@')
    tid = str(raw.get('id') or raw.get('tweetId') or '')
    if not tid:
        return None
    text = str(raw.get('text') or raw.get('content') or '')
    if not text.strip():
        return None
    brand = handle.lower() in {x.lower() for x in [config['owned']] + config['accounts']}
    counts = raw.get('counts') or {}
    def metric(key, legacy):
        return number(raw[key] if key in raw else counts.get(legacy))
    created = parse_time(raw.get('createdAt') or raw.get('created_at') or raw.get('date'))
    return {
        'id': tid, 'handle': handle, 'name': str(author.get('name') or raw.get('authorName') or handle),
        'text': text[:12000], 'created_at': created.isoformat() if created else None,
        'url': f'https://x.com/{handle}/status/{tid}' if tid.isdigit() and re.fullmatch(r'\w{1,30}', handle) else None,
        'likes': metric('likeCount', 'like'), 'replies': metric('replyCount', 'reply'),
        'reposts': metric('retweetCount', 'retweet'), 'quotes': metric('quoteCount', 'quote'),
        'views': metric('viewCount', 'view'), 'followers': number(author.get('followers')),
        'is_reply': bool(raw.get('isReply')), 'is_repost': bool(raw.get('retweeted_tweet')) or text.startswith('RT @'),
        'source': source, 'topic': topic_for(text), 'signal': classify_signal(text, brand),
        'brand': brand, 'sample': False,
    }


def sample_dataset(config):
    """All synthetic text/metrics are explicitly marked; none have X permalinks."""
    now = datetime.now(UTC)
    examples = {
        'Research': [
            'I need AI research that links every claim to an actual source. Checking citations takes longer than writing the brief.',
            'Anyone using deep research to compare vendors? I need a decision, not another 40-page report.',
            'Tried AI research for a market brief. The sources were useful but the recommendation ignored our constraints.',
            'I wish research assistants would separate what they found from what they inferred.',
            'Using an AI research workflow to turn several reports into a one-page briefing for my team.',
        ],
        'Slides': [
            'Can AI turn a report into slides without losing the important caveats? My team still rewrites every deck.',
            'I need an editable presentation, not a collection of images that look like slides.',
            'Created a presentation from a research report. Getting a coherent narrative is still the hard part.',
            'Which AI presentation tool lets me check where the numbers on a slide came from?',
        ],
        'Spreadsheets': [
            'I need an AI spreadsheet assistant that explains the formula instead of silently giving me a number.',
            'Anyone using AI to clean a messy CSV and build a weekly reporting spreadsheet?',
            'Tried an Excel AI workflow. It made a nice chart, but the totals were wrong.',
            'Using AI to find anomalies in a spreadsheet before our weekly business review.',
        ],
        'Documents': [
            'Can an AI document workflow preserve source references when turning meeting notes into a proposal?',
            'Built a document outline with AI, then spent an hour removing generic writing.',
        ],
    }
    tweets = []
    idx = 0
    for topic, texts in examples.items():
        for n, text in enumerate(texts):
            idx += 1
            hours = [2, 5, 11, 18, 43][n % 5]
            tweets.append({'id': f'sample-user-{idx}', 'handle': f'sample_reader_{idx:02}', 'name': f'Sample reader {idx:02}', 'text': text, 'created_at': (now-timedelta(hours=hours)).isoformat(), 'url': None, 'likes': 19+idx*7, 'replies': 3+idx, 'reposts': idx*2, 'quotes': 1, 'views': 2400+idx*590, 'followers': None, 'is_reply': False, 'is_repost': False, 'source': 'keyword', 'topic': topic, 'signal': classify_signal(text), 'brand': False, 'sample': True})
        for n in range(3):
            idx += 1
            tweets.append({**tweets[-1], 'id': f'sample-baseline-{idx}', 'handle': f'sample_reader_{idx:02}', 'name': f'Sample reader {idx:02}', 'text': texts[n % len(texts)], 'created_at': (now-timedelta(hours=55+n*40)).isoformat(), 'views': None if n == 0 else 1900+n*320, 'likes': 12+n*4})
    for a, handle in enumerate([config['owned']] + config['accounts']):
        for day in range(1, 8):
            topic = list(TOPICS)[(a+day) % 4]
            idx += 1
            tweets.append({'id': f'sample-brand-{idx}', 'handle': handle, 'name': handle, 'text': f'Illustrative {topic.lower()} post: a walkthrough of turning source material into a practical work output. This is sample copy, not an actual post from this account.', 'created_at': (now-timedelta(hours=day*23+a)).isoformat(), 'url': None, 'likes': 110+((day*37+a*89) % 700), 'replies': 12+day*3, 'reposts': 20+a*8+day, 'quotes': day, 'views': None if day==3 and a==2 else 12000+((day*7919+a*3761) % 44000), 'followers': None, 'is_reply': False, 'is_repost': False, 'source': 'account', 'topic': topic, 'signal': 'Brand post', 'brand': True, 'sample': True})
    return {'mode': 'sample', 'collected_at': now.isoformat(), 'tweets': tweets, 'coverage': [], 'complete': True, 'warnings': ['当前为演示样本。帖子、互动量与变化均为模拟，不代表 Kimi 或竞品的真实表现。'], 'method': '关键词规则 · 待人工复核', 'usage': {}}


def make_opportunities(dataset, config, model_groups=None):
    tweets = [t for t in dataset['tweets'] if not t['is_repost']]
    lookup = {t['id']: t for t in tweets}
    groups = []
    if model_groups is not None:
        for g in model_groups:
            ids = list(dict.fromkeys(str(i) for i in g.get('evidence_ids', [])))
            if not ids or any(i not in lookup for i in ids):
                continue
            topic = g.get('topic')
            if topic not in CAPABILITIES:
                continue
            if any(not isinstance(g.get(k), str) or not g[k].strip() for k in IDEA_FIELDS):
                continue
            groups.append((topic, [lookup[i] for i in ids], g))
    else:
        for topic in TOPICS:
            matches = [t for t in tweets if t['topic'] == topic]
            if matches:
                groups.append((topic, matches, {}))
    result = []
    anchor = parse_time(dataset['collected_at']) or datetime.now(UTC)
    # Percentiles are computed over the whole collection so one idea's social
    # score is a rank against its own batch, not an absolute claim.
    ranks = {'rate': percentile([engagement_rate(t) for t in tweets]),
             'amp': percentile([amplification(t) for t in tweets])}
    for topic, posts, g in groups:
        user_posts = [t for t in posts if not t['brand']]
        needs = [t for t in user_posts if t['signal'] == 'User need']
        authors = len({t['handle'].lower() for t in user_posts})
        recent = sum(1 for t in posts if parse_time(t['created_at']) and timedelta(0) <= anchor-parse_time(t['created_at']) < timedelta(days=1))
        previous = sum(1 for t in posts if parse_time(t['created_at']) and timedelta(days=1) <= anchor-parse_time(t['created_at']) < timedelta(days=METRIC_WINDOW_DAYS))
        # A collection window shorter than the baseline truncates the denominator
        # and would inflate the ratio. 'Top' is not a time-uniform sample, so a
        # per-day rate computed from it is meaningless. Both withhold the ratio.
        covers_baseline = int(config.get('window_days', METRIC_WINDOW_DAYS) or 0) >= METRIC_WINDOW_DAYS
        time_uniform = str(config.get('query_type', 'Latest')).lower() != 'top'
        growth = (round(recent/(previous/7), 1)
                  if previous >= 3 and dataset['complete'] and covers_baseline and time_uniform else None)
        buckets = len({t.get('bucket') for t in posts if t.get('bucket')}) or 1
        strength = evidence_strength(authors, buckets)
        social, social_detail = social_potential(user_posts or posts, ranks)
        scores = {'fit': 4, 'need': min(5, len(needs)+1) if needs else 1, 'signal': min(5, authors), 'angle': 3, 'effort': 4}
        rationale = {
            'fit': f'官方文档支持「{CAPABILITIES[topic]["name"]}」；这个具体用例仍需实测。',
            'need': f'{len(needs)} 条帖子匹配需求表达。需阅读原文，确认是否为真实用户问题。',
            'signal': f'该组包含 {authors} 位非品牌作者。衡量讨论广度，不等于需求已被验证。',
            'angle': '建议展示从输入到产出的完整过程。角度是否独特，仍需编辑判断。',
            'effort': '初步假设：一个提示词加一段录屏。实际制作成本需通过试做验证。',
        }
        title = g.get('title') or TOPICS[topic][1]
        text = lambda k, fallback, limit=1200: (g.get(k) or fallback)[:limit]
        identity = hashlib.sha256((title+'|'+ '|'.join(sorted(t['id'] for t in posts))).encode()).hexdigest()[:14]
        score = round(sum(scores[k]/5*config['weights'][k] for k in WEIGHTS))
        result.append({
            'id': identity, 'title': title[:180], 'topic': topic,
            'problem': (g.get('problem') or f'采集样本中出现了与 {topic.lower()} 相关的讨论。需要核实用户是否缺少可靠、可直接使用的输出。')[:1200],
            'audience': (g.get('audience') or TOPICS[topic][2])[:400],
            'angle': (g.get('angle') or TOPICS[topic][3])[:1200],
            'score': score, 'scores': scores, 'rationale': rationale,
            # The two axes stay separate on purpose: a one-off oddity can be
            # excellent content without representing a broad pattern.
            'social': social, 'social_detail': social_detail,
            'evidence_strength': strength, 'quadrant': quadrant(social, strength),
            'buckets': buckets,
            'observed_pattern': text('observed_pattern', f'采集样本中出现了与 {topic.lower()} 相关的 AI 创作行为。'),
            'kimi_adaptation': text('kimi_adaptation', TOPICS[topic][3]),
            'social_format': text('social_format', '前后对比演示：输入、提示词、产出,以及一处诚实的局限。', 400),
            'risk': text('risk', '可能与竞品内容雷同，除非产出质量或来源可核查性有明显差别。', 600),
            'next_action': text('next_action', '用一份真实材料跑一次这个流程，记录产出与失败点。', 400),
            'evidence_ids': [t['id'] for t in sorted(posts, key=lambda t: (t['brand'], t['signal']!='User need'))],
            'authors': authors, 'needs': len(needs), 'recent': recent, 'previous': previous, 'growth': growth,
            'confidence': '待人工复核' if model_groups is None else '模型解读 · 待人工复核',
            'fit': '待实测', 'action': '内容 + 工作流' if needs else '先核实用户需求',
            'why_pass': '热度可能来自品牌宣传，而非未满足的需求。先确认用户问题是否成立、工作流是否有价值且可复现。',
            'capability': CAPABILITIES[topic], 'method': dataset.get('method', '关键词规则 · 待人工复核'),
        })
    return sorted(result, key=lambda o: (-(o['social'] or 0), -o['evidence_strength'], -o['authors']))


def dashboard(dataset, config):
    anchor = parse_time(dataset['collected_at']) or datetime.now(UTC)
    eligible = [t for t in dataset['tweets'] if not t['is_reply'] and not t['is_repost'] and parse_time(t['created_at']) and timedelta(days=1) <= anchor-parse_time(t['created_at']) < timedelta(days=METRIC_WINDOW_DAYS)]
    rows = []
    topics = []
    for handle in [config['owned']] + config['accounts']:
        posts = [t for t in eligible if t['handle'].lower() == handle.lower()]
        views = [t['views'] for t in posts if t['views'] is not None]
        rates = []
        for t in posts:
            metrics = [t[k] for k in ['likes', 'replies', 'reposts', 'quotes']]
            if t['views'] and all(m is not None for m in metrics):
                rates.append(sum(metrics)/t['views']*1000)
        rows.append({'handle': handle, 'owned': handle.lower()==config['owned'].lower(), 'posts': len(posts), 'views_n': len(views), 'median_views': median(views) if views else None, 'interaction_rate': round(median(rates), 2) if rates else None, 'rate_n': len(rates)})
        for topic in TOPICS:
            subset = [t for t in posts if t['topic']==topic]
            values = [t['views'] for t in subset if t['views'] is not None]
            topics.append({'handle': handle, 'topic': topic, 'n': len(subset), 'views_n': len(values), 'median_views': median(values) if values else None})
    eligible = sorted([t for t in eligible if t['brand']], key=lambda t: t['views'] or -1, reverse=True)
    # The dashboard window stays pinned even when collection reaches further back,
    # so widening a search never silently changes what these numbers mean.
    return {'accounts': rows, 'topics': topics, 'posts': eligible, 'window': f'Posts aged 24 hours to {METRIC_WINDOW_DAYS} days at collection; public lifetime metrics. Fixed regardless of the collection window.', 'denominator': 'Median of per-post (likes + replies + reposts + quotes) / views × 1,000. Only complete metrics and positive views qualify.'}


def template_brief(opportunity):
    o = opportunity
    task = {'Research': 'Create a concise decision brief with traceable sources and explicit uncertainties.', 'Slides': 'Create an editable presentation from source material with a clear narrative and references.', 'Spreadsheets': 'Analyze the supplied spreadsheet, verify calculations, and explain a chart and actionable findings.', 'Documents': 'Create a structured document grounded in the supplied source material.'}.get(o['topic'], 'Produce a useful work artifact from the supplied material.')
    return {
        'title': o['title'],
        'hypothesis': f'针对{o["audience"]}，展示输入到输出的真实过程，是否比泛化功能介绍带来更多有效兴趣？自然流量对比仅作方向性参考。',
        'audience': o['audience'], 'angle': o['angle'],
        'prompt': f'{task}\n\nBefore starting, ask me for the source material and intended audience. Work only from the supplied material unless I explicitly request research. Identify missing inputs. Separate sourced facts from inference. Include source references where possible. Explain any limitations, and finish with a checklist I can use to verify the output.',
        'caption': f'What would make your next {o["topic"].lower()} task easier?\n\nWe’re testing a Kimi workflow for turning source material into a useful work output. Try the prompt, check the result, and tell us what still needs work.',
        'caption_alt': f'From source material to a useful {o["topic"].lower()} output.\n\nHere’s a Kimi workflow to try on your next task. Bring your own inputs and check the result before sharing it.',
        'demo': '1. 展示真实任务和输入。\n2. 在 Kimi 运行完整提示词。\n3. 检查输出与来源引用。\n4. 如实展示一个局限。\n5. 分享提示词并邀请用户尝试。',
        'metric': '接入产品分析后：经内容归因并完成演示任务的用户数。当前可记录：每千次浏览的公开互动，以及人工判断的有效回复。',
        'decision_rule': '先用真实输入验证工作流，再做一次小规模内容试验。与相似、同龄的自有账号帖子比较；更换选题重复验证后，再考虑扩大投入。',
        'claim_checks': '核对来源、输出可用性与复现性。未经测量，不宣称节省时间、准确率、竞品优势或转化提升。',
        'generation': '可编辑模板 · 未调用模型',
    }
