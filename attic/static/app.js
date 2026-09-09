'use strict';
/* Kimi Radar — minimal frontend. Two jobs:
   1) set queries & time range, run collection/analysis and show its progress
   2) show ranked results clearly, then let the operator draft an experiment.
   API contract: see FRONTEND_HANDOFF.md. Every POST needs X-Radar-Token. */

/* ---------- helpers ---------- */
const $  = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => v == null ? '—' : new Intl.NumberFormat('en', {notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1}).format(v);
const date = v => v ? new Date(v).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}) : '时间未知';

const topics = {Research:'研究与分析', Slides:'演示文稿', Spreadsheets:'电子表格', Documents:'文档写作', Other:'其他'};
const labels = {radar:'机会雷达', studio:'实验工作室'};
const weightLabels = {fit:'Kimi 能力契合', need:'用户需求', signal:'讨论广度', angle:'内容角度', effort:'执行可行性'};
const signalLabels = {'Brand post':'品牌发帖', 'User need':'需求线索', 'Workflow example':'工作流示例', 'Conversation':'一般讨论'};
const statusLabels = {draft:'草稿', testing:'实测中', validated:'已验证', failed:'需迭代'};
const names = {Kimi_Moonshot:'Kimi', OpenAI:'OpenAI', claudeai:'Claude', GeminiApp:'Gemini', GoogleGemini:'Gemini', deepseek_ai:'DeepSeek', Zai_org:'Z.ai'};

let state = null;
let page = 'radar', filter = 'all', search = '', radarView = 'ideas';
let draft = null, dirty = false, editorTab = 'content', selected = null;
let pollTimer = null, toastTimer = null;

const DAY = 864e5;
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function toast(message, error = false){
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (error ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, error ? 8500 : 3500);
}

async function api(path, data){
  const response = await fetch('/api/' + path, data === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'X-Radar-Token': state.token},
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '操作失败');
  return json;
}

async function load(render = true){
  state = await api('state');
  updateChrome();
  if (render) renderPage();
  if (state.job.running) poll();
}

/* ---------- chrome: sidebar, topbar, banner, scan console ---------- */
function updateChrome(){
  $$('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
    b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false');
  });
  $('#nav-count').textContent = state.opportunities.length;
  $('#mode-label').textContent = state.mode === 'sample' ? '演示样本' : '真实采集';
  $('#mode-dot').classList.toggle('live', state.mode !== 'sample');
  const banner = $('#data-banner');
  banner.hidden = false;
  banner.className = 'data-banner' + (state.mode === 'live' ? ' live' : '');
  banner.innerHTML = state.mode === 'sample'
    ? '<span><b>演示样本</b> · 帖子和指标均为模拟，仅用于体验操作流程。</span><span>配置密钥并采集后切换为真实数据</span>'
    : `<span><b>真实采集</b> · ${date(state.dataset.collected_at)} · ${state.dataset.complete ? '查询分页已完成；仅代表监测样本' : '部分采集；增长倍数已隐藏'}</span>`;
  $('#side-meta').innerHTML =
    `<div class="conn"><span>TwitterAPI.io</span><span class="${state.connections.twitter ? 'ok' : 'no'}">${state.connections.twitter ? '已配置' : '待配置'}</span></div>
     <div class="conn"><span>Kimi · ${esc(state.connections.model)}</span><span class="${state.connections.kimi ? 'ok' : 'no'}">${state.connections.kimi ? '已配置' : '待配置'}</span></div>`;
  renderConsole();
}

function modeBadge(mode = state.mode){
  return `<span class="tag ${mode === 'sample' ? 'peach' : 'green'}">${mode === 'sample' ? '演示样本' : '真实数据'}</span>`;
}

/* ---------- scan cost estimate ---------- */
function estimateRequests(c){
  let sources = 1 + (c.collect_accounts ? c.accounts.length : 0);
  if (c.replies && c.collect_accounts && c.accounts.length) sources += 1;
  return {total: (sources + c.queries.length) * c.pages, sources: sources + c.queries.length};
}

/* ---------- scan console (sidebar bottom) ---------- */
function renderConsole(){
  const el = $('#scan-console');
  if (!state) return;
  const c = state.config, job = state.job, ds = state.dataset;
  const est = estimateRequests(c);
  const usage = ds.usage || {};
  const canAnalyze = state.has_live && state.connections.kimi;
  if (job.running){
    const pct = job.total ? Math.round(job.done / job.total * 100) : 0;
    el.innerHTML = `<section class="scan-console${job.total ? '' : ' indeterminate'}">
      <h3>正在采集分析</h3>
      <div class="stage">${esc(job.stage || '准备中…')}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${job.total ? pct : 100}%"></div></div>
      <div class="sc-sub">${job.total ? `来源进度 ${job.done} / ${job.total}` : ''}</div></section>`;
    return;
  }
  el.innerHTML = `<section class="scan-console">
    <h3>运行</h3>
    <div class="estimate"><span>预计请求${est.total > 200 ? '（超上限）' : ''}</span><b>≈ ${est.total}</b></div>
    <div class="sc-actions">
      <button class="button pink" data-action="scan">▶ 采集</button>
      <button class="button ghost" data-action="analyze" ${canAnalyze ? '' : 'disabled'} title="${canAnalyze ? '重新分析已缓存帖子，不重复采集' : '需要真实数据与 Kimi 密钥'}">重新分析</button>
    </div>
    <div class="mode-row">
      <button class="button small ${state.mode === 'sample' ? 'on' : ''}" data-mode="sample">演示样本</button>
      <button class="button small ${state.mode === 'live' ? 'on' : ''}" data-mode="live" ${state.has_live ? '' : 'disabled'}>真实数据</button>
    </div>
    ${job.error ? `<div class="sc-error">上次任务未完成：${esc(job.error)}</div>` : ''}
    ${usage.requests ? `<div class="sc-sub" style="margin-top:9px">上次采集：${usage.requests} 次请求 · 返回 ${fmt(usage.tweet_records_returned)} / 窗口内 ${fmt(usage.tweet_records_kept)} 条${ds.analysis_coverage ? ` · 模型阅读 ${ds.analysis_coverage.included}/${ds.analysis_coverage.eligible} 条` : ''}</div>` : ''}
  </section>`;
}

function poll(){
  if (pollTimer) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    try {
      const job = await api('job');
      state.job = job;
      renderConsole();
      if (job.running){ poll(); return; }
      await load(!dirty);
      if (job.error) toast(job.error, true);
      else toast('任务完成，数据已更新。');
    } catch (e){ toast(e.message, true); }
  }, 1800);
}

/* ---------- shared fragments ---------- */
function heading(eyebrow, title, description){
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div></div>`;
}
function empty(title, description, action = ''){
  return `<div class="empty-state"><h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function reviewStatus(id){ return state.reviews[id]?.status || 'new'; }

async function canLeave(){
  if (!dirty) return true;
  const dialog = $('#confirm-dialog');
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    const yes = dialog.returnValue === 'discard';
    if (yes) dirty = false;
    resolve(yes);
  }, {once:true}));
}
async function navigate(next){
  if (!labels[next] || !(await canLeave())) return;
  page = next;
  history.replaceState(null, '', '#' + next);
  updateChrome();
  renderPage();
  window.scrollTo({top:0});
}
function renderPage(){
  if (!state) return;
  $('#main').innerHTML = (page === 'studio' ? renderStudio : renderRadar)();
  bindPage();
}

/* ---------- view: radar (settings + run + results) ---------- */
function renderRadar(){
  const ds = state.dataset, ops = state.opportunities, c = state.config;
  const shortlisted = ops.filter(o => reviewStatus(o.id) === 'shortlist').length;
  const userAuthors = new Set(ds.tweets.filter(t => !t.brand && !t.is_repost).map(t => t.handle)).size;
  const visible = ops.filter(o =>
    (filter === 'all' ? reviewStatus(o.id) !== 'pass'
      : filter === 'shortlist' ? reviewStatus(o.id) === 'shortlist'
      : reviewStatus(o.id) === 'pass')
    && `${o.title} ${o.problem} ${o.audience}`.toLowerCase().includes(search.toLowerCase()));
  const f = ds.filter;
  const today = new Date();
  const rangeEnd = isoDay(today);
  const rangeStart = isoDay(new Date(today.getTime() - (c.window_days || 8) * DAY));

  return heading('SIGNALS → OPPORTUNITIES', '机会雷达', '设置查询与日期范围，运行采集分析，阅读排好序的用例创意。')
  + `<form id="sources-form"><section class="panel settings">
      <div class="section-heading" style="margin-top:0"><h2>查询与日期范围</h2><span class="subtle">改动需保存后生效，新关键词需要重新采集</span></div>
      <div class="set-grid">
        <label class="field compact"><span class="field-label">关键词查询 · 每行一条</span><textarea name="queries" rows="4" required>${esc(c.queries.join('\n'))}</textarea><small>查询里写了 since: / until: 的，按查询自己的日期采集，不受下方日期影响。</small></label>
        <label class="field compact"><span class="field-label">竞品账号 · 每行一个</span><textarea name="accounts" rows="4" required>${esc(c.accounts.join('\n'))}</textarea><small>用于品牌识别与竞品时间线采集。</small></label>
      </div>
      <div class="set-row">
        <label class="field compact"><span class="field-label">开始日期</span><input type="date" name="range_start" value="${rangeStart}" max="${rangeEnd}" required></label>
        <label class="field compact"><span class="field-label">结束日期</span><input type="date" name="range_end" value="${rangeEnd}" max="${rangeEnd}" required></label>
        <label class="field compact"><span class="field-label">排序</span><select name="query_type">${['Latest','Top'].map(v => `<option value="${v}" ${v === c.query_type ? 'selected' : ''}>${v === 'Top' ? 'Top · 高互动' : 'Latest · 最新'}</option>`).join('')}</select></label>
        <label class="field compact"><span class="field-label">每来源页数</span><select name="pages">${Array.from({length:10}, (_,i) => i+1).map(n => `<option value="${n}" ${n === c.pages ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <small class="subtle" style="display:block;margin:8px 0 4px">日期范围换算为采集窗口（1–90 天），从结束日期向前计算；要采集更早的历史区间，请直接在查询里写 since: / until:。</small>
      <label class="check"><input type="checkbox" name="collect_accounts" ${c.collect_accounts ? 'checked' : ''}>采集竞品时间线</label>
      <label class="check"><input type="checkbox" name="replies" ${c.replies ? 'checked' : ''}>同时采集竞品帖子下的回复</label>
      <input type="hidden" name="owned" value="${esc(c.owned)}">
      <div class="set-foot">
        <span class="est" id="live-est"></span>
        <div class="actions">
          <button type="submit" class="button">保存设置</button>
          <button type="button" class="button primary" data-action="scan" ${state.job.running ? 'disabled' : ''}>▶ 运行采集分析</button>
        </div>
      </div>
    </section></form>
    ${ds.warnings.map(w => `<div class="hint warning">${esc(w)}</div>`).join('')}
    <div class="section-heading"><h2>结果</h2><span class="subtle">${esc(ds.method)} · ${date(ds.collected_at)}</span></div>
    <div class="stats-strip">
      <span class="stat"><b>${fmt(ds.tweets.length)}</b>帖子</span>
      <span class="stat"><b>${fmt(userAuthors)}</b>非品牌作者</span>
      <span class="stat"><b>${ops.length}</b>用例创意</span>
      <span class="stat"><b>${shortlisted}</b>已入选</span>
      ${f ? `<span class="stat">过滤 ${f.input} → ${f.kept}</span>` : ''}
    </div>
    <div class="filters">
      <div class="segmented" aria-label="结果视图">${[['ideas','用例创意'],['posts','源数据帖子']].map(([v,l]) => `<button data-view="${v}" class="${radarView === v ? 'active' : ''}" aria-pressed="${radarView === v}">${l}</button>`).join('')}</div>
      ${radarView === 'ideas' ? `<div class="segmented" aria-label="机会筛选">${[['all','全部'],['shortlist','已入选'],['pass','暂不采用']].map(([v,l]) => `<button data-filter="${v}" class="${filter === v ? 'active' : ''}" aria-pressed="${filter === v}">${l}</button>`).join('')}</div>` : ''}
    </div>
    ${radarView === 'ideas'
      ? `<div id="opportunity-list">${visible.length ? visible.map((o,i) => opCard(o,i)).join('') : empty('暂时没有匹配的机会', '调整筛选，或在上方修改查询后运行采集。没有证据时，不强行生成选题。')}</div>
         <p class="section-caption">排序按社交潜力优先；两个分数均为本批采集内的相对值，跨批次不可比，不代表成功概率。</p>`
      : renderPosts()}`;
}

/* ---------- source posts: how each post was classified and used ---------- */
function bucketLabel(b){
  if (b === 'account') return '账号时间线';
  if (b === 'reply') return '竞品回复';
  const m = /^kw(\d+)$/.exec(b || '');
  return m ? `关键词 ${+m[1] + 1}` : '—';
}
function renderPosts(){
  const citedBy = {};
  for (const o of state.opportunities)
    for (const id of o.evidence_ids) (citedBy[id] = citedBy[id] || []).push(o.title);
  const q = search.toLowerCase();
  const posts = state.dataset.tweets
    .filter(t => !q || `${t.text} ${t.handle} ${t.name}`.toLowerCase().includes(q))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  if (!posts.length) return empty('没有匹配的帖子', '调整搜索，或修改查询后重新采集。');
  const shown = posts.slice(0, 60);
  return `<p class="section-caption" style="margin-top:0">每条帖子的信号分类、话题与来源由关键词规则标注；「被创意引用」表示它被哪个用例当作证据。品牌帖与转推不参与用户需求统计。</p>
  <div>${shown.map(t => {
    const cited = citedBy[t.id] || [];
    return `<article class="evidence-card">
      <header><b>${esc(t.sample && !t.brand ? '示例用户' : names[t.handle] || t.name)}</b><span class="subtle">@${esc(t.handle)}</span>
        <span class="tag ${t.signal === 'User need' ? 'pink' : t.brand ? 'blue' : ''}">${signalLabels[t.signal] || '讨论'}</span>
        <span class="tag">${topics[t.topic] || t.topic}</span>
        ${t.brand ? '<span class="tag blue">品牌</span>' : ''}
        ${t.is_repost ? '<span class="tag">转推 · 未参与分析</span>' : ''}
        ${t.sample ? '<span class="tag peach">模拟内容</span>' : ''}</header>
      <p lang="en">${esc(t.text)}</p>
      <footer><span>${date(t.created_at)} · ${fmt(t.views)} 浏览 · ${fmt(t.likes)} 喜欢 · ${fmt(t.replies)} 回复 · 来源：${bucketLabel(t.bucket)}</span>
      ${t.url ? `<a class="text-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">原帖 ↗</a>` : '<span>无真实原帖</span>'}</footer>
      ${cited.length ? `<div class="hint" style="margin-top:8px">→ 被创意引用：${cited.map(esc).join('；')}</div>` : ''}
    </article>`;
  }).join('')}</div>
  ${posts.length > 60 ? `<p class="section-caption">仅显示前 60 条（共 ${posts.length} 条），用顶部搜索缩小范围。</p>` : ''}`;
}

function opCard(o, i){
  const status = reviewStatus(o.id);
  return `<article class="opportunity-card">
    <div class="card-top"><span class="rank">${String(i+1).padStart(2,'0')}</span>
      <span class="tag blue">${topics[o.topic] || o.topic}</span>
      ${status !== 'new' ? `<span class="tag ${status === 'shortlist' ? 'green' : 'peach'}">${status === 'shortlist' ? '已入选' : '暂不采用'}</span>` : ''}
      <span class="axis">社交 <b>${o.social ?? '—'}</b> · 证据 <b>${o.evidence_strength ?? '—'}</b></span></div>
    <button class="card-title" data-open="${o.id}">${esc(o.title)}</button>
    <p>${esc(o.observed_pattern || o.problem)}</p>
    <div class="card-bottom"><span><b>${o.authors}</b> 位作者 · <b>${o.evidence_ids.length}</b> 条来源帖子${o.buckets > 1 ? ` · 跨 ${o.buckets} 组查询` : ''}</span><button class="button small" data-open="${o.id}">依据与操作 →</button></div>
    ${status === 'pass' ? `<p class="pass-note">暂不采用：${esc(state.reviews[o.id].note)}</p>` : ''}</article>`;
}

function evidenceCard(t){
  return `<article class="evidence-card"><header><b>${esc(t.sample && !t.brand ? '示例用户' : names[t.handle] || t.name)}</b><span class="subtle">@${esc(t.handle)}</span><span class="tag ${t.signal === 'User need' ? 'pink' : t.brand ? 'blue' : ''}">${signalLabels[t.signal] || '讨论'}</span></header>
    <p lang="en">${esc(t.text)}</p>
    <footer><span>${date(t.created_at)} · ${fmt(t.views)} 浏览 · ${fmt(t.likes)} 喜欢</span>${t.url ? `<a class="text-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a>` : '<span>模拟内容 · 无真实原帖</span>'}</footer></article>`;
}

/* ---------- opportunity detail dialog ---------- */
function openOpportunity(id){
  const o = state.opportunities.find(o => o.id === id);
  if (!o) return;
  selected = id;
  const posts = o.evidence_ids.map(eid => state.dataset.tweets.find(t => t.id === eid)).filter(Boolean);
  const shown = posts.slice(0, 6);
  const status = reviewStatus(id);
  const sd = o.social_detail || {};
  $('#detail-content').innerHTML = `
    <div class="dialog-header"><div><div class="actions">${modeBadge()}<span class="tag blue">${topics[o.topic] || o.topic}</span><span class="tag peach">待实测</span>${o.quadrant ? `<span class="tag pink">${esc(o.quadrant)}</span>` : ''}</div><h2 id="detail-title">${esc(o.title)}</h2></div>
    <button class="close-button" data-action="close-detail" aria-label="关闭机会详情">×</button></div>
    <div class="detail-grid"><div>
      <section class="detail-section"><h3>观察到的现象</h3><p>${esc(o.observed_pattern || o.problem)}</p><p class="section-caption">X 上已经有人在做的事，不代表用户需要某项功能。</p></section>
      <section class="detail-section"><h3>KIMI 改编</h3><p>${esc(o.kimi_adaptation || o.angle)}</p></section>
      ${o.risk ? `<section class="detail-section"><h3>风险</h3><p>${esc(o.risk)}</p></section>` : ''}
      ${o.next_action ? `<section class="detail-section"><h3>下一步</h3><p>${esc(o.next_action)}</p><p style="margin-top:6px">目标人群：${esc(o.audience)}</p></section>` : ''}
      <div class="section-heading"><h3>原始证据</h3><span class="subtle">${posts.length} 条帖子 · ${o.authors} 位作者</span></div>
      ${shown.map(evidenceCard).join('')}
      ${posts.length > 6 ? `<details class="source-note"><summary>展开其余 ${posts.length - 6} 条来源</summary>${posts.slice(6).map(evidenceCard).join('')}</details>` : ''}
    </div><div>
      <section class="detail-section"><h3>两个轴，分开看</h3>
        <div class="score-row"><header><span>社交潜力 <span class="subtle">本批排名</span></span><span><b>${o.social ?? '—'}</b> / 100</span></header>
          <div class="bar-track"><div class="bar-fill c-pink" style="width:${o.social || 0}%"></div></div>
          <p>证据帖子在本批采集中的表现：每千次浏览互动 ${sd.engagement_rate ?? '—'}（${sd.rate_n ?? 0} 条）· 浏览/粉丝 ${sd.amplification ?? '—'}（${sd.amp_n ?? 0} 条）。是别人帖子的表现，不是对 Kimi 发帖的预测。</p></div>
        <div class="score-row"><header><span>证据强度 <span class="subtle">纯计算</span></span><span><b>${o.evidence_strength ?? '—'}</b> / 100</span></header>
          <div class="bar-track"><div class="bar-fill c-blue" style="width:${o.evidence_strength || 0}%"></div></div>
          <p>${o.authors} 位非品牌作者${o.buckets > 1 ? `，跨 ${o.buckets} 组查询复现` : '，仅单组查询'}。帖子数不等于人数。</p></div></section>
      <section class="detail-section"><h3>KIMI 能力依据</h3><p>${esc(o.capability.description)}</p><a class="text-link" href="${esc(o.capability.url)}" target="_blank" rel="noopener noreferrer">官方能力说明 ↗</a></section>
      <section class="detail-section"><h3>也可能不值得做</h3><p>${esc(o.why_pass)}</p></section>
      <label class="field"><span class="field-label">运营判断</span><textarea id="review-note" rows="2" placeholder="值得做吗？也可以记录暂不采用的原因。">${esc(state.reviews[id]?.note || '')}</textarea></label>
      <div class="actions"><button class="button small" data-action="shortlist">${status === 'shortlist' ? '移出候选' : '加入候选'}</button><button class="button small" data-action="pass">暂不采用</button></div>
    </div></div>
    <div class="detail-cta"><p>下一步：把证据变成可验证的实验</p><div class="actions"><button class="button ghost" data-action="template">用模板起草</button><button class="button pink" data-action="generate">${state.mode === 'sample' ? '体验实验工作流' : '用 Kimi 生成实验'} →</button></div></div>`;
  $('#opportunity-dialog').showModal();
}

/* ---------- view: studio ---------- */
const briefFields = {title:'实验名称', audience:'目标人群', hypothesis:'实验假设', angle:'内容角度', caption:'英文推文 · 方案 A', caption_alt:'英文推文 · 方案 B', prompt:'可复用 Kimi 提示词 · English', demo:'录屏演示步骤', metric:'如何衡量', decision_rule:'下一步决策规则', claim_checks:'发布前的事实检查'};
function field(key, rows = 3){
  const value = draft.brief[key] || '';
  return `<label class="field"><span class="field-label">${briefFields[key]}${['caption','caption_alt','prompt'].includes(key) ? `<button type="button" class="text-button" data-copy="${key}">复制 ↗</button>` : ''}</span>
    <textarea data-field="${key}" rows="${rows}" ${['caption','caption_alt','prompt'].includes(key) ? 'lang="en"' : ''}>${esc(value)}</textarea>
    ${key.startsWith('caption') ? `<small data-count="${key}" class="${[...value].length > 280 ? 'danger-text' : ''}">${[...value].length} / 280 字符 · 仅供编辑参考</small>` : ''}</label>`;
}
function renderStudio(){
  if (!draft) return heading('EXPERIMENT STUDIO', '实验工作室', '把选题变成可复现的 Kimi 工作流，留下每一次验证与迭代。')
    + (state.experiments.length
      ? `<div class="section-heading" style="margin-top:0"><h2>实验记录</h2><span class="subtle">${state.experiments.length} 个 · 本地保存</span></div>
         <div class="experiment-list">${state.experiments.map(e => `<article class="panel"><div class="actions">${modeBadge(e.mode)}<span class="tag ${e.status === 'validated' ? 'green' : e.status === 'failed' ? 'peach' : ''}">${statusLabels[e.status]}</span></div><h3>${esc(e.brief.title)}</h3><p>${esc(e.brief.audience)}</p><div class="actions"><button class="button small" data-experiment="${e.id}">打开实验 →</button><span class="subtle">${date(e.updated_at)}</span></div></article>`).join('')}</div>
         <div class="actions" style="margin-top:16px"><button class="button" data-action="radar">从机会开始 →</button></div>`
      : empty('第一个实验，从一个真实问题开始', '在机会雷达中打开选题，阅读证据，再创建实验。', `<button class="button" data-action="radar">查看机会雷达 →</button>`));
  const b = draft.brief;
  let content = '';
  if (editorTab === 'content') content = field('title', 1) + field('caption', 5) + field('caption_alt', 5) + field('demo', 5);
  if (editorTab === 'workflow') content = field('prompt', 11) + field('claim_checks', 4);
  if (editorTab === 'plan') content = field('audience', 2) + field('hypothesis', 4) + field('angle', 3) + field('metric', 4) + field('decision_rule', 4);
  return heading('EXPERIMENT STUDIO', '让一个好问题，变成一次好实验', '英文内容可直接编辑；实验结果需要人工在 Kimi 中实测后记录。')
  + `<div class="actions" style="margin-bottom:14px"><button class="button" data-action="studio-list">实验列表</button><button class="button" data-action="export">导出简报 ↗</button><button class="button primary" data-action="save">保存实验</button></div>
  <div class="studio-layout"><section>
      <div class="panel"><div class="actions" style="margin-bottom:4px">${modeBadge(draft.mode)}<span class="tag blue">${topics[draft.opportunity.topic] || draft.opportunity.topic}</span><span class="subtle">${esc(b.generation)}</span></div>
        <div class="editor-tabs" aria-label="编辑内容">${[['content','内容文案'],['workflow','Kimi 工作流'],['plan','实验设计']].map(([v,l]) => `<button data-editor-tab="${v}" class="${editorTab === v ? 'active' : ''}" aria-pressed="${editorTab === v}">${l}</button>`).join('')}</div>
        ${content}<span class="pending-text" id="save-state">${dirty ? '有未保存的修改' : '修改后请保存实验'}</span></div>
      <div class="panel" style="margin-top:12px"><h3>这次实验来自哪里</h3><p class="section-caption" style="margin-top:4px">${esc(draft.opportunity.problem)}</p>
        <div class="actions" style="margin-top:10px"><span class="tag yellow">${draft.evidence.length} 条证据快照</span><span class="subtle">${esc(draft.opportunity.title)}</span></div>
        <details class="source-note" style="margin-top:10px"><summary>查看保存的证据快照</summary>${draft.evidence.map(evidenceCard).join('')}</details></div>
    </section><aside>
      <section class="panel"><h3>推文预览</h3><div class="tweet-preview"><header><span class="tweet-avatar">k</span><div>Kimi<small>@${esc(state.config.owned)}</small></div></header><p id="caption-preview" lang="en">${esc(b.caption)}</p></div><p class="section-caption">编辑预览，不会发布到 X。</p></section>
      <section class="panel"><h3>在 Kimi 中验证</h3>
        <a class="button small block" href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer" style="margin:10px 0">打开 Kimi 实测 ↗</a>
        ${[['sources','事实与来源已核对'],['usable','输出可以实际使用'],['repeatable','同一流程可以复现']].map(([v,l]) => `<label class="check"><input type="checkbox" data-check="${v}" ${draft.checks[v] ? 'checked' : ''}>${l}</label>`).join('')}
        <label class="field" style="margin-top:10px"><span class="field-label">验证状态</span><select id="experiment-status">${Object.entries(statusLabels).map(([v,l]) => `<option value="${v}" ${draft.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">测试结果与下一步</span><textarea id="experiment-notes" rows="5" placeholder="用了什么输入？哪里成功或失败？下一轮改什么？">${esc(draft.notes)}</textarea></label>
        <div class="hint">标记「已验证」需要完成三项检查，并记录实际结果。</div></section>
    </aside></div>`;
}

/* ---------- per-page event binding ---------- */
function bindPage(){
  const form = $('#sources-form');
  if (form){
    const liveEst = () => {
      const fd = new FormData(form);
      const c = {
        queries: fd.get('queries').split('\n').map(s => s.trim()).filter(Boolean),
        accounts: fd.get('accounts').split('\n').map(s => s.trim()).filter(Boolean),
        pages: Number(fd.get('pages')) || 2,
        collect_accounts: fd.get('collect_accounts') === 'on',
        replies: fd.get('replies') === 'on'
      };
      const est = estimateRequests(c);
      const el = $('#live-est');
      if (el) el.innerHTML = est.total > 200
        ? `预计 <b>≈ ${est.total}</b> 次请求 · 超过 200 上限，请减少页数或来源`
        : `预计 <b>≈ ${est.total}</b> 次请求 · ${est.sources} 个来源 × ${c.pages} 页`;
    };
    form.addEventListener('input', liveEst);
    liveEst();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const start = new Date(fd.get('range_start') + 'T00:00:00Z');
      const end = new Date(fd.get('range_end') + 'T00:00:00Z');
      if (!(start < end)){ toast('开始日期需要早于结束日期。', true); return; }
      const window_days = Math.round((end - start) / DAY);
      if (window_days > 90){ toast('日期范围最长 90 天。', true); return; }
      const config = {
        owned: fd.get('owned'),
        accounts: fd.get('accounts').split('\n').map(s => s.trim()).filter(Boolean),
        queries: fd.get('queries').split('\n').map(s => s.trim()).filter(Boolean),
        pages: Number(fd.get('pages')),
        window_days,
        query_type: fd.get('query_type'),
        slice_days: 0,
        collect_accounts: fd.get('collect_accounts') === 'on',
        replies: fd.get('replies') === 'on',
        weights: state.config.weights
      };
      await runBusy(e.submitter, async () => {
        await api('config', config);
        await load();
        toast('设置已保存；新关键词需重新采集。');
      });
    });
  }
  $$('[data-field]').forEach(el => el.addEventListener('input', () => {
    draft.brief[el.dataset.field] = el.value;
    markDirty();
    if (el.dataset.field === 'caption' && $('#caption-preview')) $('#caption-preview').textContent = el.value;
    const count = $(`[data-count="${el.dataset.field}"]`);
    if (count){
      const n = [...el.value].length;
      count.textContent = `${n} / 280 字符 · 仅供编辑参考`;
      count.classList.toggle('danger-text', n > 280);
    }
  }));
  $$('[data-check]').forEach(el => el.addEventListener('change', () => { draft.checks[el.dataset.check] = el.checked; markDirty(); }));
  $('#experiment-status')?.addEventListener('change', e => { draft.status = e.target.value; markDirty(); });
  $('#experiment-notes')?.addEventListener('input', e => { draft.notes = e.target.value; markDirty(); });
}
function markDirty(){ dirty = true; if ($('#save-state')) $('#save-state').textContent = '有未保存的修改'; }

async function runBusy(button, fn, busyText = '处理中…'){
  if (button?.disabled) return;
  const text = button?.textContent;
  if (button){ button.disabled = true; button.textContent = busyText; }
  try { await fn(); }
  catch (e){ toast(e.message, true); }
  finally { if (button?.isConnected){ button.disabled = false; button.textContent = text; } }
}

async function buildDraft(template, button){
  await runBusy(button, async () => {
    const o = state.opportunities.find(o => o.id === selected);
    if (!o) throw new Error('请重新选择机会。');
    const result = await api('generate', {id: selected, template});
    draft = {
      brief: result.brief,
      opportunity: structuredClone(o),
      evidence: state.dataset.tweets.filter(t => o.evidence_ids.includes(t.id)),
      mode: state.mode,
      checks: {sources:false, usable:false, repeatable:false},
      status: 'draft', notes: '', id: null
    };
    dirty = false;
    $('#opportunity-dialog').close();
    page = 'studio'; editorTab = 'content';
    history.replaceState(null, '', '#studio');
    updateChrome(); renderPage();
    dirty = true; markDirty();
    if (result.warnings?.length) toast(result.warnings.join(' '), true);
    else toast(template || state.mode === 'sample' ? '已生成可编辑模板；尚未运行 Kimi 实测。' : 'Kimi 已生成实验草稿，请审阅事实与文案。');
  }, template ? '生成中…' : 'Kimi 生成中，最长约两分钟…');
}

async function saveExperiment(button){
  await runBusy(button, async () => {
    if (!draft) throw new Error('请先选择一个机会。');
    const result = await api('experiment', {
      experiment_id: draft.id, opportunity_id: draft.opportunity.id,
      brief: draft.brief, checks: draft.checks, status: draft.status, notes: draft.notes
    });
    draft.id = result.experiment.id;
    dirty = false;
    await load(false);
    if ($('#save-state')) $('#save-state').textContent = '已保存 · ' + date(result.experiment.updated_at);
    toast('实验与证据快照已保存。');
  });
}

function exportBrief(){
  if (!draft) return;
  const b = draft.brief;
  let text = `# ${b.title}\n\n数据来源：${draft.mode === 'sample' ? '演示样本（非真实推文）' : '真实采集'}\n状态：${statusLabels[draft.status]}\n生成方式：${b.generation}\n\n`;
  for (const [k, label] of Object.entries(briefFields)) if (k !== 'title') text += `## ${label}\n\n${b[k]}\n\n`;
  text += `## 实测记录\n\n${draft.notes || '尚无记录'}\n\n`;
  for (const [k, label] of [['sources','来源已核对'],['usable','输出可用'],['repeatable','流程可复现']]) text += `- [${draft.checks[k] ? 'x' : ' '}] ${label}\n`;
  text += '\n## 原始证据\n\n';
  draft.evidence.forEach(t => text += `- ${t.sample ? '[模拟内容] ' : ''}@${t.handle}: ${t.text}\n  ${t.url || '无真实原帖'}\n\n`);
  const blob = new Blob([text], {type:'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kimi-experiment-' + new Date().toISOString().slice(0,10) + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('实验简报已导出。');
}

/* ---------- global events ---------- */
document.addEventListener('click', async e => {
  const button = e.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.page){ await navigate(button.dataset.page); return; }
  if (button.dataset.filter){ filter = button.dataset.filter; renderPage(); return; }
  if (button.dataset.view){ radarView = button.dataset.view; renderPage(); return; }
  if (button.dataset.open){ openOpportunity(button.dataset.open); return; }
  if (button.dataset.editorTab){ editorTab = button.dataset.editorTab; renderPage(); return; }
  if (button.dataset.experiment){
    if (!(await canLeave())) return;
    const x = state.experiments.find(x => x.id === button.dataset.experiment);
    draft = structuredClone(x); dirty = false;
    page = 'studio'; editorTab = 'content';
    updateChrome(); renderPage(); return;
  }
  if (button.dataset.copy){
    try { await navigator.clipboard.writeText(draft.brief[button.dataset.copy]); toast('已复制。'); }
    catch { toast('复制未成功，请选中文本手动复制。', true); }
    return;
  }
  if (button.dataset.mode){
    await runBusy(button, async () => { await api('mode', {mode: button.dataset.mode}); await load(); toast('数据模式已切换。'); });
    return;
  }
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'radar'){ if ($('#opportunity-dialog').open) $('#opportunity-dialog').close(); await navigate('radar'); return; }
  if (action === 'close-detail'){ $('#opportunity-dialog').close(); return; }
  if (action === 'generate' || action === 'template'){ await buildDraft(action === 'template', button); return; }
  if (action === 'save'){ await saveExperiment(button); return; }
  if (action === 'export'){ exportBrief(); return; }
  if (action === 'reload' || button.id === 'refresh-state'){
    await runBusy(button, async () => { await load(!dirty); toast('连接状态已刷新。'); }); return;
  }
  if (action === 'studio-list'){ if (await canLeave()){ draft = null; dirty = false; renderPage(); } return; }
  if (action === 'scan'){
    await runBusy(button, async () => {
      await api('scan', {});
      await load(!dirty);
      poll();
      toast('开始采集与分析；进度见左下角。');
    }, '启动中…'); return;
  }
  if (action === 'analyze'){
    await runBusy(button, async () => {
      await api('analyze', {});
      await load(!dirty);
      poll();
      toast('Kimi 正在重新分析已缓存的帖子。');
    }, '启动中…'); return;
  }
  if (action === 'shortlist' || action === 'pass'){
    await runBusy(button, async () => {
      const status = action === 'pass' ? 'pass' : reviewStatus(selected) === 'shortlist' ? 'new' : 'shortlist';
      await api('review', {id: selected, status, note: $('#review-note').value});
      await load(false);
      $('#opportunity-dialog').close();
      renderPage();
      toast(status === 'pass' ? '已记录暂不采用的原因。' : '候选状态已更新。');
    });
  }
});

$('#global-search').addEventListener('input', async e => {
  search = e.target.value;
  if (page !== 'radar'){ await navigate('radar'); }
  else renderPage();
});
$('#opportunity-dialog').addEventListener('click', e => {
  if (e.target === $('#opportunity-dialog')){
    const r = e.target.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
  }
});
window.addEventListener('beforeunload', e => { if (dirty){ e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (labels[next]) navigate(next); });

(async () => {
  try {
    const hash = location.hash.slice(1);
    if (labels[hash]) page = hash;
    await load();
  } catch (e){
    $('#main').innerHTML = empty('本地服务暂时不可用', '请确认已运行 python3 kimi-radar/server.py --port 3477，再刷新页面。');
    toast(e.message, true);
  }
})();
