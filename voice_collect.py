"""Collect Kimi_Moonshot's recent original posts for brand-voice research.

Standalone: reads TWITTERAPI_IO_KEY from .env, writes data/voice/kimi_posts.json.
Never imports server state. Usage: python3 voice_collect.py [--limit 100]
"""
import argparse
import json
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from server import credentials, http_json  # noqa: E402
from engine import normalize, DEFAULT_CONFIG  # noqa: E402

HANDLE = 'Kimi_Moonshot'
OUT = Path(__file__).parent / 'data' / 'voice' / 'kimi_posts.json'


def fetch(limit):
    key = credentials().get('TWITTERAPI_IO_KEY')
    if not key:
        raise SystemExit('TWITTERAPI_IO_KEY missing in .env')
    tweets, cursor, pages = {}, '', 0
    while len(tweets) < limit and pages < 15:
        params = {'userName': HANDLE, 'includeReplies': 'false'}
        if cursor:
            params['cursor'] = cursor
        url = 'https://api.twitterapi.io/twitter/user/last_tweets?' + urllib.parse.urlencode(params)
        resp = http_json(url, {'X-API-Key': key}, timeout=30, attempts=2)
        pages += 1
        data = resp.get('data') if isinstance(resp.get('data'), dict) else resp
        raw_list = data.get('tweets') if isinstance(data, dict) else None
        if not isinstance(raw_list, list):
            raise SystemExit(f'Unexpected response shape: {json.dumps(resp)[:400]}')
        for raw in raw_list:
            item = normalize(raw, DEFAULT_CONFIG, 'account')
            if not item or item['is_repost'] or item['handle'].lower() != HANDLE.lower():
                continue
            # keep media/quote context that normalize() drops
            item['has_media'] = bool(raw.get('extendedEntities', {}).get('media')) if isinstance(raw.get('extendedEntities'), dict) else False
            item['is_quote'] = bool(raw.get('quoted_tweet'))
            item['quoted_text'] = (raw.get('quoted_tweet') or {}).get('text') if isinstance(raw.get('quoted_tweet'), dict) else None
            tweets.setdefault(item['id'], item)
        print(f'page {pages}: +{len(raw_list)} raw, {len(tweets)} kept', file=sys.stderr)
        if not resp.get('has_next_page'):
            break
        cursor = resp.get('next_cursor') or ''
        if not cursor:
            break
    return sorted(tweets.values(), key=lambda t: t['created_at'] or '', reverse=True)[:limit]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=100)
    args = ap.parse_args()
    posts = fetch(args.limit)
    OUT.write_text(json.dumps({'handle': HANDLE, 'collected_at': datetime.now(timezone.utc).isoformat(),
                               'count': len(posts), 'posts': posts}, ensure_ascii=False, indent=1))
    print(f'saved {len(posts)} posts to {OUT}')
