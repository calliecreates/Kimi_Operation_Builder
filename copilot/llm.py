"""Kimi API client: JSON output, timing, usage, raw-on-failure. No state on import."""
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('COPILOT_DATA', ROOT / 'copilot' / 'data'))
ALLOWED_BASES = {'https://api.moonshot.ai/v1', 'https://api.moonshot.cn/v1'}


def credentials():
    """Environment variables win; the repo-root .env fills gaps. Values never leave the server."""
    values = {}
    env_file = ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    for k in ('KIMI_API_KEY', 'MOONSHOT_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL', 'TWITTERAPI_IO_KEY'):
        if os.environ.get(k):
            values[k] = os.environ[k]
    return values


class LLMError(ValueError):
    pass


def _post(url, headers, payload, timeout):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode()[:300]
        except Exception:
            pass
        raise LLMError(f'Kimi API HTTP {e.code}: {body}') from None
    except (urllib.error.URLError, TimeoutError):
        raise LLMError('Kimi API 连接超时或网络不可用。') from None


def chat_json(system, user, *, max_tokens=6000, timeout=180, temperature=1.0, attempts=2):
    """Call Kimi and return (parsed JSON object, meta). `user` may be a dict (serialised) or str.

    Uses the API's JSON mode when available, falls back to fence-stripping. On a
    parse failure the raw reply is kept under data/ for diagnosis and the call is
    retried once.
    """
    c = credentials()
    key = c.get('KIMI_API_KEY') or c.get('MOONSHOT_API_KEY')
    if not key:
        raise LLMError('KIMI_API_KEY 未配置。')
    base = c.get('KIMI_BASE_URL', 'https://api.moonshot.ai/v1').rstrip('/')
    if base not in ALLOWED_BASES:
        raise LLMError('KIMI_BASE_URL 须为 Moonshot 官方平台地址。')
    model = c.get('KIMI_MODEL', 'kimi-k3')
    content = user if isinstance(user, str) else json.dumps(user, ensure_ascii=False)
    payload = {'model': model, 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': content}],
               'max_tokens': max_tokens, 'temperature': temperature, 'response_format': {'type': 'json_object'}}
    if model.startswith('kimi-k3'):
        payload['reasoning_effort'] = 'low'
    last = None
    for attempt in range(attempts):
        t0 = time.time()
        response = _post(base + '/chat/completions', {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, payload, timeout)
        latency = int((time.time() - t0) * 1000)
        try:
            text = response['choices'][0]['message']['content']
            clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip())
            obj = json.loads(clean)
            if not isinstance(obj, dict):
                raise ValueError('not an object')
            return obj, {'model': model, 'usage': response.get('usage', {}), 'latency_ms': latency, 'attempt': attempt + 1}
        except (KeyError, IndexError, TypeError, ValueError) as e:
            last = e
            try:
                DATA.mkdir(parents=True, exist_ok=True)
                (DATA / 'last_model_raw.txt').write_text(json.dumps(response, ensure_ascii=False)[:200000])
            except OSError:
                pass
    raise LLMError(f'模型输出不是合法 JSON（{last}）。原始输出已保存到 data/last_model_raw.txt。')
