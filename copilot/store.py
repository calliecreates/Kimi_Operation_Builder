"""Append-only run records and session state. JSONL on disk; path from COPILOT_DATA for a Railway volume."""
import json
import secrets
import threading
from datetime import datetime, timezone
from .llm import DATA

LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def new_id(n=6):
    return secrets.token_hex(n)


def append(kind, record):
    DATA.mkdir(parents=True, exist_ok=True)
    record = dict(record, kind=kind, ts=record.get('ts') or now())
    with LOCK:
        with open(DATA / f'{kind}.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')
    return record


def read(kind, limit=200):
    path = DATA / f'{kind}.jsonl'
    if not path.exists():
        return []
    with LOCK:
        lines = path.read_text(encoding='utf-8').splitlines()
    out = []
    for ln in lines[-limit:]:
        try:
            out.append(json.loads(ln))
        except ValueError:
            continue
    return out
