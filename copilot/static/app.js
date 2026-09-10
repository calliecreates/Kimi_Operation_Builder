/* Kimi Content Copilot UI. Preact + htm, no build. Two skills as pages: 生成文案, 处理评论. */
const { h, render } = preact;
const { useState, useEffect, useRef } = preactHooks;
const html = htm.bind(h);
const $store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const SESSION = $store.get('cc.session') || (() => { const s = Math.random().toString(36).slice(2, 10); $store.set('cc.session', s); return s; })();
const PLAT = { x: 'X', xhs: '小红书' };
const REG = { casual: '日常营业', launch: '正式发布', notice: '声明致歉' };
const uid = () => Math.random().toString(36).slice(2, 10);
const EXAMPLE_MATERIAL = 'Kimi Work 新功能「定时任务」上线。用户可以设定一个任务按计划自动执行，比如每天早上 8 点生成行业新闻简报、每周一拉取上周数据做周报。设置入口：Kimi Work 输入框左下角「+」→「定时任务」。任务到点后 Kimi Work 自动执行，结果保存在工作空间。需要电脑保持开机联网。支持 macOS 和 Windows 桌面端。今天起对所有用户开放。';
const EXAMPLE_COMMENTS = '@小林：定时任务手机上能设吗？还是只能电脑？ (赞 214)\n@晴子：太好用了！昨天设了早报今天真的准时生成了[萌萌哒R] (赞 41)\n@小周：到点没跑，白等了一早上，Windows 11 (赞 66)\n@大鹏：牛 (赞 2)\n@水润澄：请问国际区跟中国区会员有什么区别？\n@easy：什么时候能不429\n@正义：你们定时任务是不是偷偷上传我本地文件？我要发帖曝光\n@林默：用定时任务做了个每天自动发的早报，图是昨天的成果\n@阿杰：求教程！\n@路人：@小红薯123';
const EXAMPLE_FACTS = '定时任务今天在 Kimi Work 桌面端（macOS、Windows）上线；设置入口是输入框左下角「+」→「定时任务」；到点自动执行，结果保存在工作空间；需要电脑开机联网。';

async function api(path, data) {
  const r = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, session: SESSION }) } : {});
  const j = await r.json().catch(() => ({ error: '服务无响应' }));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function copyText(text, toast) { navigator.clipboard?.writeText(text).then(() => toast('已复制'), () => toast('复制失败', true)); }
function mdToHtml(md) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
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
  return out.join('\n');
}

/* ---------- shared bits ---------- */
function Toast({ msg }) { return msg ? html`<div class="toast">${msg.text}</div>` : null; }
function UserBubble({ text }) {
  const [open, setOpen] = useState(false);
  const short = text.length > 90 && !open;
  return html`<div class="msg-user">${short ? text.slice(0, 90) + '…' : text}${text.length > 90 ? html` <button class="link" onClick=${() => setOpen(!open)}>${open ? '收起' : '展开'}</button>` : null}</div>`;
}
function Stages({ stages, fallback }) {
  const list = stages && stages.length ? stages : [{ stage: 'queue', status: 'start', detail: fallback }];
  return html`<div class="bubble stages">${list.map(s => html`<div class=${'stage ' + s.status}><span class="dot">${s.status === 'done' ? '✓' : ''}</span><span>${s.detail || s.stage}</span></div>`)}</div>`;
}

/* ---------- caption ---------- */
function Brief({ brief }) {
  const [open, setOpen] = useState(false);
  return html`<div class="brief">
    <button class="link strong" onClick=${() => setOpen(!open)}>${open ? '▾' : '▸'} 简介：${brief.facts.length} 条事实${brief.unknowns?.length ? `，${brief.unknowns.length} 项未知` : ''}${brief.product ? ` · ${brief.product}` : ''}</button>
    ${open ? html`<div class="brief-body">
      <ol>${brief.facts.map(f => html`<li><span class="fid">${f.id}</span> ${f.text}</li>`)}</ol>
      ${brief.unknowns?.length ? html`<div class="small">未知，会写成 [待确认]：${brief.unknowns.join('；')}</div>` : null}
    </div>` : null}
  </div>`;
}
function Checklist({ lint }) {
  const [open, setOpen] = useState(false);
  const s = lint.summary; const items = lint.checks.filter(c => c.status !== 'pass');
  const tone = s.fail ? 'red' : s.manual ? 'amber' : 'green';
  return html`<div class="checkline">
    <button class=${'tag ' + tone + ' clickable'} onClick=${() => setOpen(!open)}>checklist ${s.pass}/${s.total}${s.manual ? ` · ${s.manual} 待人工` : ''}${s.fail ? ` · ${s.fail} 未通过` : ''} ${items.length ? (open ? '▾' : '▸') : ''}</button>
    ${open ? html`<div class="checks">${items.map(c => html`<div class=${c.status}>${c.status === 'fail' ? '✕' : '○'} ${c.label}${c.detail ? html` <span class="small">${c.detail}</span>` : ''}</div>`)}
      ${lint.flagged.map(f => html`<div class="fail">✕ 超出简介：「${f.text.slice(0, 60)}」 ${f.why}</div>`)}</div>` : null}
  </div>`;
}
function Candidate({ platform, cand, runId, onRefine, toast, decided, setDecided }) {
  const isX = platform === 'x';
  const [title, setTitle] = useState(cand.title || '');
  const [body, setBody] = useState(isX ? cand.text : cand.body);
  const [instr, setInstr] = useState(''); const [asking, setAsking] = useState(false);
  const state = decided[cand.id];
  const final = isX ? body : `${title}\n\n${body}`;
  const original = isX ? cand.text : `${cand.title}\n\n${cand.body}`;
  const edited = final !== original;
  const decide = async (action) => {
    await api('/api/decision', { kind: 'caption', run_id: runId, item_id: cand.id, platform, action, original, final });
    setDecided({ ...decided, [cand.id]: action }); if (action !== 'skip') copyText(final, toast); else toast('已跳过');
  };
  const ph = cand.lint.placeholders || [];
  return html`<div class="card">
    <div class="head"><span class="tag blue">${cand.template}</span>${cand.register ? html`<span class="tag">${REG[cand.register] || cand.register}</span>` : null}<span class="sp"></span><span class="small">${cand.chars} 字</span></div>
    ${cand.angle ? html`<div class="angle">${cand.angle}</div>` : null}
    ${isX ? null : html`<input class="title-input" value=${title} onInput=${e => setTitle(e.target.value)} placeholder="标题" /><div class="small right">${title.length} 字 · 建议 15–30</div>`}
    <textarea value=${body} onInput=${e => setBody(e.target.value)} style=${{ minHeight: Math.min(440, 48 + body.split('\n').length * 22) + 'px' }}></textarea>
    ${!isX && cand.tags?.length ? html`<div class="chips">${cand.tags.map(t => html`<span class="chip small">#${t}</span>`)}</div>` : null}
    ${ph.length ? html`<div class="ph">待确认 ${ph.length} 处：${ph.map(p => p.replace(/^\[待确认[：:]|\]$/g, '')).join('；')}</div>` : null}
    ${cand.image_plan ? html`<div class="small">配图：${(Array.isArray(cand.image_plan) ? cand.image_plan.join('；') : String(cand.image_plan)).replace(/^配图[：:]\s*/, '')}</div>` : null}
    <${Checklist} lint=${cand.lint} />
    ${asking ? html`<div class="refine"><textarea placeholder="怎么改？例如：压缩一半，结尾再软一点" value=${instr} onInput=${e => setInstr(e.target.value)} style="min-height:56px"></textarea>
      <div class="actions"><button class="btn dark" disabled=${!instr.trim()} onClick=${() => { onRefine(platform, cand.id, instr); setAsking(false); setInstr(''); }}>生成修改版</button><button class="btn ghost" onClick=${() => setAsking(false)}>取消</button></div></div>` : null}
    <div class="actions">
      ${state ? html`<span class="tag green">${{ adopt: '已采纳', edit: '已编辑采纳', skip: '已跳过' }[state]}</span>` : html`
        <button class="btn dark" onClick=${() => decide(edited ? 'edit' : 'adopt')}>采纳</button>
        <button class="btn" onClick=${() => setAsking(true)}>以此为基础改</button>
        <button class="btn ghost" onClick=${() => decide('skip')}>跳过</button>`}
      <button class="btn ghost" onClick=${() => copyText(final, toast)}>复制</button>
    </div></div>`;
}
function TypePicker({ msg, types, onGenerate, busy }) {
  const [sel, setSel] = useState(() => Object.fromEntries(msg.platforms.map(p => [p, msg.suggestions[p]?.type])));
  const used = msg.generated || 0;
  return html`<div class="picker">
    <div class="bubble">${used ? '换个类型再生成，或者保持现在的类型重新生成。' : '第二步：确认每个平台的类型。类型决定模板和语气，选错类型是最大的返工来源。'}</div>
    <div class="card picker-card">
      ${msg.platforms.map(p => html`<div class="pick-row"><span class="tag blue">${PLAT[p]}</span>
        <div class="chips">${(types?.[p] || msg.suggestions[p].options).map(o => html`<button class=${'chip' + (o.type === sel[p] ? ' on' : '')} onClick=${() => setSel({ ...sel, [p]: o.type })}>${o.label}</button>`)}</div>
        <span class="small">${msg.suggestions[p]?.type === sel[p] ? '建议：' : '建议是「' + (types?.[p] || msg.suggestions[p].options).find(o => o.type === msg.suggestions[p]?.type)?.label + '」，'}${msg.suggestions[p]?.reason || ''}</span></div>`)}
      <div class="actions"><button class="btn dark" disabled=${busy} onClick=${() => onGenerate(sel)}>${used ? '按所选类型再生成' : '开始生成'}</button></div>
    </div></div>`;
}
function CaptionResult({ msg, types, onRefine, onChangeType, toast, decided, setDecided }) {
  const run = msg.run; const plats = Object.keys(run.results);
  const [tab, setTab] = useState(plats[0]);
  const r = run.results[tab];
  const label = (types?.[tab] || run.suggestions[tab]?.options || []).find(o => o.type === r.type)?.label || r.type;
  const refines = (msg.refines || []).filter(x => x.platform === tab);
  return html`<div>
    ${plats.length > 1 ? html`<div class="tabs inline">${plats.map(p => html`<span class=${'tab' + (p === tab ? ' on' : '')} onClick=${() => setTab(p)}>${PLAT[p]} <span class="n">${run.results[p].candidates.length}</span></span>`)}</div>` : null}
    <div class="typebar"><span class="small">类型</span><span class="tag">${label}</span><span class="sp"></span><button class="btn ghost" onClick=${onChangeType}>换个类型 / 重新生成</button></div>
    <div class="grid">${r.candidates.map(c => html`<${Candidate} key=${c.id} platform=${tab} cand=${c} runId=${run.id} onRefine=${onRefine} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}
      ${refines.map(x => x.candidates.map(c => html`<${Candidate} key=${c.id} platform=${tab} cand=${{ ...c, template: '修改版 · ' + c.template }} runId=${run.id} onRefine=${onRefine} toast=${toast} decided=${decided} setDecided=${setDecided} />`))}
    </div></div>`;
}

/* ---------- comments: guided flow ---------- */
const ACT = { draft: ['起草', 'blue'], route: ['转客服', 'blue'], apply: ['套用相似', 'blue'], optional: ['可回', 'amber'], look: ['人工看', 'amber'], none: ['不回', ''], archive: ['归档', ''] };
const FLAG = f => f.replace('risk-words:', '风险词：').replace('human-look', '人工看').replace('not-answerable', '简介答不了').replace('model-declined', '模型退回');
const DEC = { adopt: '已发送', edit: '已发送', skip: '已跳过', escalate: '已升级' };
function PostChooser({ posts, onPick, onPaste, selected, busy }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [facts, setFacts] = useState('');
  return html`<div>
    <div class="bubble">第一步：选一个帖子。这是官号最近的四篇真实笔记和评论区。</div>
    <div class="grid posts">${(posts || []).map(p => html`<div class=${'card post' + (selected === p.id ? ' selected' : '')} onClick=${() => !busy && onPick(p)}>
      <div class="title">${p.title}</div>
      <div class="small">${p.date} · ${p.count} 条评论${p.likes != null ? ` · 笔记 ${p.likes} 赞` : ''}</div>
      <div class="actions">${selected === p.id ? html`<span class="tag green">已选</span>` : html`<button class="btn dark" disabled=${busy}>处理这篇的评论</button>`}</div></div>`)}</div>
    <details class="fold" open=${open} onToggle=${e => setOpen(e.target.open)}><summary>或者粘贴自己的评论</summary>
      <div class="paste"><textarea placeholder="每行一条评论，格式如：@用户：内容 (赞 12)" value=${text} onInput=${e => setText(e.target.value)} style="min-height:90px"></textarea>
        <textarea placeholder="可选：帖子正文或产品事实。回复只会用这里的信息。" value=${facts} onInput=${e => setFacts(e.target.value)} style="min-height:56px"></textarea>
        <div class="actions"><button class="btn dark" disabled=${!text.trim()} onClick=${() => onPaste(text, facts)}>处理</button><button class="btn ghost" onClick=${() => { setText(EXAMPLE_COMMENTS); setFacts(EXAMPLE_FACTS); }}>用示例</button></div></div></details>
  </div>`;
}
function CommentCard({ row, runId, toast, decided, setDecided }) {
  const [text, setText] = useState(row.draft?.reply || '');
  const state = decided[row.id];
  const decide = async (action) => {
    await api('/api/decision', { kind: 'comment', run_id: runId, item_id: row.id, platform: 'xhs', category: row.category, action, original: row.draft?.reply || '', final: text });
    setDecided({ ...decided, [row.id]: action }); if (action === 'adopt' || action === 'edit') { copyText(text, toast); } else toast(action === 'escalate' ? '已标记升级' : '已跳过');
  };
  const risk = row.category === 'risk';
  const sent = state === 'adopt' || state === 'edit';
  const needsHuman = !row.draft && !risk;
  return html`<div class=${'card' + (risk ? ' risk' : '') + (state ? ' decided' : '')}>
    <div class="head"><span class=${'tag ' + (risk ? 'red' : 'blue')}>${row.label}</span><span class=${'tag ' + ACT[row.action][1]}>${ACT[row.action][0]}</span>
      ${(row.flags || []).map(f => html`<span class="tag amber">${FLAG(f)}</span>`)}${row.kimi_replied ? html`<span class="tag green" title="数据里官号确实回复了这条">官号当时回复了</span>` : null}<span class="sp"></span>${row.likes != null ? html`<span class="small">👍 ${row.likes}</span>` : null}</div>
    <div>${row.author ? html`<b>@${row.author}</b>：` : null}${row.text}</div>
    <div class="small">${row.reason}${row.question ? ` · 问题：${row.question}` : ''}</div>
    ${risk ? html`<div class="small" style="color:var(--red-ink)">不生成回复。建议升级给负责人。</div>` : sent ? html`<div class="draft"><div class="small">已发送的回复</div><div class="sent">${text}</div></div>` : html`<div class="draft"><div class="small">${row.draft ? '建议回复' : '简介里没有能回答的事实，请你来写'}</div>
      <textarea value=${text} placeholder=${row.draft ? '' : '写一条回复…'} onInput=${e => setText(e.target.value)} style="min-height:44px"></textarea>
      ${row.draft ? html`<div class="small">${row.draft.applied_from ? '套用自相似评论 · ' : ''}${row.draft.note || ''}${row.draft.lint && !row.draft.lint.pass ? ' · ⚠ 不符合回复规范' : ''}</div>` : null}</div>`}
    <div class="actions">
      ${state ? html`<span class="tag green">${sent ? '已发送' : DEC[state]}</span>` : html`
        ${!risk ? html`<button class="btn dark" disabled=${!text.trim()} title="模拟发送：复制到剪贴板，去小红书粘贴" onClick=${() => decide(row.draft && text === row.draft.reply ? 'adopt' : 'edit')}>发送</button>` : null}
        ${risk ? html`<button class="btn danger" onClick=${() => decide('escalate')}>升级给负责人</button>` : null}
        <button class="btn ghost" onClick=${() => decide('skip')}>跳过</button>`}
    </div></div>`;
}
function CommentsResult({ run, cats, toast, decided, setDecided, onDone, onAgain, summary }) {
  const rows = run.rows; const s = run.summary;
  const grp = a => rows.filter(r => a.includes(r.action));
  const todo = grp(['draft', 'route', 'apply']), look = grp(['look']), opt = grp(['optional']), none = grp(['none']), arch = grp(['archive']);
  const counts = Object.entries(s.categories).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const pending = [...todo, ...look].filter(r => !decided[r.id]).length;
  const tally = ['adopt', 'edit', 'skip', 'escalate'].map(a => [a, [...todo, ...look, ...opt].filter(r => decided[r.id] === a).length]);
  return html`<div>
    <div class="bubble">第二步：${s.total} 条评论里，值得回复的 ${todo.length} 条已起草，${look.length} 条需要人看；${none.length} 条不回，${arch.length} 条归档。</div>
    <div class="chips">${counts.map(([k, n]) => html`<span class=${'chip small' + (k === 'risk' ? ' on' : '')}>${cats[k]?.label || k} ${n}</span>`)}</div>
    ${todo.length + look.length ? html`<div class="section-title">第三步：逐条决定</div><div class="grid">${[...todo, ...look].map(r => html`<${CommentCard} key=${r.id} row=${r} runId=${run.id} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}</div>` : null}
    ${opt.length ? html`<details class="fold"><summary>可回，人工决定 ${opt.length}</summary><div class="grid">${opt.map(r => html`<${CommentCard} key=${r.id} row=${r} runId=${run.id} toast=${toast} decided=${decided} setDecided=${setDecided} />`)}</div></details>` : null}
    ${none.length ? html`<details class="fold"><summary>无需回复 ${none.length}（额度、短评、质疑）</summary><div class="list">${none.map(r => html`<div class="row"><span class="who">${r.label}</span><span>${r.text}</span></div>`)}</div></details>` : null}
    ${arch.length ? html`<details class="fold"><summary>已归档 ${arch.length}${arch.some(r => r.tag) ? `，标签 ${[...new Set(arch.map(r => r.tag).filter(Boolean))].join(' / ')}` : ''}</summary><div class="list">${arch.map(r => html`<div class="row"><span class="who">${r.tag ? '#' + r.tag : r.label}</span><span>${r.text}</span></div>`)}</div></details>` : null}
    <div class="tally"><span>已发送 ${tally[0][1] + tally[1][1]}</span><span>跳过 ${tally[2][1]}</span><span>升级 ${tally[3][1]}</span><span>待定 ${pending}</span><span class="sp"></span>
      ${summary ? html`<button class="btn" onClick=${onAgain}>再选一篇</button>` : html`<button class="btn dark" onClick=${onDone}>${pending ? `完成本轮（还有 ${pending} 条待定）` : '完成本轮'}</button>`}</div>
    ${summary ? html`<div class="bubble">${summary}</div>` : null}
  </div>`;
}

/* ---------- secondary pages ---------- */
function Records({ state }) {
  const m = state?.metrics || {}; const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  return html`<div class="records">
    <div class="metrics">
      <div class="metric"><div class="k">文案采纳率（含编辑）</div><div class="v">${pct(m.caption?.adoption_rate)}</div><div class="s">${m.caption?.decisions || 0} 次决策 · 采纳 ${m.caption?.adopted || 0} · 编辑 ${m.caption?.edited || 0} · 跳过 ${m.caption?.skipped || 0}</div></div>
      <div class="metric"><div class="k">文案编辑幅度（中位）</div><div class="v">${pct(m.caption?.median_edit_ratio)}</div><div class="s">采纳前改动占原文比例，越小越接近开箱即用</div></div>
      <div class="metric"><div class="k">回复采纳率</div><div class="v">${pct(m.comment?.adoption_rate)}</div><div class="s">${m.comment?.decisions || 0} 次决策 · 升级 ${m.comment?.escalated || 0}</div></div>
      <div class="metric"><div class="k">回复编辑幅度（中位）</div><div class="v">${pct(m.comment?.median_edit_ratio)}</div><div class="s">回复规范来自 19 条真实回复</div></div>
    </div>
    <div><div class="section-title">最近的文案</div><div class="list">${(state?.recent?.captions || []).map(r => html`<div class="row"><span class="who">${(r.ts || '').slice(5, 16).replace('T', ' ')}</span><span>${r.topic || '（无主题）'} · ${(r.platforms || []).map(p => PLAT[p]).join(' / ')}</span></div>`)}</div></div>
    <div><div class="section-title">最近的评论处理</div><div class="list">${(state?.recent?.comments || []).map(r => html`<div class="row"><span class="who">${(r.ts || '').slice(5, 16).replace('T', ' ')}</span><span>${r.summary?.total} 条 · 起草 ${r.summary?.actions?.draft ?? r.summary?.drafts} · 人工看 ${r.summary?.actions?.look ?? '—'}</span></div>`)}</div></div>
    <div class="small">语气文件版本：X ${state?.voice?.x?.hash} · 小红书 ${state?.voice?.xhs?.hash} · prompt ${state?.prompt_versions?.caption} / ${state?.prompt_versions?.comments} · 模型 ${state?.model}</div>
  </div>`;
}
function Voice() {
  const [which, setWhich] = useState('x'); const [md, setMd] = useState('');
  useEffect(() => { api('/api/voice/' + which).then(r => setMd(r.markdown)).catch(e => setMd('加载失败：' + e.message)); }, [which]);
  const names = { x: 'X 发帖', xhs: '小红书发帖', reply: '小红书回复', policy: '评论策略' };
  return html`<div class="records"><div class="chips">${Object.entries(names).map(([k, v]) => html`<button class=${'chip' + (k === which ? ' on' : '')} onClick=${() => setWhich(k)}>${v}</button>`)}</div>
    <div class="md" dangerouslySetInnerHTML=${{ __html: mdToHtml(md) }}></div></div>`;
}

/* ---------- app ---------- */
function App() {
  const [page, setPage] = useState($store.get('cc.page', 'caption'));
  const [state, setState] = useState(null);
  const [msgs, setMsgs] = useState(() => $store.get('cc.msgs2', { caption: [], comments: [] }));
  const [platforms, setPlatforms] = useState(['x', 'xhs']);
  const [input, setInput] = useState({ caption: '' });
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [decided, setDecided] = useState(() => $store.get('cc.decided', {}));
  const [posts, setPosts] = useState(null);
  const streamRef = useRef();
  const toast = (text, err) => { setToastMsg({ text, err }); setTimeout(() => setToastMsg(null), 1800); };
  const refreshState = () => api('/api/state').then(setState).catch(() => {});
  useEffect(() => { refreshState(); api('/api/posts').then(r => setPosts(r.posts)).catch(() => setPosts([])); }, []);
  useEffect(() => { $store.set('cc.page', page); }, [page]);
  const scrollToEnd = () => { const el = streamRef.current; if (!el) return; requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })); };
  useEffect(() => { $store.set('cc.msgs2', { caption: msgs.caption.slice(-20), comments: msgs.comments.slice(-20) }); const last = (msgs[page] || []).slice(-1)[0]; if (!last || last.role === 'user' || last.status === 'running' || last.kind === 'chooser') scrollToEnd(); }, [msgs]);
  useEffect(() => { scrollToEnd(); if (page === 'comments' && !(msgs.comments || []).length) push('comments', { role: 'bot', kind: 'chooser', status: 'done' }); }, [page]);
  useEffect(() => { $store.set('cc.decided', decided); }, [decided]);
  const list = msgs[page] || [];
  const push = (pg, m) => setMsgs(ms => ({ ...ms, [pg]: [...ms[pg], { id: uid(), ...m }] }));
  const patch = (pg, id, f) => setMsgs(ms => ({ ...ms, [pg]: ms[pg].map(m => m.id === id ? f(m) : m) }));
  const drop = (pg, id) => setMsgs(ms => ({ ...ms, [pg]: ms[pg].filter(m => m.id !== id) }));

  async function runJob(pg, req, mid) {
    try {
      const { job } = await api(req.path, req.body);
      for (;;) {
        await new Promise(r => setTimeout(r, 1500));
        const j = await api('/api/job/' + job);
        patch(pg, mid, m => ({ ...m, stages: j.stages }));
        if (j.status === 'done') { patch(pg, mid, m => ({ ...m, status: 'done', run: j.result })); refreshState(); return j.result; }
        if (j.status === 'error') { patch(pg, mid, m => ({ ...m, status: 'error', error: j.error })); return null; }
      }
    } catch (e) { patch(pg, mid, m => ({ ...m, status: 'error', error: e.message })); return null; }
    finally { setBusy(false); }
  }
  function send() {
    const text = (input[page] || '').trim(); if (!text || busy) return;
    setBusy(true); setInput({ ...input, [page]: '' });
    const id = uid();
    if (page === 'caption') {
      push('caption', { role: 'user', text });
      setMsgs(ms => ({ ...ms, caption: [...ms.caption, { id, role: 'bot', kind: 'brief', status: 'running', material: text, platforms }] }));
      runJob('caption', { path: '/api/caption/brief', body: { material: text, platforms } }, id).then(res => {
        if (res) patch('caption', id, m => ({ ...m, brief: res.brief, suggestions: res.suggestions, generated: 0 }));
      });
    }
  }
  function pickPost(p, chooserId) {
    if (busy) return; setBusy(true);
    if (chooserId) patch('comments', chooserId, x => ({ ...x, selected: p.id }));
    push('comments', { role: 'user', text: `处理「${p.title}」的 ${p.count} 条评论` });
    const id = uid();
    setMsgs(ms => ({ ...ms, comments: [...ms.comments, { id, role: 'bot', kind: 'comments', status: 'running' }] }));
    runJob('comments', { path: '/api/comments/run', body: { post_id: p.id } }, id);
  }
  function pasteComments(text, f) {
    if (busy) return; setBusy(true);
    push('comments', { role: 'user', text: `处理粘贴的 ${text.split('\n').filter(l => l.trim()).length} 条评论${f.trim() ? '（附帖子事实）' : ''}` });
    const id = uid();
    setMsgs(ms => ({ ...ms, comments: [...ms.comments, { id, role: 'bot', kind: 'comments', status: 'running' }] }));
    runJob('comments', { path: '/api/comments/run', body: { text, facts: f } }, id);
  }
  function finishRound(mid) {
    const m = msgs.comments.find(x => x.id === mid); if (!m?.run) return;
    const rows = m.run.rows.filter(r => ['draft', 'route', 'apply', 'look', 'optional'].includes(r.action));
    const c = a => rows.filter(r => decided[r.id] === a).length;
    const done = c('adopt') + c('edit');
    const text = `本轮小结：${m.run.summary.total} 条评论，发送回复 ${done} 条（其中人工编辑或撰写 ${c('edit')} 条），跳过 ${c('skip')} 条，升级 ${c('escalate')} 条，${rows.length - done - c('skip') - c('escalate')} 条未处理。风险类 ${m.run.summary.categories.risk || 0} 条已标出。`;
    patch('comments', mid, x => ({ ...x, summary: text })); refreshState();
  }
  function anotherPost() { push('comments', { role: 'bot', kind: 'chooser', status: 'done' }); }
  useEffect(() => { if (page === 'comments' && msgs.comments.length === 0) anotherPost(); }, []);
  async function refine(mid, platform, candidateId, instruction) {
    const m = msgs.caption.find(x => x.id === mid); if (!m?.run || busy) return;
    push('caption', { role: 'user', text: `修改 ${PLAT[platform]} 候选：${instruction}` });
    const rid = uid(); setBusy(true);
    setMsgs(ms => ({ ...ms, caption: [...ms.caption, { id: rid, role: 'bot', kind: 'refine', status: 'running' }] }));
    const res = await runJob('caption', { path: '/api/caption/refine', body: { run_id: m.run.id, platform, candidate_id: candidateId, instruction } }, rid);
    if (res) { patch('caption', mid, x => ({ ...x, refines: [...(x.refines || []), res] })); drop('caption', rid); toast('修改版已加到卡片列表末尾'); }
  }
  function generateFrom(pickerId, sel) {
    const m = msgs.caption.find(x => x.id === pickerId); if (!m?.brief || busy) return;
    const labels = m.platforms.map(p => `${PLAT[p]}：${state?.voice?.[p]?.types.find(t => t.type === sel[p])?.label || sel[p]}`).join('，');
    push('caption', { role: 'user', text: `${m.generated ? '再生成' : '生成'}（${labels}）` });
    patch('caption', pickerId, x => ({ ...x, generated: (x.generated || 0) + 1 }));
    const id = uid(); setBusy(true);
    setMsgs(ms => ({ ...ms, caption: [...ms.caption, { id, role: 'bot', kind: 'caption', status: 'running', pickerId, refines: [] }] }));
    runJob('caption', { path: '/api/caption/generate', body: { brief: m.brief, suggestions: m.suggestions, platforms: m.platforms, types: sel, n: 2 } }, id);
  }
  function changeType(pickerId) {
    const m = msgs.caption.find(x => x.id === pickerId); if (!m) return;
    push('caption', { role: 'bot', kind: 'picker-again', status: 'done', pickerId });
  }
  const typeOptions = state ? Object.fromEntries(Object.entries(state.voice).map(([p, v]) => [p, v.types])) : null;
  const nav = [['caption', '生成文案'], ['comments', '处理评论'], ['records', '记录'], ['voice', '语气手册']];
  const isSkill = page === 'caption' || page === 'comments';
  return html`<div class="shell">
    <aside class="rail"><div class="logo">K</div>
      ${nav.map(([k, v], i) => html`<button class=${(k === page ? 'on' : '') + (i < 2 ? ' primary' : '')} onClick=${() => setPage(k)}>${v}</button>`)}
      <div class="spacer"></div>${isSkill ? html`<button title="清空当前对话" onClick=${() => { if (confirm('清空当前对话？记录不会删除。')) setMsgs(ms => ({ ...ms, [page]: page === 'comments' ? [{ id: uid(), role: 'bot', kind: 'chooser', status: 'done' }] : [] })); }}>清空</button>` : null}</aside>
    <main class="main">
      <div class="top"><h1>${{ caption: '生成文案', comments: '处理评论', records: '记录', voice: '语气手册' }[page]}</h1>
        ${page === 'caption' ? html`<span class="sub">素材 → 简介 → 按 Kimi 语气生成 → checklist</span>` : page === 'comments' ? html`<span class="sub">分类 → 守卫 → 决策表 → 只对要回的起草 · 小红书</span>` : null}
        <span class="meta">${state ? (state.kimi_configured ? `模型 ${state.model}` : 'Kimi API 未配置') : '连接中…'}</span></div>
      ${isSkill ? html`
        <div class="stream" ref=${streamRef}>
          ${page === 'caption' && !list.length ? html`<div class="empty"><div class="bubble">粘贴一段素材：功能是什么、给谁用、有什么数字、什么时候上线、链接。我先提取成事实清单，再按 Kimi 在 X 和小红书的语气各写两版，每一句都能追溯到某条事实。</div>
            <button class="btn" onClick=${() => setInput({ ...input, caption: EXAMPLE_MATERIAL })}>用示例试试</button></div>` : null}
          ${list.map(m => m.role === 'user' ? html`<${UserBubble} key=${m.id} text=${m.text} />` : html`<div class="msg-bot" key=${m.id}>
            ${m.status === 'running' ? html`<${Stages} stages=${m.stages} fallback=${m.kind === 'refine' ? '生成修改版…' : m.kind === 'brief' ? '提取简介…' : '排队中…'} />` : null}
            ${m.status === 'error' ? html`<div class="bubble err">${m.error}</div>` : null}
            ${m.status === 'done' && m.kind === 'brief' && m.brief ? html`<${Brief} brief=${m.brief} /><${TypePicker} msg=${m} types=${typeOptions} busy=${busy} onGenerate=${sel => generateFrom(m.id, sel)} />` : null}
            ${m.kind === 'picker-again' ? (() => { const pm = msgs.caption.find(x => x.id === m.pickerId); return pm?.brief ? html`<${TypePicker} msg=${pm} types=${typeOptions} busy=${busy} onGenerate=${sel => generateFrom(pm.id, sel)} />` : null; })() : null}
            ${m.status === 'done' && m.kind === 'caption' ? html`<${CaptionResult} msg=${m} types=${typeOptions} onRefine=${(p, c, i) => refine(m.id, p, c, i)} onChangeType=${() => changeType(m.pickerId)} toast=${toast} decided=${decided} setDecided=${setDecided} />` : null}
            ${m.status === 'done' && m.kind === 'comments' ? html`<${CommentsResult} run=${m.run} cats=${state?.categories || {}} toast=${toast} decided=${decided} setDecided=${setDecided} summary=${m.summary} onDone=${() => finishRound(m.id)} onAgain=${anotherPost} />` : null}
            ${m.kind === 'chooser' ? html`<${PostChooser} posts=${posts} onPick=${p => pickPost(p, m.id)} onPaste=${pasteComments} selected=${m.selected} busy=${busy} />` : null}
          </div>`)}
        </div>
        ${page === 'caption' ? html`<div class="composer"><div class="box">
          <textarea placeholder="素材：功能是什么、给谁用、有什么数字、什么时候上线、链接…" value=${input.caption || ''} onInput=${e => setInput({ ...input, caption: e.target.value })} onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}></textarea>
          <div class="bar">
            ${[['x'], ['xhs'], ['x', 'xhs']].map(ps => html`<button class=${'chip' + (ps.join() === platforms.join() ? ' on' : '')} onClick=${() => setPlatforms(ps)}>${ps.length === 2 ? '双平台' : PLAT[ps[0]]}</button>`)}
            <button class="btn dark send" disabled=${busy || !(input.caption || '').trim()} onClick=${send}>${busy ? '处理中…' : '生成'} ⌘↵</button>
          </div></div></div>` : html`<div class="composer slim">${busy ? '处理中…' : list.length ? html`<button class="btn ghost" onClick=${anotherPost}>再选一篇帖子</button>` : ''}</div>`}` : page === 'records' ? html`<${Records} state=${state} />` : html`<${Voice} />`}
    </main>
    <${Toast} msg=${toastMsg} />
  </div>`;
}
render(html`<${App} />`, document.getElementById('app'));
