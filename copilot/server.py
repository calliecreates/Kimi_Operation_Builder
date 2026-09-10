#!/usr/bin/env python3
"""Kimi Content Copilot HTTP server. Stdlib only. Railway-ready: PORT, 0.0.0.0, COPILOT_DATA volume.

Long pipelines run as background jobs; the client polls. No auth by owner's decision; a per-IP
rate limit keeps a public URL from draining the API budget.
"""
import difflib
import json
import os
import threading
import time
import urllib.parse
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import caption, comments, voice
from .llm import LLMError, credentials
from .store import append, new_id, now, read


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
LOCK = threading.RLock()
JOBS = {}        # job_id -> {'status','kind','result','error','started'}
RUNS = {}        # run_id -> full caption run (needed for refine); comment runs too
RATE = defaultdict(deque)
RATE_LIMIT = (int(os.environ.get('RATE_PER_MIN', '12')), int(os.environ.get('RATE_PER_DAY', '150')))
MAX_JOBS_RUNNING = 4

import json as _json

POSTS_FILE = ROOT.parent / 'data' / 'voice' / 'xhs_comments.json'
NOTES_FILE = ROOT.parent / 'data' / 'voice' / 'xhs_posts.json'
# the export named after the 金融投研 note actually holds the Harvey legal note's comments
POST_ALIAS = {'进阶教程第二期：金融投研来试试Kimi Work': 'Harvey发布：基于Kimi K3的首个法律行业模型'}


def load_posts():
    """Real Xiaohongshu posts with their comment threads, for the guided flow."""
    if not POSTS_FILE.exists():
        return []
    data = _json.loads(POSTS_FILE.read_text(encoding='utf-8'))
    notes = {n['title']: n for n in _json.loads(NOTES_FILE.read_text(encoding='utf-8'))['posts']} if NOTES_FILE.exists() else {}
    posts = {}
    for r in data['rows']:
        title = POST_ALIAS.get(r['post'], r['post'])
        p = posts.setdefault(title, {'id': str(len(posts) + 1), 'title': title, 'rows': [], 'replied': 0})
        if r['type'] == '主评论' and not r['is_kimi']:
            p['rows'].append({'id': f"c{len(p['rows'])+1}", 'author': r['nick'], 'text': r['text'], 'likes': r['likes'], 'kimi_replied': r['kimi_replied'], 'time': r['time']})
            p['replied'] += bool(r['kimi_replied'])
    out = []
    for p in posts.values():
        note = notes.get(p['title'])
        p['date'] = (note or {}).get('date', '')[:10] or (p['rows'][0]['time'][:10] if p['rows'] else '')
        p['facts'] = f"标题：{p['title']}\n{note['body']}" if note else p['title']
        p['likes'] = (note or {}).get('likes')
        p['count'] = len(p['rows'])
        out.append(p)
    return out


def rate_ok(ip):
    t = time.time()
    q = RATE[ip]
    while q and t - q[0] > 86400:
        q.popleft()
    per_min = sum(1 for x in q if t - x < 60)
    if per_min >= RATE_LIMIT[0] or len(q) >= RATE_LIMIT[1]:
        return False
    q.append(t)
    return True


def start_job(kind, fn):
    with LOCK:
        if sum(j['status'] == 'running' for j in JOBS.values()) >= MAX_JOBS_RUNNING:
            raise ValueError('服务繁忙，请稍后再试。')
        job_id = new_id(5)
        JOBS[job_id] = {'id': job_id, 'kind': kind, 'status': 'running', 'started': now(), 'result': None, 'error': None, 'stages': []}

    def progress(stage, status, detail=''):
        with LOCK:
            stages = JOBS[job_id]['stages']
            for st in stages:
                if st['stage'] == stage:
                    st.update(status=status, detail=detail or st['detail'], t=time.time())
                    break
            else:
                stages.append({'stage': stage, 'status': status, 'detail': detail, 't': time.time()})

    def worker():
        try:
            result = fn(progress)
            with LOCK:
                RUNS[result['id']] = result
                JOBS[job_id].update(status='done', result=result)
        except (LLMError, ValueError) as e:
            with LOCK:
                JOBS[job_id].update(status='error', error=str(e))
        except Exception as e:  # never leak a traceback to the client
            with LOCK:
                JOBS[job_id].update(status='error', error='内部错误：' + type(e).__name__)
    threading.Thread(target=worker, daemon=True).start()
    return job_id


def public_state():
    c = credentials()
    decisions = read('decisions', 1000)
    return {
        'model': c.get('KIMI_MODEL', 'kimi-k3'), 'kimi_configured': bool(c.get('KIMI_API_KEY') or c.get('MOONSHOT_API_KEY')),
        'voice': {p: {'hash': voice.load(p)['hash'], 'types': [{'type': k, 'label': v['label'], 'register': v.get('register')} for k, v in voice.TYPES[p].items()]} for p in ('x', 'xhs')},
        'categories': {k: {'n': v['n'], 'label': v['label'], 'action': v['action']} for k, v in comments.CATEGORIES.items()},
        'prompt_versions': {'caption': caption.PROMPT_VERSION, 'comments': comments.PROMPT_VERSION},
        'metrics': metrics(decisions),
        'recent': {'captions': [{'id': r['id'], 'ts': r.get('finished'), 'topic': (r.get('brief') or {}).get('topic', ''), 'platforms': list((r.get('results') or {}).keys())} for r in read('caption_runs', 20)[::-1]],
                   'comments': [{'id': r['id'], 'ts': r.get('finished'), 'summary': r.get('summary')} for r in read('comment_runs', 20)[::-1] if r.get('session') != 'eval']},
    }


def metrics(decisions):
    out = {}
    for kind in ('caption', 'comment'):
        ds = [d for d in decisions if d.get('kind') == kind]
        acted = [d for d in ds if d['action'] in ('adopt', 'edit')]
        out[kind] = {'decisions': len(ds), 'adopted': sum(d['action'] == 'adopt' for d in ds), 'edited': sum(d['action'] == 'edit' for d in ds),
                     'skipped': sum(d['action'] == 'skip' for d in ds), 'escalated': sum(d['action'] == 'escalate' for d in ds),
                     'adoption_rate': round(len(acted) / len(ds), 2) if ds else None,
                     'median_edit_ratio': (sorted(d.get('edit_ratio', 0) for d in acted)[len(acted) // 2] if acted else None)}
    return out


def find_run(run_id):
    with LOCK:
        if run_id in RUNS:
            return RUNS[run_id]
    for kind in ('caption_runs', 'comment_runs'):
        for r in read(kind, 500):
            if r.get('id') == run_id:
                return r
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def ip(self):
        return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()

    def send_json(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/health':
            return self.send_json(200, {'ok': True, 'time': now()})
        if path == '/api/state':
            return self.send_json(200, public_state())
        if path.startswith('/api/job/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            return self.send_json(200 if job else 404, job or {'error': '任务不存在'})
        if path == '/api/posts':
            return self.send_json(200, {'posts': [{k: v for k, v in p.items() if k not in ('rows', 'facts')} for p in load_posts()]})
        if path.startswith('/api/voice/'):
            name = path.rsplit('/', 1)[-1]
            files = {'x': 'KIMI_VOICE.md', 'xhs': 'KIMI_VOICE_XHS.md', 'reply': 'KIMI_VOICE_REPLY.md', 'policy': 'COMMENT_POLICY.md'}
            if name not in files:
                return self.send_json(404, {'error': 'Not found'})
            return self.send_json(200, {'name': name, 'markdown': (ROOT.parent / files[name]).read_text(encoding='utf-8')})
        if path.startswith('/api/run/'):
            run = find_run(path.rsplit('/', 1)[-1])
            return self.send_json(200 if run else 404, run or {'error': '记录不存在'})
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/styles.css': ('styles.css', 'text/css')}
        if path not in files:
            return self.send_json(404, {'error': 'Not found'})
        name, mime = files[path]
        f = STATIC / name
        if not f.exists():
            return self.send_json(404, {'error': 'UI 尚未构建'})
        content = f.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '')
        if origin and urllib.parse.urlsplit(origin).netloc != host:
            return self.send_json(403, {'error': '不允许跨站请求。'})
        if not rate_ok(self.ip()):
            return self.send_json(429, {'error': '请求过于频繁，请稍后再试。'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2000000:
                raise ValueError('请求为空或超过 2 MB。')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('请求须为 JSON 对象。')
            self.send_json(200, self.mutate(urllib.parse.urlsplit(self.path).path, body))
        except (ValueError, KeyError, TypeError) as e:
            self.send_json(400, {'error': str(e) if isinstance(e, ValueError) else '请求字段格式错误。'})
        except Exception as e:
            self.send_json(500, {'error': '内部错误：' + type(e).__name__})

    def mutate(self, path, body):
        session = str(body.get('session') or '')[:64]
        if path == '/api/caption/run':
            material = str(body.get('material', '')).strip()
            if len(material) < 10:
                raise ValueError('请粘贴至少一句素材。')
            if len(material) > 8000:
                raise ValueError('素材过长，请控制在 8000 字以内。')
            platforms = [p for p in body.get('platforms', ['x', 'xhs']) if p in ('x', 'xhs')] or ['x', 'xhs']
            types = {p: t for p, t in (body.get('types') or {}).items() if p in voice.TYPES and t in voice.TYPES[p]}
            n = max(1, min(3, int(body.get('n', 2))))
            return {'job': start_job('caption', lambda progress: caption.run(material, platforms, types, n, session, progress))}
        if path == '/api/caption/brief':
            material = str(body.get('material', '')).strip()
            if len(material) < 10:
                raise ValueError('请粘贴至少一句素材。')
            if len(material) > 8000:
                raise ValueError('素材过长，请控制在 8000 字以内。')
            platforms = [p for p in body.get('platforms', ['x', 'xhs']) if p in ('x', 'xhs')] or ['x', 'xhs']
            return {'job': start_job('brief', lambda progress: caption.brief_only(material, platforms, session, progress))}
        if path == '/api/caption/generate':
            brief = body.get('brief'); suggestions = body.get('suggestions') or {}
            if not isinstance(brief, dict) or not isinstance(brief.get('facts'), list) or not brief['facts']:
                raise ValueError('简介缺失，请重新提取。')
            brief = {k: brief.get(k) for k in ('product', 'topic', 'facts', 'links', 'date', 'audience', 'unknowns', 'material')}
            brief['facts'] = [{'id': str(f.get('id', '')), 'text': str(f.get('text', ''))[:600]} for f in brief['facts'] if isinstance(f, dict)][:20]
            brief['unknowns'] = [str(u)[:200] for u in (brief.get('unknowns') or [])][:12]
            brief['material'] = str(brief.get('material') or '')[:8000]
            platforms = [p for p in body.get('platforms', ['x', 'xhs']) if p in ('x', 'xhs')] or ['x', 'xhs']
            types = {p: t for p, t in (body.get('types') or {}).items() if p in voice.TYPES and t in voice.TYPES[p]}
            n = max(1, min(3, int(body.get('n', 2))))
            return {'job': start_job('caption', lambda progress: caption.generate_all(brief, suggestions, types, platforms, n, session, progress))}
        if path == '/api/caption/refine':
            run = find_run(str(body.get('run_id', '')))
            if not run or 'brief' not in run or 'material' not in run['brief']:
                raise ValueError('该记录已不在内存中，请重新生成。')
            platform, cid, instr = body.get('platform'), str(body.get('candidate_id', '')), str(body.get('instruction', '')).strip()[:1000]
            if platform not in run['results'] or not instr:
                raise ValueError('缺少平台、候选或修改说明。')
            return {'job': start_job('refine', lambda progress: (progress('refine', 'start', '按说明生成修改版'), dict(caption.refine(run, platform, cid, instr, session), id=new_id(), run_id=run['id']))[1])}
        if path == '/api/comments/run':
            if body.get('post_id'):
                post = next((p for p in load_posts() if p['id'] == str(body['post_id'])), None)
                if not post:
                    raise ValueError('帖子不存在。')
                rows = [dict(r) for r in post['rows']]
                return {'job': start_job('comments', lambda progress: dict(comments.run('', post['facts'], session, rows=rows, progress=progress), post={'id': post['id'], 'title': post['title']}))}
            text = str(body.get('text', '')).strip()
            if not text:
                raise ValueError('请粘贴评论。')
            if len(text) > 60000:
                raise ValueError('评论过多，请分批粘贴（一次不超过 300 条）。')
            facts = str(body.get('facts', ''))[:6000]
            return {'job': start_job('comments', lambda progress: comments.run(text, facts, session, progress=progress))}
        if path == '/api/decision':
            kind = body.get('kind')
            action = body.get('action')
            if kind not in ('caption', 'comment') or action not in ('adopt', 'edit', 'skip', 'escalate'):
                raise ValueError('未知操作。')
            original = str(body.get('original', ''))
            final = str(body.get('final', original))
            ratio = round(1 - difflib.SequenceMatcher(None, original, final).ratio(), 3) if original else 0
            rec = append('decisions', {'kind': kind, 'run_id': str(body.get('run_id', '')), 'item_id': str(body.get('item_id', '')), 'platform': body.get('platform'),
                                       'category': body.get('category'), 'action': action, 'edit_ratio': ratio if action == 'edit' else 0,
                                       'final_chars': len(final), 'session': session})
            return {'ok': True, 'decision': rec, 'metrics': metrics(read('decisions', 1000))}
        raise ValueError('未知接口。')


def main():
    port = int(os.environ.get('PORT', '3488'))
    host = os.environ.get('HOST', '0.0.0.0')
    print(f'Kimi Content Copilot → http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
