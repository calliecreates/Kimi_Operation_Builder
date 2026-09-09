"""Replay the real Xiaohongshu comment exports through the pipeline and compare with Kimi's actual replies."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from copilot import comments

data = json.load(open('data/voice/xhs_comments.json'))
notes = {p['title']: p for p in json.load(open('data/voice/xhs_posts.json'))['posts']}
by_post = {}
for r in data['rows']:
    if r['type'] == '主评论' and not r['is_kimi']:
        by_post.setdefault(r['post'], []).append(r)
report = {'posts': [], 'rows': []}
tp = fp = fn = 0
for title, rows in by_post.items():
    note = notes.get(title) or next((p for t, p in notes.items() if t[:8] == title[:8]), None)
    facts = f"标题：{title}\n{note['body']}" if note else title
    inp = [{'id': f'c{i+1}', 'author': r['nick'], 'text': r['text'], 'likes': r['likes'], 'kimi_replied': r['kimi_replied']} for i, r in enumerate(rows)]
    out = comments.run('', facts=facts, rows=inp, session='eval')
    for r in out['rows']:
        pred = r['action'] in ('draft', 'route', 'apply')
        gold = r['kimi_replied']
        tp += pred and gold; fp += pred and not gold; fn += (not pred) and gold
        report['rows'].append({'post': title[:12], 'text': r['text'][:50], 'likes': r['likes'], 'category': r['category'], 'action': r['action'], 'flags': r.get('flags'), 'kimi_replied': gold, 'draft': (r.get('draft') or {}).get('reply'), 'reason': r['reason']})
    report['posts'].append({'post': title, 'n': len(rows), 'summary': out['summary'], 'usage': out['usage']})
    print(f"{title[:20]:22} n={len(rows):3} actions={out['summary']['actions']}", flush=True)
report['metrics'] = {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(tp / max(1, tp + fp), 2), 'recall': round(tp / max(1, tp + fn), 2)}
json.dump(report, open('copilot/data/eval_comments_report.json', 'w'), ensure_ascii=False, indent=1)
print('METRICS', report['metrics'])
