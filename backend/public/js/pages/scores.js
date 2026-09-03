// ===== 乐谱管理（自定义页面）=====
// 支持：一次多文件上传、分谱多声部、总谱强制无声部、按乐谱名+声部联合搜索、打包下载

const SCORE_SECTIONS = ['民族管乐声部','弹拨一组','弹拨二组','胡琴声部','提琴声部','西洋木管声部','西洋铜管声部','低音声部','钢琴声部','打击声部','无声部'];

let _scoreFilters = { title: '', section: '', isTotal: '', page: 1 };
const _scoreLimit = 20;
// 批量删除：选中集合 与 当前页所有乐谱ID
let _selected = new Set();
let _currentPageIds = [];

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadScores();
  });
});

// 加载乐谱列表（读取搜索框当前值，联合搜索）
async function loadScores() {
  const el = document.getElementById('page-scores');
  _selected.clear();
  _currentPageIds = [];
  const t = document.getElementById('sf-scores-title');
  const s = document.getElementById('sf-scores-section');
  const it = document.getElementById('sf-scores-isTotal');
  if (t) _scoreFilters.title = t.value;
  if (s) _scoreFilters.section = s.value;
  if (it) _scoreFilters.isTotal = it.value;

  const q = {};
  if (_scoreFilters.title) q.title = _scoreFilters.title;
  if (_scoreFilters.section) q.section = _scoreFilters.section;
  if (_scoreFilters.isTotal) q.isTotal = _scoreFilters.isTotal;
  q.page = _scoreFilters.page;
  q.limit = _scoreLimit;
  const qs = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  const res = await api('/scores?' + qs);
  if (!res.success) { el.innerHTML = '<p>加载失败</p>'; return; }

  let html = buildScoresToolbar();
  html += '<div class="table-wrap">' + buildScoresTable(res.data || []) + '</div>';
  html += buildScoresPagination(res.total, res.limit);
  el.innerHTML = html;
}

function buildScoresToolbar() {
  const secOptions = SCORE_SECTIONS.map(s => `<option value="${s}" ${_scoreFilters.section === s ? 'selected' : ''}>${s}</option>`).join('');
  let html = `<div class="toolbar">
    <input id="sf-scores-title" placeholder="乐谱名" value="${escHtml(_scoreFilters.title)}" onkeydown="if(event.key==='Enter')scoreSearch()">
    <select id="sf-scores-section" onchange="scoreSearch()"><option value="">声部</option>${secOptions}</select>
    <select id="sf-scores-isTotal" onchange="scoreSearch()"><option value="">类型</option><option value="0" ${_scoreFilters.isTotal === '0' ? 'selected' : ''}>分谱</option><option value="1" ${_scoreFilters.isTotal === '1' ? 'selected' : ''}>总谱</option></select>
    <button onclick="scoreSearch()">🔍 搜索</button>
    <button class="btn-download" onclick="exportScores()">📦 打包下载</button>
    <span id="selected-count" style="font-size:13px;color:#e94560;font-weight:600"></span>
    <button id="btn-del-selected" class="btn-del" onclick="deleteSelected()" disabled>🗑 全部删除</button>`;
  if (canAdd('scores')) html += `<button class="btn-green" onclick="showScoreForm()">＋ 新增</button>`;
  html += '</div>';
  return html;
}

// 搜索：重置到第 1 页
function scoreSearch() {
  _scoreFilters.page = 1;
  loadScores();
}

function buildScoresTable(list) {
  _currentPageIds = (list || []).map(r => r.scoreId);
  if (!list || !list.length) return '<p style="padding:20px;text-align:center;color:#999">暂无乐谱</p>';
  const allOn = list.every(r => _selected.has(r.scoreId));
  let html = '<table><tr><th style="width:34px"><input type="checkbox" id="chk-all" ' + (allOn ? 'checked' : '') + ' onchange="toggleSelectAll(this)"></th><th>ID</th><th>乐谱名</th><th>类型</th><th>声部</th><th>PDF</th><th>操作</th></tr>';
  list.forEach(r => {
    const canOp = canOperateRow('scores', r);
    const sec = r.isTotal == 1 ? '—' : String(r.section || '').split(',').filter(Boolean).join('、');
    html += `<tr>
      <td><input type="checkbox" class="row-chk" data-id="${r.scoreId}" ${_selected.has(r.scoreId) ? 'checked' : ''} onchange="toggleScoreSelect(this)"></td>
      <td>${r.scoreId}</td>
      <td>${escHtml(r.title)}</td>
      <td>${r.isTotal == 1 ? '总谱' : '分谱'}</td>
      <td>${sec}</td>
      <td>${r.filehash ? `<a href="/api/scores/${r.scoreId}/file" target="_blank" class="btn" style="padding:2px 10px;font-size:12px;background:#1890ff">📄 预览</a>` : '<span style="color:#999">无文件</span>'}</td>
      <td class="actions">
        ${canOp ? `<button class="btn-edit" onclick="showScoreForm(${r.scoreId})">编辑</button>` : ''}
        ${canOp ? `<button class="btn-del" onclick="delScore(${r.scoreId})">删除</button>` : ''}
      </td></tr>`;
  });
  html += '</table>';
  return html;
}

function buildScoresPagination(total, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  const p = _scoreFilters.page;
  return `<div class="pagination"><span>共 ${total} 条</span>
    <div><button onclick="scorePage(${p - 1})" ${p <= 1 ? 'disabled' : ''}>上一页</button>
    <span style="margin:0 12px">${p}/${totalPages}</span>
    <button onclick="scorePage(${p + 1})" ${p >= totalPages ? 'disabled' : ''}>下一页</button></div></div>`;
}

function scorePage(p) {
  _scoreFilters.page = p;
  loadScores();
}

// 打包下载：按当前搜索条件下载 zip
function exportScores() {
  const t = document.getElementById('sf-scores-title');
  const s = document.getElementById('sf-scores-section');
  const it = document.getElementById('sf-scores-isTotal');
  const title = t ? t.value : _scoreFilters.title;
  const section = s ? s.value : _scoreFilters.section;
  const isTotal = it ? it.value : _scoreFilters.isTotal;
  const q = [];
  if (title) q.push('title=' + encodeURIComponent(title));
  if (section) q.push('section=' + encodeURIComponent(section));
  if (isTotal) q.push('isTotal=' + isTotal);
  const url = '/api/scores/export?' + q.join('&');
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 待上传文件列表（新增时支持增删特定文件 / 文件夹）
let _pendingFiles = []; // [{ id, file }]
let _pendingId = 0;

// 新增/编辑表单
async function showScoreForm(id) {
  const isEdit = !!id;
  _pendingFiles = [];
  let data = null;
  if (isEdit) {
    const res = await api('/scores/' + id);
    if (!res.success) { showToast('加载失败', 'error'); return; }
    data = res.data;
  }
  const r = meRole();
  const sectionLeader = r.isSectionLeader && !r.isManager;

  const isTotalVal = data ? data.isTotal : 0;
  const secList = data ? String(data.section || '').split(',').map(s => s.trim()).filter(Boolean) : [];

  const secCheckboxes = SCORE_SECTIONS.map(s =>
    `<label><input type="checkbox" class="sec-chk" value="${s}" ${secList.includes(s) ? 'checked' : ''}>${s}</label>`
  ).join('');

  let html = `<h2>${isEdit ? '编辑' : '新增'}乐谱</h2><form id="form">
    <div class="form-group"><label>类型 *</label>
      <select id="f-isTotal" onchange="toggleScoreSectionUI()">
        <option value="0" ${String(isTotalVal) === '0' ? 'selected' : ''}>分谱</option>
        <option value="1" ${String(isTotalVal) === '1' ? 'selected' : ''}>总谱</option>
      </select>
    </div>
    <div class="form-group" id="fg-score-section"><label>所属声部（可多选）</label>
      <div class="sec-list">${secCheckboxes}</div>
      <div style="font-size:12px;color:#888;margin-top:2px">分谱可选多个声部；总谱不可选声部</div></div>`;

  if (!isEdit) {
    html += `<div class="form-group"><label>PDF 文件 *（文件名将作为乐谱名）</label>
      <div class="score-file-actions">
        <button type="button" class="btn" onclick="document.getElementById('f-files').click()">📁 选择文件</button>
        <button type="button" class="btn" onclick="document.getElementById('f-dir').click()">📂 选择文件夹</button>
        <input type="file" id="f-files" accept=".pdf" multiple style="display:none" onchange="addScoreFiles(this)">
        <input type="file" id="f-dir" webkitdirectory multiple style="display:none" onchange="addScoreDir(this)">
      </div>
      <div id="score-file-list" style="margin-top:8px"></div>
      <div style="font-size:12px;color:#888;margin-top:4px">可多次添加、也可删除列表中特定文件；选文件夹会上传其中及子目录的所有 PDF</div></div>`;
  } else {
    html += `<div class="form-group"><label>乐谱名</label><input id="f-title" type="text" value="${escHtml(data ? data.title : '')}"></div>
      <div class="form-group"><label>替换 PDF 文件（可选，不选则保留原文件）</label><input id="f-files" type="file" accept=".pdf"></div>`;
  }

  html += `</form><div class="form-actions">
    <button class="btn-cancel" onclick="closeModal()">取消</button>
    <button class="btn-green" onclick="submitScore(${isEdit ? id : ''})">${isEdit ? '保存' : '创建'}</button>
  </div>`;
  openModal(html);
  toggleScoreSectionUI();
  if (!isEdit) renderScoreFileList();

  // 声部长新增：锁定为分谱 + 本声部
  if (!isEdit && sectionLeader) {
    const totalSel = document.getElementById('f-isTotal');
    if (totalSel) { totalSel.value = '0'; totalSel.disabled = true; }
    const mySec = scoreSectionName(r.section);
    document.querySelectorAll('.sec-chk').forEach(c => {
      if (c.value !== mySec) { c.checked = false; c.disabled = true; }
      else c.checked = true;
    });
    toggleScoreSectionUI();
  }
}

// 添加文件到待上传列表
function addScoreFiles(input) {
  if (!input || !input.files) return;
  for (const f of input.files) _pendingFiles.push({ id: ++_pendingId, file: f });
  renderScoreFileList();
  input.value = '';
}

// 添加文件夹（含子目录）中的 PDF
function addScoreDir(input) {
  if (!input || !input.files) return;
  let added = 0;
  for (const f of input.files) {
    if (!/\.pdf$/i.test(f.name || '')) continue; // 仅 PDF
    _pendingFiles.push({ id: ++_pendingId, file: f });
    added++;
  }
  if (added === 0) showToast('所选目录中没有 PDF 文件', 'error');
  renderScoreFileList();
  input.value = '';
}

// 删除待上传列表中的特定文件
function removeScoreFile(id) {
  _pendingFiles = _pendingFiles.filter(x => x.id !== id);
  renderScoreFileList();
}

function renderScoreFileList() {
  const el = document.getElementById('score-file-list');
  if (!el) return;
  if (!_pendingFiles.length) {
    el.innerHTML = '<div style="font-size:13px;color:#999">尚未选择文件</div>';
    return;
  }
  el.innerHTML = _pendingFiles.map(x => {
    const display = x.file.webkitRelativePath || x.file.name;
    return `<div class="score-file-item"><span title="${escHtml(display)}">${escHtml(display)}</span>
      <button type="button" class="btn-del" onclick="removeScoreFile(${x.id})">✕</button></div>`;
  }).join('');
}

// 总谱时隐藏声部选择（修复“总谱带声部”bug 的界面侧）
function toggleScoreSectionUI() {
  const t = document.getElementById('f-isTotal');
  const row = document.getElementById('fg-score-section');
  if (t && row) row.style.display = t.value === '1' ? 'none' : '';
}

// 提交（新增：文件列表多文件上传，乐谱名=文件名；编辑：可选改名 + 可选替换文件）
async function submitScore(id) {
  if (window._submitting) return;
  const isTotal = document.getElementById('f-isTotal').value;
  const secs = Array.from(document.querySelectorAll('.sec-chk:checked')).map(c => c.value);
  const isEdit = !!id;

  if (!isEdit) {
    if (!_pendingFiles.length) { showToast('请选择至少一个 PDF 文件', 'error'); return; }
    window._submitting = true;
    const fd = new FormData();
    for (const x of _pendingFiles) fd.append('files', x.file);
    fd.append('isTotal', isTotal);
    // 总谱强制无声部；分谱提交多声部
    if (isTotal === '0') secs.forEach(s => fd.append('sections', s));
    const res = await fetch('/api/scores/upload', { method: 'POST', body: fd }).then(r => r.json());
    window._submitting = false;
    if (res.success) { showToast(res.message); closeModal(); loadScores(); }
    else showToast(res.message, 'error');
    return;
  }

  // 编辑：可选改名 + 更新元信息 + 可选替换文件
  const titleEl = document.getElementById('f-title');
  const title = titleEl ? titleEl.value.trim() : '';
  const fileEl = document.getElementById('f-files');
  const files = fileEl ? fileEl.files : null;
  window._submitting = true;
  const body = { isTotal: parseInt(isTotal) };
  if (title) body.title = title;
  body.section = isTotal === '1' ? '' : secs.join(','); // 总谱强制无声部
  const res = await api('/scores/' + id, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.success) { showToast(res.message, 'error'); window._submitting = false; return; }
  if (files && files.length > 0) {
    const fd = new FormData();
    fd.append('file', files[0]);
    const fres = await fetch('/api/scores/' + id + '/file', { method: 'PUT', body: fd }).then(r => r.json());
    if (!fres.success) { showToast(fres.message, 'error'); window._submitting = false; return; }
  }
  window._submitting = false;
  showToast('已更新');
  closeModal();
  loadScores();
}

// ===== 批量选择与全部删除 =====
// 单行复选框：勾选/取消该项（仅影响“全部删除”的选中集合）
function toggleScoreSelect(cb) {
  const id = Number(cb.dataset.id);
  if (cb.checked) _selected.add(id); else _selected.delete(id);
  updateSelectionUI();
}
// 表头复选框：全选 / 取消全选 当前页
function toggleSelectAll(cb) {
  if (cb.checked) _currentPageIds.forEach(id => _selected.add(id));
  else _currentPageIds.forEach(id => _selected.delete(id));
  document.querySelectorAll('.row-chk').forEach(c => { c.checked = cb.checked; });
  updateSelectionUI();
}
function updateSelectionUI() {
  const btn = document.getElementById('btn-del-selected');
  const cnt = document.getElementById('selected-count');
  if (btn) btn.disabled = _selected.size === 0;
  if (cnt) cnt.textContent = _selected.size ? `已选 ${_selected.size} 项` : '';
}
// 全部删除：仅当点击顶部“全部删除”按钮时，删除所有已选中项
async function deleteSelected() {
  const ids = Array.from(_selected);
  if (!ids.length) return;
  if (!confirm(`确认删除选中的 ${ids.length} 份乐谱？删除后不可恢复。`)) return;
  if (window._submitting) return;
  window._submitting = true;
  let ok = 0, fail = 0;
  for (const id of ids) {
    const res = await api('/scores/' + id, { method: 'DELETE' });
    if (res.success) ok++; else fail++;
  }
  window._submitting = false;
  _selected.clear();
  showToast(fail ? `已删除 ${ok} 份，${fail} 份失败` : `已删除 ${ok} 份乐谱`);
  loadScores();
}

// 删除单个乐谱（无论是否被选中，都只删除这一条）
async function delScore(id) {
  if (!confirm('确认删除该乐谱？')) return;
  const res = await api('/scores/' + id, { method: 'DELETE' });
  if (res.success) { showToast('已删除'); loadScores(); }
  else showToast(res.message, 'error');
}

