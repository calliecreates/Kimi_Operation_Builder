/* Kimi Content Copilot UI. Preact + htm, no build. Chat is the main tab. */
const { h, render } = preact;
const { useState, useEffect, useRef } = preactHooks;
const html = htm.bind(h);
const $store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const SESSION = $store.get('cc.session') || (() => { const s = Math.random().toString(36).slice(2, 10); $store.set('cc.session', s); return s; })();
const PLAT = { x: 'X', xhs: '小红书' };

async function api(path, data) {
  const r = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, session: SESSION }) } : {});
  const j = await r.json().catch(() => ({ error: '服务无响应' }));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function copy(text, toast) { navigator.clipboard?.writeText(text).then(() => toast('已复制'), () => toast('复制失败', true)); }
function mdToHtml(md) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = md.split('\n'); let out = [], i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) { let j = i + 1, buf = []; while (j < lines.length && !lines[j].startsWith('```')) buf.push(lines[j++]); out.push(`<pre>${esc(buf.join('\n'))}</pre>`); i = j + 1; continue; }
    if (l.startsWith('|')) { let j = i, rows = []; while (j < lines.length && lines[j].startsWith('|')) rows.push(lines[j++]); const cells = r => r.split('|').slice(1, -1).map(c => inline(c.trim())); const body = rows.filter(r => !/^\|\s*-/.test(r)); out.push('<table>' + body.map((r, k) => `<tr>${cells(r).map(c => k ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('') + '</table>'); i = j; continue; }
    if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`); else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`); else if (/^### /.test(l)) out.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (/^\s*[-*] /.test(l)) { let j = i, items = []; while (j < lines.length && /^\s*[-*] /.test(lines[j])) items.push(lines[j++].replace(/^\s*[-*] /, '')); out.push('<ul>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); i = j; continue; }
    else if (/^\s*\d+\. /.test(l)) { let j = i, items = []; while (j < lines.length && /^\s*\d+\. /.test(lines[j])) items.push(lines[j++].replace(/^\s*\d+\. /, '')); out.push('<ol>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ol>'); i = j; continue; }
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
  return out.join('\n');
}

function Toast({ msg }) { return msg ? html`<div class="toast">${msg.text}</div>` : null; }

/* ---------- caption cards ---------- */
function Checklist({ lint }) {
  const [open, setOpen] = useState(false);
  const s = lint.summary; const bad = lint.checks.filter(c => c.status !== 'pass');
  const tone = s.fail ? 'red' : s.manual ? 'amber' : 'green';
  return html`<div>
    <div class="head"><span class=${'tag ' + tone}>checklist ${s.pass}/${s.total} 通过${s.manual ? ` · ${s.manual} 项待人工` : ''}${s.fail ? ` · ${s.fail} 项未通过` : ''}</span>
      ${lint.placeholders.length ? html`<span class="tag amber">${lint.placeholders.length} 处 [待确认]</span>` : html`<span class="tag">无占位符</span>`}
      ${bad.length ? html`<button class="btn ghost" onClick=${() => setOpen(!open)}>${open ? '收起' : '查看'}</button>` : null}</div>
    ${open ? html`<div class="checks">${bad.map(c => html`<div class=${c.status}>${c.status === 'fail' ? '✕' : '○'} ${c.label}${c.detail ? ` · ${c.detail}` : ''}</div>`)}
      ${lint.flagged.map(f => html`<div class="fail">✕ 超出简介：「${f.text.slice(0, 60)}」 ${f.why}</div>`)}</div>` : null}
  </div>`;
}

function Candidate({ platform, cand, runId, onRefine, toast, decided, setDecided }) {
  const [text, setText] = useState(cand.text);
  const [instr, setInstr] = useState(''); const [asking, setAsking] = useState(false);
  const state = decided[cand.id];
  const decide = async (action) => {
    await api('/api/decision', { kind: 'caption', run_id: runId, item_id: cand.id, platform, action, original: cand.text, final: text });
    setDecided({ ...decided, [cand.id]: action }); if (action !== 'skip') copy(text, toast); else toast('已跳过');
  };
  const edited = text !== cand.text;
  return html`<div class="card">
    <div class="head"><span class="tag blue">${PLAT[platform]} · ${cand.template}</span>${cand.register ? html`<span class="tag">${{ casual: '日常营业', launch: '正式发布', notice: '声明' }[cand.register] || cand.register}</span>` : null}<span class="sp"></span><span class="small">${cand.chars} 字符</span></div>
    ${cand.angle ? html`<div class="angle">${cand.angle}</div>` : null}
    <textarea value=${text} onInput=${e => setText(e.target.value)} style=${{ minHeight: Math.min(420, 60 + text.split('\n').length * 22) + 'px' }}></textarea>
    ${platform === 'xhs' && cand.image_plan?.length ? html`<div class="small">配图：${Array.isArray(cand.image_plan) ? cand.image_plan.join('；') : cand.image_plan}</div>` : null}
    ${platform === 'x' && cand.image_plan ? html`<div class="small">配图：${cand.image_plan}</div>` : null}
    <${Checklist} lint=${cand.lint} />
    ${asking ? html`<div><textarea placeholder="怎么改？例如：压缩一半，结尾再软一点" value=${instr} onInput=${e => setInstr(e.target.value)} style="min-height:56px"></textarea>
      <div class="actions"><button class="btn dark" disabled=${!instr.trim()} onClick=${() => { onRefine(platform, cand.id, instr); setAsking(false); setInstr(''); }}>生成修改版</button><button class="btn ghost" onClick=${() => setAsking(false)}>取消</button></div></div>` : null}
    <div class="actions">
      ${state ? html`<span class="tag green">${{ adopt: '已采纳', edit: '已编辑采纳', skip: '已跳过' }[state]}</span>` : html`
        <button class="btn dark" onClick=${() => decide(edited ? 'edit' : 'adopt')}>${edited ? '编辑后采纳' : '采纳并复制'}</button>
        <button class="btn" onClick=${() => setAsking(true)}>以此为基础改</button>
        <button class="btn ghost" onClick=${() => decide('skip')}>跳过</button>`}
      <button class="btn ghost" onClick=${() => copy(text, toast)}>复制</button>
    </div></div>`;
}

function CaptionResult({ run, refines, onRefine, onRetype, toast, decided, setDecided }) {
  const b = run.brief;
  return html`<div>
    <div class="bubble">简介已提取：${b.facts.length} 条事实${b.unknowns?.length ? `，${b.unknowns.length} 项未知（会写成 [待确认]）` : ''}${b.product ? ` · 产品：${b.product}` : ''}</div>
    ${Object.entries(run.results).map(([p, r]) => html`<div>
      <div class="section-title">${PLAT[p]} · 类型 <span class="small">${run.suggestions[p]?.reason || ''}</span></div>
      <div class="chips">${run.suggestions[p].options.map(o => html`<button class=${'chip' + (o.type === r.type ? ' on' : '')} onClick=${() => o.type !== r.type && onRetype(p, o.type)}>${o.label}</button>`)}</div>
      <div class="grid">${r.candidates.map(c => html`<${Candidate} key=${c.id} platform=${p} cand=${c} runId=${run.id} onRefine=${onRefine} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}
        ${(refines || []).filter(x => x.platform === p).map(x => x.candidates.map(c => html`<${Candidate} key=${c.id} platform=${p} cand=${{ ...c, template: c.template + ' · 修改版' }} runId=${run.id} onRefine=${onRefine} toast=${toast} decided=${decided} setDecided=${setDecided} />`))}
      </div></div>`)}
  </div>`;
}

/* ---------- comment cards ---------- */
const ACT = { draft: ['起草', 'blue'], route: ['转客服', 'blue'], apply: ['套用相似', 'blue'], optional: ['可回', 'amber'], look: ['人工看', 'amber'], none: ['不回', ''], archive: ['归档', ''] };
function CommentCard({ row, runId, toast, decided, setDecided }) {
  const [text, setText] = useState(row.draft?.reply || '');
  const state = decided[row.id];
  const decide = async (action) => {
    await api('/api/decision', { kind: 'comment', run_id: runId, item_id: row.id, platform: 'xhs', category: row.category, action, original: row.draft?.reply || '', final: text });
    setDecided({ ...decided, [row.id]: action }); if (action === 'adopt' || action === 'edit') copy(text, toast); else toast(action === 'escalate' ? '已标记升级' : '已跳过');
  };
  const risk = row.category === 'risk';
  return html`<div class=${'card' + (risk ? ' risk' : '')}>
    <div class="head"><span class=${'tag ' + (risk ? 'red' : 'blue')}>${row.label}</span><span class=${'tag ' + ACT[row.action][1]}>${ACT[row.action][0]}</span>
      ${(row.flags || []).map(f => html`<span class="tag amber">${f.replace('risk-words:', '风险词：').replace('human-look', '人工看').replace('not-answerable', '简介答不了').replace('model-declined', '模型退回')}</span>`)}
      <span class="sp"></span>${row.likes != null ? html`<span class="small">👍 ${row.likes}</span>` : null}</div>
    <div>${row.author ? html`<b>@${row.author}</b>：` : null}${row.text}</div>
    <div class="small">${row.reason}${row.question ? ` · 问题：${row.question}` : ''}</div>
    ${row.draft ? html`<textarea value=${text} onInput=${e => setText(e.target.value)} style="min-height:48px"></textarea>
      <div class="small">${row.draft.applied_from ? '套用自相似评论的回复 · ' : ''}${row.draft.note || ''}${row.draft.lint && !row.draft.lint.pass ? ' · ⚠ 回复不符合语气规范' : ''}</div>` : null}
    ${risk ? html`<div class="small" style="color:var(--red-ink)">不生成回复。建议升级给负责人。</div>` : null}
    <div class="actions">
      ${state ? html`<span class="tag green">${{ adopt: '已采纳', edit: '已编辑采纳', skip: '已跳过', escalate: '已升级' }[state]}</span>` : html`
        ${row.draft ? html`<button class="btn dark" onClick=${() => decide(text !== row.draft.reply ? 'edit' : 'adopt')}>${text !== row.draft.reply ? '编辑后采纳' : '采纳并复制'}</button>` : null}
        ${risk ? html`<button class="btn danger" onClick=${() => decide('escalate')}>升级给负责人</button>` : null}
        <button class="btn ghost" onClick=${() => decide('skip')}>跳过</button>`}
    </div></div>`;
}

function CommentsResult({ run, cats, toast, decided, setDecided }) {
  const rows = run.rows; const s = run.summary;
  const grp = a => rows.filter(r => a.includes(r.action));
  const todo = grp(['draft', 'route', 'apply']), look = grp(['look']), opt = grp(['optional']), none = grp(['none']), arch = grp(['archive']);
  const counts = Object.entries(s.categories).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  return html`<div>
    <div class="bubble">共 ${s.total} 条：需处理 ${todo.length}，需人工看 ${look.length}，可回 ${opt.length}，不回 ${none.length}，归档 ${arch.length}。</div>
    <div class="chips">${counts.map(([k, n]) => html`<span class=${'chip small' + (k === 'risk' ? ' on' : '')}>${cats[k]?.label || k} ${n}</span>`)}</div>
    ${todo.length + look.length ? html`<div class="section-title">需要处理</div><div class="grid">${[...todo, ...look].map(r => html`<${CommentCard} key=${r.id} row=${r} runId=${run.id} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}</div>` : null}
    ${opt.length ? html`<details class="fold"><summary>可回，人工决定 ${opt.length}</summary><div class="grid">${opt.map(r => html`<${CommentCard} key=${r.id} row=${r} runId=${run.id} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}</div></details>` : null}
    ${none.length ? html`<details class="fold"><summary>无需回复 ${none.length}（额度、短评、质疑）</summary><div class="list">${none.map(r => html`<div class="row"><span class="who">${r.label}</span><span>${r.text}</span></div>`)}</div></details>` : null}
    ${arch.length ? html`<details class="fold"><summary>已归档 ${arch.length}${arch.some(r => r.tag) ? `，含标签 ${[...new Set(arch.map(r => r.tag).filter(Boolean))].join(' / ')}` : ''}</summary><div class="list">${arch.map(r => html`<div class="row"><span class="who">${r.tag ? '#' + r.tag : r.label}</span><span>${r.text}</span></div>`)}</div></details>` : null}
  </div>`;
}

/* ---------- pages ---------- */
function Records({ state }) {
  const m = state?.metrics || {};
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  return html`<div class="records">
    <div class="metrics">
      <div class="metric"><div class="k">Caption 采纳率（含编辑）</div><div class="v">${pct(m.caption?.adoption_rate)}</div><div class="s">${m.caption?.decisions || 0} 次决策 · 采纳 ${m.caption?.adopted || 0} · 编辑 ${m.caption?.edited || 0} · 跳过 ${m.caption?.skipped || 0}</div></div>
      <div class="metric"><div class="k">Caption 编辑幅度（中位）</div><div class="v">${pct(m.caption?.median_edit_ratio)}</div><div class="s">采纳前改动占原文比例，越小越接近开箱即用</div></div>
      <div class="metric"><div class="k">评论回复采纳率</div><div class="v">${pct(m.comment?.adoption_rate)}</div><div class="s">${m.comment?.decisions || 0} 次决策 · 升级 ${m.comment?.escalated || 0}</div></div>
      <div class="metric"><div class="k">评论回复编辑幅度（中位）</div><div class="v">${pct(m.comment?.median_edit_ratio)}</div><div class="s">回复语气规范来自 19 条真实回复</div></div>
    </div>
    <div><div class="section-title">最近的 Caption</div><div class="list">${(state?.recent?.captions || []).map(r => html`<div class="row"><span class="who">${(r.ts || '').slice(5, 16).replace('T', ' ')}</span><span>${r.topic || '（无主题）'} · ${(r.platforms || []).map(p => PLAT[p]).join(' / ')}</span></div>`)}</div></div>
    <div><div class="section-title">最近的评论处理</div><div class="list">${(state?.recent?.comments || []).map(r => html`<div class="row"><span class="who">${(r.ts || '').slice(5, 16).replace('T', ' ')}</span><span>${r.summary?.total} 条 · 起草 ${r.summary?.actions?.draft ?? r.summary?.drafts} · 人工看 ${r.summary?.actions?.look ?? '—'}</span></div>`)}</div></div>
    <div class="small">voice 文件版本：X ${state?.voice?.x?.hash} · 小红书 ${state?.voice?.xhs?.hash} · prompt ${state?.prompt_versions?.caption} / ${state?.prompt_versions?.comments} · 模型 ${state?.model}</div>
  </div>`;
}
function Voice() {
  const [which, setWhich] = useState('x'); const [md, setMd] = useState('');
  useEffect(() => { api('/api/voice/' + which).then(r => setMd(r.markdown)).catch(e => setMd('加载失败：' + e.message)); }, [which]);
  const names = { x: 'X 发帖', xhs: '小红书发帖', reply: '小红书回复', policy: '评论策略' };
  return html`<div class="records"><div class="chips">${Object.entries(names).map(([k, v]) => html`<button class=${'chip' + (k === which ? ' on' : '')} onClick=${() => setWhich(k)}>${v}</button>`)}</div>
    <div class="md" dangerouslySetInnerHTML=${{ __html: mdToHtml(md) }}></div></div>`;
}

/* ---------- chat ---------- */
function App() {
  const [page, setPage] = useState('chat');
  const [state, setState] = useState(null);
  const [msgs, setMsgs] = useState(() => $store.get('cc.msgs', []));
  const [mode, setMode] = useState('caption');
  const [platforms, setPlatforms] = useState(['x', 'xhs']);
  const [input, setInput] = useState(''); const [facts, setFacts] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [decided, setDecided] = useState(() => $store.get('cc.decided', {}));
  const streamRef = useRef();
  const toast = (text, err) => { setToastMsg({ text, err }); setTimeout(() => setToastMsg(null), 1800); };
  const refreshState = () => api('/api/state').then(setState).catch(() => {});
  useEffect(() => { refreshState(); }, []);
  useEffect(() => { $store.set('cc.msgs', msgs.slice(-30)); streamRef.current && (streamRef.current.scrollTop = streamRef.current.scrollHeight); }, [msgs]);
  useEffect(() => { $store.set('cc.decided', decided); }, [decided]);
  const push = m => setMsgs(ms => [...ms, { id: Math.random().toString(36).slice(2), ...m }]);
  const patch = (id, f) => setMsgs(ms => ms.map(m => m.id === id ? f(m) : m));

  async function runJob(kind, req, mid) {
    try {
      const { job } = await api(req.path, req.body);
      for (;;) {
        await new Promise(r => setTimeout(r, 2000));
        const j = await api('/api/job/' + job);
        if (j.status === 'done') { patch(mid, m => ({ ...m, status: 'done', run: j.result })); refreshState(); return j.result; }
        if (j.status === 'error') { patch(mid, m => ({ ...m, status: 'error', error: j.error })); return null; }
      }
    } catch (e) { patch(mid, m => ({ ...m, status: 'error', error: e.message })); return null; }
    finally { setBusy(false); }
  }
  async function send() {
    const text = input.trim(); if (!text || busy) return;
    setBusy(true); setInput('');
    const id = Math.random().toString(36).slice(2);
    if (mode === 'caption') {
      push({ role: 'user', text: `写 Caption（${platforms.map(p => PLAT[p]).join(' / ')}）：\n${text}` });
      setMsgs(ms => [...ms, { id, role: 'bot', kind: 'caption', status: 'running', material: text, refines: [] }]);
      runJob('caption', { path: '/api/caption/run', body: { material: text, platforms, n: 2 } }, id);
    } else {
      push({ role: 'user', text: `处理评论（${text.split('\n').filter(l => l.trim()).length} 条）` });
      setMsgs(ms => [...ms, { id, role: 'bot', kind: 'comments', status: 'running' }]);
      runJob('comments', { path: '/api/comments/run', body: { text, facts } }, id);
    }
  }
  async function refine(mid, platform, candidateId, instruction) {
    const m = msgs.find(x => x.id === mid); if (!m?.run) return;
    push({ role: 'user', text: `修改 ${PLAT[platform]} 候选：${instruction}` });
    const rid = Math.random().toString(36).slice(2);
    setMsgs(ms => [...ms, { id: rid, role: 'bot', kind: 'text', status: 'running' }]);
    setBusy(true);
    const res = await runJob('refine', { path: '/api/caption/refine', body: { run_id: m.run.id, platform, candidate_id: candidateId, instruction } }, rid);
    if (res) { patch(mid, x => ({ ...x, refines: [...(x.refines || []), res] })); setMsgs(ms => ms.filter(x => x.id !== rid)); toast('修改版已加到卡片下方'); }
  }
  async function retype(mid, platform, type) {
    const m = msgs.find(x => x.id === mid); if (!m?.material || busy) return;
    push({ role: 'user', text: `按「${state.voice[platform].types.find(t => t.type === type)?.label}」重新生成 ${PLAT[platform]}` });
    const id = Math.random().toString(36).slice(2); setBusy(true);
    setMsgs(ms => [...ms, { id, role: 'bot', kind: 'caption', status: 'running', material: m.material, refines: [] }]);
    runJob('caption', { path: '/api/caption/run', body: { material: m.material, platforms: [platform], types: { [platform]: type }, n: 2 } }, id);
  }
  const tabs = [['chat', '对话'], ['records', '记录'], ['voice', '语气手册']];
  return html`<div class="shell">
    <aside class="rail"><div class="logo">K</div>
      ${tabs.map(([k, v]) => html`<button class=${k === page ? 'on' : ''} onClick=${() => setPage(k)} title=${v}>${v}</button>`)}
      <div class="spacer"></div><button class="" title="清空对话" onClick=${() => { if (confirm('清空当前对话？记录不会删除。')) setMsgs([]); }}>清空</button></aside>
    <main class="main">
      <div class="top"><h1>Kimi Content Copilot</h1><span class="meta">${state ? (state.kimi_configured ? `模型 ${state.model}` : 'Kimi API 未配置') : '连接中…'}</span></div>
      ${page === 'chat' ? html`
        <div class="tabs"><span class=${'tab' + (mode === 'caption' ? ' on' : '')} onClick=${() => setMode('caption')}>✍️ 写 Caption</span><span class=${'tab' + (mode === 'comments' ? ' on' : '')} onClick=${() => setMode('comments')}>💬 处理评论 <span class="n">小红书</span></span></div>
        <div class="stream" ref=${streamRef}>
          ${msgs.length ? null : html`<div class="bubble">粘贴一段素材（要点、草稿、链接都行），我按 Kimi 的语气写出 X 和小红书的候选，每一句都标注来自哪条事实。或者切到「处理评论」，粘贴一批评论，我来分类、筛选、起草。</div>`}
          ${msgs.map(m => m.role === 'user' ? html`<div class="msg-user" key=${m.id}>${m.text}</div>` : html`<div class="msg-bot" key=${m.id}>
            ${m.status === 'running' ? html`<div class="bubble busy">${m.kind === 'comments' ? '正在分类和筛选…' : m.kind === 'caption' ? '提取简介、生成候选、检查 checklist…（约 40–60 秒）' : '生成修改版…'}</div>` : null}
            ${m.status === 'error' ? html`<div class="bubble err">${m.error}</div>` : null}
            ${m.status === 'done' && m.kind === 'caption' ? html`<${CaptionResult} run=${m.run} refines=${m.refines} onRefine=${(p, c, i) => refine(m.id, p, c, i)} onRetype=${(p, t) => retype(m.id, p, t)} toast=${toast} decided=${decided} setDecided=${setDecided} />` : null}
            ${m.status === 'done' && m.kind === 'comments' ? html`<${CommentsResult} run=${m.run} cats=${state?.categories || {}} toast=${toast} decided=${decided} setDecided=${setDecided} />` : null}
          </div>`)}
        </div>
        <div class="composer">
          <div class="box">
            <textarea placeholder=${mode === 'caption' ? '素材：功能是什么、给谁用、有什么数字、什么时候上线、链接…' : '每行一条评论，格式如：@用户：内容 (赞 12)'} value=${input} onInput=${e => setInput(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}></textarea>
            ${mode === 'comments' ? html`<div class="comment-facts"><textarea placeholder="可选：帖子正文或产品事实。回复只会用这里的信息，没有的就退回人工。" value=${facts} onInput=${e => setFacts(e.target.value)}></textarea></div>` : null}
            <div class="bar">
              ${mode === 'caption' ? html`${[['x'], ['xhs'], ['x', 'xhs']].map(ps => html`<button class=${'chip' + (ps.join() === platforms.join() ? ' on' : '')} onClick=${() => setPlatforms(ps)}>${ps.length === 2 ? '双平台' : PLAT[ps[0]]}</button>`)}` : html`<span class="small">分类 → 守卫 → 决策表 → 只对要回的起草</span>`}
              <button class="btn dark send" disabled=${busy || !input.trim()} onClick=${send}>${busy ? '处理中…' : (mode === 'caption' ? '生成' : '处理')} ⌘↵</button>
            </div>
          </div>
        </div>` : page === 'records' ? html`<${Records} state=${state} />` : html`<${Voice} />`}
    </main>
    <${Toast} msg=${toastMsg} />
  </div>`;
}
render(html`<${App} />`, document.getElementById('app'));
