"""Voice guides as system capabilities: loading, post types, few-shot selection, lint rules.

The markdown guides stay the single source of truth. This module only reads them,
records their hash, and encodes the machine-checkable checklist items as code.
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDES = {'x': ROOT / 'KIMI_VOICE.md', 'xhs': ROOT / 'KIMI_VOICE_XHS.md'}
PLATFORM_LABEL = {'x': 'X', 'xhs': '小红书'}

# Post types per platform. `fewshot` names the bold headings in the guide's few-shot section.
TYPES = {
    'x': {
        'feature_update': {'label': '功能更新', 'fewshot': ['Feature update', 'Feature update, "Introducing" form']},
        'major_launch': {'label': '重大发布', 'fewshot': ['Major launch']},
        'tutorial': {'label': '教程', 'fewshot': ['Tutorial']},
        'partner': {'label': '合作伙伴', 'fewshot': ['Partner']},
        'ranking': {'label': '榜单', 'fewshot': ['Ranking with thanks']},
    },
    'xhs': {
        'feature_tutorial': {'label': '功能教程', 'register': 'casual', 'fewshot': ['Casual · feature tutorial', 'Casual · feature with benefit list']},
        'short_tutorial': {'label': '短教程（图片承载步骤）', 'register': 'casual', 'fewshot': ['Casual · short tutorial with images']},
        'major_launch': {'label': '重大发布', 'register': 'launch', 'fewshot': ['Launch · formal']},
        'changelog': {'label': '更新日志', 'register': 'casual', 'fewshot': ['Casual · feature with benefit list']},
        'campaign': {'label': '活动', 'register': 'casual', 'fewshot': ['Casual · short tutorial with images']},
        'notice': {'label': '声明致歉', 'register': 'notice', 'fewshot': ['Notice · apology letter']},
    },
}


def load(platform):
    """Return {'text': guide without the few-shot section, 'fewshots': {heading: block}, 'hash': sha256[:12]}."""
    raw = GUIDES[platform].read_text(encoding='utf-8')
    digest = hashlib.sha256(raw.encode()).hexdigest()[:12]
    start = raw.find('## Few-shot examples')
    end = min([i for i in (raw.find('## Cross-check'), raw.find('## Not covered')) if i > start] or [len(raw)])
    fewshots = {}
    if start >= 0:
        section = raw[start:end]
        for m in re.finditer(r'\*\*(.+?)\*\*\n```\n(.*?)\n```', section, re.S):
            fewshots[m.group(1).strip()] = m.group(2)
        raw = raw[:start] + raw[end:]
    return {'text': raw, 'fewshots': fewshots, 'hash': digest}


def fewshots_for(platform, post_type, guide=None):
    guide = guide or load(platform)
    names = TYPES[platform].get(post_type, {}).get('fewshot', [])
    return [(n, guide['fewshots'][n]) for n in names if n in guide['fewshots']]


# ---------------------------------------------------------------- lint rules
HYPE_EN = re.compile(r'\b(revolutionary|game[- ]chang\w*|blazing|unleash\w*|groundbreaking|cutting[- ]edge|next[- ]level|supercharge\w*|mind[- ]blowing|world[- ]class|best[- ]in[- ]class)\b', re.I)
PUTDOWN_EN = re.compile(r'\b(crush\w*|destroy\w*|obliterat\w*|blow\w* .{0,20}away|leaves? .{0,30}in the dust|nobody comes close)\b', re.I)
EMOJI = re.compile(r'[\U0001F300-\U0001FAFF☀-➿\U0001F1E6-\U0001F1FF]')
EMOJI_STRING = re.compile(r'(?:[\U0001F300-\U0001FAFF☀-➿]️?[ ]?){2,}')
URL = re.compile(r'https?://\S+|\b[\w.-]+\.(?:com|ai|cn|io|games|site)(?:/\S*)?', re.I)
PRODUCT_BAD = re.compile(r'Kimi-K\d|KimiWork|KimiCode|KimiSlides|kimi work|kimi code|Kimi k\d|KIMI', )
NUM = re.compile(r'\d[\d,.]*')
STICKER = re.compile(r'\[[^\]]{1,6}R\]')
ZHUBO = re.compile(r'家人们|宝宝们|震惊|吊打|全网最强|重磅')
CJK = r'[一-鿿]'


def _numbers(text):
    """Digit strings for grounding comparison; commas and Chinese 万/亿 normalised away."""
    out = set()
    for m in NUM.finditer(text or ''):
        s = m.group().replace(',', '').rstrip('.')
        if s:
            out.add(s)
    return out


def grounding(lines, facts_text):
    """lines: [{'text','kind','sources'}]. Returns (status, detail, flagged_lines)."""
    fact_ids = set(re.findall(r'F\d+', facts_text))
    fact_nums = _numbers(facts_text)
    flagged = []
    for ln in lines:
        text = ln.get('text', '') or ''
        if ln.get('kind', 'claim') != 'claim' or not text.strip() or '[待确认' in text:
            continue
        srcs = [s for s in ln.get('sources', []) if s in fact_ids]
        if not srcs:
            flagged.append({'text': text, 'why': '无来源：简介里没有支持这句的事实'})
            continue
        extra = [n for n in _numbers(text) if n not in fact_nums and not (re.fullmatch(r'\d{1,2}', n) and not re.search(re.escape(n) + r'\s?(?:[x×%倍]|tok)', text))]
        if extra:
            flagged.append({'text': text, 'why': f'数字 {", ".join(extra)} 不在简介中'})
    if flagged:
        return 'fail', f'{len(flagged)} 句超出简介', flagged
    return 'pass', '所有主张都能追溯到简介', []


def lint_x(cand, facts_text):
    text = cand.get('text', '')
    lines = cand.get('lines', [])
    first = next((l['text'] for l in lines if l.get('text', '').strip()), text.split('\n')[0] if text else '')
    checks = []
    def add(id_, label, status, detail=''):
        checks.append({'id': id_, 'label': label, 'status': status, 'detail': detail})
    ok_open = bool(re.match(r'^(Introducing |Meet |Kimi .+ is now (live|available)|.+ is now live in |We\'ve open-sourced|Build .+ with )', first))
    add('opener', '直陈式开头（is now live / Introducing / Meet）', 'pass' if ok_open else 'fail', first[:80])
    add('second_person', '有一句用第二人称说用户能做什么', 'pass' if re.search(r'\byou(r)?\b', text, re.I) else 'manual', '未检测到 you/your')
    nums = [m.group() for m in re.finditer(r'(?<![\w#])\d[\d,.]*(?!\s*(%|×|x\b|T\b|B\b|K\b|M\b|tok/s|tokens?|hours?|days?|steps?|files?|seats?|/ ?M|K\d|\.\d|[ap]\.?m\.?\b|️⃣))', text)]
    add('units', '每个数字都带单位或基线', 'manual' if nums else 'pass', ', '.join(nums[:5]))
    hype = HYPE_EN.findall(text)
    add('no_hype', '无 hype 形容词', 'fail' if hype else 'pass', ', '.join(hype))
    add('no_question', '无问句', 'fail' if '?' in text else 'pass')
    tags = re.findall(r'(?<!\w)#\w+', text)
    add('no_hashtag', '无话题标签', 'fail' if tags else 'pass', ' '.join(tags))
    add('no_thread', '无线程标记', 'fail' if ('🧵' in text or re.search(r'\b1/\d', text)) else 'pass')
    add('no_emoji_string', '无连续 emoji', 'fail' if EMOJI_STRING.search(text) else 'pass')
    add('single_exclaim', '感叹号至多一个', 'fail' if '!!' in text or text.count('!') > 1 else 'pass', f'{text.count("!")} 个')
    kinds = set(EMOJI.findall(text))
    add('emoji_kinds', 'emoji 种类不超过三种', 'fail' if len(kinds) > 3 else 'pass', ''.join(kinds))
    bad = PRODUCT_BAD.findall(text)
    add('product_names', '产品名拼写正确', 'fail' if bad else 'pass', ', '.join(bad))
    sota = [s for s in re.split(r'(?<=[.!\n])\s+', text) if re.search(r'\bSOTA\b|#1\b|number one', s, re.I) and not re.search(r'open', s, re.I)]
    add('sota_scoped', 'SOTA / #1 限定为 open-source', 'fail' if sota else 'pass', sota[0][:80] if sota else '')
    pd = PUTDOWN_EN.findall(text)
    add('no_putdown', '不贬低竞品', 'fail' if pd else 'pass', ', '.join(map(str, pd)))
    links = [l for l in text.split('\n') if URL.search(l)]
    unlabeled = [l for l in links if not l.strip().startswith('🔗') and not URL.search(l.strip()).start() == 0 and not l.strip().endswith(URL.search(l).group())]
    add('links', '链接单独成行并带 🔗 标签', 'pass' if not links else ('manual' if unlabeled else 'pass'), unlabeled[0][:60] if unlabeled else '')
    status, detail, flagged = grounding(lines, facts_text)
    add('grounded', '没有超出简介的主张', status, detail)
    placeholders = re.findall(r'\[待确认[：:][^\]]*\]', text)
    return {'checks': checks, 'flagged': flagged, 'placeholders': placeholders, 'summary': _summary(checks)}


def lint_xhs(cand, facts_text, register):
    title = cand.get('title', '') or ''
    body = cand.get('body', '') or ''
    tags = cand.get('tags', []) or []
    lines = cand.get('lines', [])
    whole = title + '\n' + body
    checks = []
    def add(id_, label, status, detail=''):
        checks.append({'id': id_, 'label': label, 'status': status, 'detail': detail})
    tl = len(title)
    temoji = EMOJI.findall(title)
    emoji_ok = len(temoji) <= 1 and (not temoji or title.rstrip().endswith(temoji[-1]))
    add('title', '标题 15–30 字（上限 34），至多一个 emoji 且在末尾', 'pass' if 15 <= tl <= 30 and emoji_ok else ('manual' if 12 <= tl <= 34 and emoji_ok else 'fail'), f'{tl} 字，{len(temoji)} emoji')
    first = next((l['text'] for l in lines if l.get('text', '').strip()), body.split('\n')[0] if body else '')
    add('first_sentence', '第一句说清楚你现在能做什么', 'manual', first[:60])
    if register == 'casual':
        has_steps = bool(re.search(r'[1-9]️⃣', body))
        plain_steps = bool(re.search(r'(^|\n)\s*[1-9][.．、]', body))
        add('steps', '步骤用 1️⃣2️⃣3️⃣，UI 名称用「」', 'pass' if has_steps and '「' in body else ('manual' if has_steps or plain_steps else 'fail'), ('步骤未用 1️⃣' if not has_steps else '步骤中没有「」，若是 UI 操作请补上') if not (has_steps and '「' in body) else '')
        add('image_ref', '至少一处图片引用（见图 / p2 / 附件）', 'pass' if re.search(r'见图|图\s?\d|p\d|附件|上方|截图|视频', body) else 'fail')
        persona = bool(re.search(r'本K|(?<![A-Za-z])K(?=[决知祝推想会已在也先才])|[（(]K', whole)) or bool(STICKER.search(body))
        add('register', '日常营业：本K 或贴纸至少一处', 'pass' if persona else 'fail')
        add('ask', '结尾有互动（许愿 / 带话题 / 翻牌 / 期待）', 'pass' if re.search(r'许愿|评论区|带话题|翻牌|期待|欢迎|一起|试试', body[-160:]) else 'fail')
    else:
        stickers = STICKER.findall(body)
        add('register', f'{"正式发布" if register == "launch" else "声明致歉"}：我们 / 无贴纸', 'pass' if not stickers and not re.search(r'本K', whole) and '我们' in body else 'fail', ', '.join(stickers))
        add('image_ref', '图片引用（可选）', 'pass' if re.search(r'见图|图\s?\d|p\d|附件', body) else 'manual')
    nums = re.findall(r'(?<![\w图pP#])\d[\d,.]*(?!\s*(?:万亿|万|亿|元|倍|Token/s|tok/s|%|个|页|步|秒|分钟|小时|点|条|张|份|台|席|天|款|次|字|K\d|\.\d|️⃣|[、.．]))', body)
    add('units', '数字带中文单位，价格用元', 'manual' if nums else 'pass', ', '.join(nums[:5]))
    spacing = re.findall(rf'{CJK}[A-Za-z0-9]|[A-Za-z0-9]{CJK}', re.sub(r'\[[^\]]{1,6}R\]|图\s?\d+|[pP]\d+|K\d(?:\.\d)?|本K|(?<![A-Za-z])K(?=[决知祝推想会已在也先才都])', '', body))
    add('spacing', '中英文与数字之间加空格', 'manual' if spacing else 'pass', f'{len(spacing)} 处，如 {" ".join(spacing[:4])}' if spacing else '')
    tag_ok = bool(tags) and tags[0].lower() == 'kimi' and 2 <= len(tags) <= 5
    tail_ok = body.rstrip().endswith('[话题]#') and '#kimi[话题]#' in body
    add('tags', '#kimi[话题]# 在前，2–5 个，正文末尾', 'pass' if tag_ok and tail_ok else 'fail', f'{len(tags)} 个 tag，首个 {tags[0] if tags else "无"}')
    zb = ZHUBO.findall(whole)
    add('no_zhubo', '无主播腔（家人们 / 震惊 / 吊打）', 'fail' if zb else 'pass', ', '.join(zb))
    comp = re.findall(r'Claude|GPT|Gemini|DeepSeek|OpenAI|竞品', whole)
    add('comparison', '提到竞品时点名榜单并承认差距', 'manual' if comp else 'pass', ', '.join(sorted(set(comp))))
    status, detail, flagged = grounding(lines, facts_text)
    add('grounded', '没有超出简介的主张', status, detail)
    placeholders = re.findall(r'\[待确认[：:][^\]]*\]', whole)
    return {'checks': checks, 'flagged': flagged, 'placeholders': placeholders, 'summary': _summary(checks)}


def _summary(checks):
    n = len(checks)
    return {'total': n, 'pass': sum(c['status'] == 'pass' for c in checks), 'fail': sum(c['status'] == 'fail' for c in checks), 'manual': sum(c['status'] == 'manual' for c in checks)}
