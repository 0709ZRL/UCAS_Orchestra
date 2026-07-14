// DOM shortcuts
function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }

// HTML转义
function escHtml(s) {
  return String(s).replace(/[&<>]/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m] || m;
  });
}

// Toast 提示
function showToast(msg, type='success') {
  const t = $('#toast');
  t.innerHTML = `<div class="toast ${type}">${msg}</div>`;
  setTimeout(() => t.innerHTML = '', 3000);
}

// 模态框
function openModal(html) {
  $('#modal').classList.add('active');
  $('#modalBody').innerHTML = html;
}
function closeModal() {
  $('#modal').classList.remove('active');
}

// 点击模态框背景关闭
document.addEventListener('DOMContentLoaded', () => {
  const m = document.getElementById('modal');
  if (m) m.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
});

// Lightbox 图片预览
function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.getElementById('lightboxImg').src = '';
}

// 侧栏切换（移动端）
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

// API 请求
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return r.json();
}

// 全局联动
function toggleManagerJob() {
  const el = document.getElementById('f-isManager');
  const row = document.getElementById('fg-managerJob');
  if (el && row) row.style.display = el.value === '1' ? '' : 'none';
}
function toggleOwner() {
  const el = document.getElementById('f-isPublic');
  const row = document.getElementById('fg-belongsToId');
  if (el && row) row.style.display = el.value === '0' ? '' : 'none';
}
function toggleScoreSection() {
  const el = document.getElementById('f-isTotal');
  const row = document.getElementById('fg-section');
  if (el && row) row.style.display = el.value === '1' ? 'none' : '';
}
function syncEndTimeMin() {
  const st = document.getElementById('f-startTime');
  const et = document.getElementById('f-endTime');
  if (st && et) { et.min = st.value; }
}

// 通用分页状态
const state = {
  persons: { page: 1 },
  events: { page: 1 },
  scores: { page: 1 },
  logistics: { page: 1 },
  articles: { page: 1 }
};

// 构建工具栏
function buildToolbar(page, searchFields) {
  let html = '<div class="toolbar">';
  searchFields.forEach(f => {
    if (f.type === 'select') {
      html += `<select id="sf-${page}-${f.key}" onchange="loadPage('${page}')"><option value="">${f.label}</option>`;
      f.options.forEach(o => html += `<option value="${o.v}">${o.t}</option>`);
      html += `</select>`;
    } else {
      html += `<input id="sf-${page}-${f.key}" placeholder="${f.label}" onkeydown="if(event.key==='Enter')loadPage('${page}')">`;
    }
  });
  html += `<button onclick="loadPage('${page}')">🔍 搜索</button>`;
  html += `<button class="btn-green" onclick="showForm('${page}')">＋ 新增</button>`;
  html += `</div>`;
  return html;
}

// 构建表格
function buildTable(data, columns, fieldLookup) {
  if (!data || !data.length) return '<p style="padding:20px;text-align:center;color:#999">暂无数据</p>';
  let html = '<table><tr>' + columns.map(c => `<th>${c.label}</th>`).join('') + '<th>操作</th></tr>';
  data.forEach(row => {
    html += '<tr>' + columns.map(c => {
      if (c.render) return `<td>${c.render(row, fieldLookup)}</td>`;
      let v = row[c.key];
      if (v === null || v === undefined) v = '';
      if (c.key === 'isTotal') v = v == 1 ? '总谱' : '分谱';
      if (c.key === 'isPublic') v = v == 1 ? '公用' : '私有';
      if (fieldLookup && fieldLookup[c.key]) {
        const opt = fieldLookup[c.key].find(o => String(o.v) === String(v));
        if (opt) v = opt.t;
      }
      return `<td>${v}</td>`;
    }).join('') + `<td class="actions">
      <button class="btn-edit" onclick="showForm('${columns[0]._page}',${JSON.stringify(row).replace(/"/g,"'")})">编辑</button>
      <button class="btn-del" onclick="delRow('${columns[0]._page}','${row[columns.find(c=>c._id).key]}')">删除</button>
    </td></tr>`;
  });
  html += '</table>';
  return html;
}

// 构建分页
function buildPagination(page, total, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  const p = state[page] ? state[page].page : 1;
  return `<div class="pagination"><span>共 ${total} 条</span>
    <div><button onclick="goPage('${page}',${p-1})" ${p<=1?'disabled':''}>上一页</button>
    <span style="margin:0 12px">${p}/${totalPages}</span>
    <button onclick="goPage('${page}',${p+1})" ${p>=totalPages?'disabled':''}>下一页</button></div></div>`;
}

function goPage(page, p) {
  if (!state[page]) state[page] = { page: 1 };
  state[page].page = p;
  loadPage(page);
}

// 通用页面加载
async function loadPage(page) {
  const el = document.getElementById('page-' + page);
  if (!el) return;

  const search = {};
  (fields[page] || []).forEach(f => {
    const inp = document.getElementById('sf-' + page + '-' + f.key);
    if (inp && inp.value) search[f.key] = inp.value;
  });
  if (!state[page]) state[page] = { page: 1 };
  search.page = state[page].page;
  search.limit = 20;
  const qs = Object.entries(search).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await api('/' + page + '?' + qs);
  if (!res.success) { el.innerHTML = '<p>加载失败</p>'; return; }

  let html = '';
  const cols = getColumnConfig(page).map(c => ({ ...c, _page: page, _id: c.key === getIdKey(page) }));
  cols[0]._id = true;

  const searchFields = getSearchFields(page);

  let fieldLookup = null;
  const lookupPages = { persons: true, logistics: true, articles: true };
  if (lookupPages[page]) {
    fieldLookup = {};
    fields[page].forEach(f => {
      if (f.options) fieldLookup[f.key] = f.options;
    });
  }

  html += buildToolbar(page, searchFields);
  html += '<div class="table-wrap">' + buildTable(res.data, cols, fieldLookup) + '</div>';
  html += buildPagination(page, res.total, res.limit);
  el.innerHTML = html;
}

// 通用提交
async function submitForm(page, id) {
  if (window._submitting) return;
  window._submitting = true;
  const release = () => { window._submitting = false };
  const flds = fields[page];
  const body = {};
  const formData = new FormData();
  let hasFile = false, valid = true;
  // section 仅在 persons 等页面为整数，scores 中为字符串
  const intKeys = ['gender','campus','job','isManager','managerJob','isMaster','isTotal','isPublic','year','month','date'];
  const stringSectionPages = { scores: true };

  flds.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (!el || f.readonly) return;
    if (el.closest && el.closest('.form-group') && el.closest('.form-group').style.display === 'none') return;
    if (f.type === 'file') {
      if (el.files && el.files[0]) { formData.append(f.key, el.files[0]); hasFile = true; }
      return;
    }
    const val = el.value;
    if (f.required && !val) { valid = false; release(); return; }
    if (stringSectionPages[page] && f.key === 'section') {
      body[f.key] = val || '';
    } else if (intKeys.includes(f.key)) {
      body[f.key] = parseInt(val || 0);
    } else if (f.type === 'number') {
      body[f.key] = val ? parseInt(val) : null;
    } else {
      body[f.key] = val || null;
    }
  });
  if (!valid) { showToast('请填写所有必填项', 'error'); release(); return; }
  if (body.isManager === 0) body.managerJob = 0;
  if (page === 'events' && body.startTime && body.endTime && body.startTime >= body.endTime) {
    showToast('起始时间必须早于结束时间', 'error'); release(); return;
  }

  const isEdit = !!id;
  try {
    // 文章图片多文件上传特殊处理
    if (page === 'articles') {
      const fileEl = document.getElementById('f-images');
      const existing = document.getElementById('f-images-hidden')?.value || '';
      let filenames = existing ? existing.split(',').filter(Boolean) : [];
      if (fileEl && fileEl.files && fileEl.files.length > 0) {
        for (const file of fileEl.files) {
          const fd = new FormData();
          fd.append('image', file);
          const res = await fetch('/api/articles/upload-image', { method: 'POST', body: fd });
          const data = await res.json();
          if (data.success) filenames.push(data.filename);
        }
      }
      body.images = filenames.join(',') || null;
      if (isEdit) {
        const res = await api('/' + page + '/' + id, { method: 'PUT', body: JSON.stringify(body) });
        if (!res.success) { showToast(res.message, 'error'); release(); return; }
      } else {
        const res = await api('/' + page, { method: 'POST', body: JSON.stringify(body) });
        if (!res.success) { showToast(res.message, 'error'); release(); return; }
      }
    } else if (hasFile) {
      // 编辑乐谱时替换文件 → PUT 到 file-replace 端点
      if (isEdit && page === 'scores') {
        Object.entries(body).forEach(([k, v]) => formData.append(k, v));
        const res = await fetch('/api/scores/' + id + '/file', { method: 'PUT', body: formData });
        const data = await res.json();
        if (!data.success) { showToast(data.message, 'error'); release(); return; }
      } else {
        Object.entries(body).forEach(([k, v]) => formData.append(k, v));
        const res = await fetch('/api/' + page + '/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) { showToast(data.message, 'error'); release(); return; }
      }
    } else if (isEdit) {
      const res = await api('/' + page + '/' + id, { method: 'PUT', body: JSON.stringify(body) });
      if (!res.success) { showToast(res.message, 'error'); release(); return; }
    } else {
      const res = await api('/' + page, { method: 'POST', body: JSON.stringify(body) });
      if (!res.success) { showToast(res.message, 'error'); release(); return; }
    }
    showToast(isEdit ? '更新成功' : '创建成功');
    closeModal();
    loadPage(page);
  } catch (e) { showToast('操作失败', 'error'); }
  release();
}

// 通用删除
async function delRow(page, id) {
  if (!confirm('确认删除该记录？')) return;
  const res = await api('/' + page + '/' + id, { method: 'DELETE' });
  if (res.success) { showToast('已删除'); loadPage(page); }
  else showToast(res.message, 'error');
}

// 通用表单展示
function showForm(page, data) {
  const isEdit = !!data;
  const flds = fields[page];

  let html = `<h2>${isEdit ? '编辑' : '新增'}${getPageLabel(page)}</h2><form id="form">`;
  let rows = [];
  let nowStr = '', now3hStr = '';
  if (page === 'events' && !isEdit) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const n3 = new Date(now.getTime() + 3 * 3600000);
    now3hStr = `${n3.getFullYear()}-${pad(n3.getMonth()+1)}-${pad(n3.getDate())}T${pad(n3.getHours())}:${pad(n3.getMinutes())}`;
  }
  let toggleAfterOpen = null;
  if (page === 'persons') toggleAfterOpen = 'toggleManagerJob';
  else if (page === 'logistics') toggleAfterOpen = 'toggleOwner';
  else if (page === 'events') toggleAfterOpen = 'syncEndTimeMin';
  else if (page === 'scores') toggleAfterOpen = 'toggleScoreSection';

  flds.forEach((f, i) => {
    if (!isEdit && f.readonly) return;
    let defaultVal = f.default !== undefined ? f.default : '';
    if (page === 'events' && !isEdit) {
      if (f.key === 'startTime') defaultVal = nowStr;
      if (f.key === 'endTime') defaultVal = now3hStr;
      if (f.key === 'title' && !defaultVal) defaultVal = '乐团活动';
    }
    const val = isEdit ? data[f.key] : defaultVal;
    let inp;
    if (f.readonly) {
      inp = `<input id="f-${f.key}" type="text" value="${val||''}" readonly style="background:#f5f5f5">`;
    } else if (f.type === 'file') {
      // 编辑乐谱时允许替换文件
      if (isEdit && page !== 'scores' && page !== 'articles') return;
      const placeholder = (isEdit && page !== 'articles') ? ' (不选则保留原文件)' : '';
      const multipleAttr = f.multiple ? ' multiple' : '';
      inp = `<input id="f-${f.key}" type="file" accept="${f.accept||''}"${multipleAttr}>`;
      if (f.multiple && page === 'articles') {
        inp += `<input id="f-images-hidden" type="hidden" value="${isEdit && data && data.images ? data.images : ''}">`;
        inp += `<div id="f-images-preview" style="font-size:12px;color:#888;margin-top:4px">${isEdit && data && data.images ? '已有 ' + data.images.split(',').length + ' 张图片，上传新图片将追加' : '支持多选图片'}</div>`;
      }
    } else if (f.type === 'textarea') {
      inp = `<textarea id="f-${f.key}">${val||''}</textarea>`;
    } else if (f.type === 'select') {
      let extra = '';
      if (page === 'persons' && f.key === 'isManager') extra = ' onchange="toggleManagerJob()"';
      if (page === 'logistics' && f.key === 'isPublic') extra = ' onchange="toggleOwner()"';
      if (page === 'events' && f.key === 'startTime') extra = ' onchange="syncEndTimeMin()"';
      if (page === 'scores' && f.key === 'isTotal') extra = ' onchange="toggleScoreSection()"';
      inp = `<select id="f-${f.key}"${extra}>${f.options.map(o => `<option value="${o.v}" ${String(val)==String(o.v)?'selected':''}>${o.t}</option>`).join('')}</select>`;
    } else {
      inp = `<input id="f-${f.key}" type="${f.type||'text'}" value="${val||''}" ${f.required?'required':''}>`;
    }
    rows.push({ key: f.key, label: f.label + (f.required ? ' *' : ''), html: inp });
  });
  rows.forEach((r, i) => {
    if (i % 2 === 0) html += '<div class="form-row">';
    html += `<div class="form-group" id="fg-${r.key}"><label>${r.label}</label>${r.html}</div>`;
    if (i % 2 === 1 || i === rows.length - 1) html += '</div>';
  });
  html += `</form><div class="form-actions">
    <button class="btn-cancel" onclick="closeModal()">取消</button>
    <button class="btn-green" onclick="submitForm('${page}','${isEdit?data[flds[0].key]:''}')">${isEdit?'保存':'创建'}</button>
  </div>`;
  openModal(html);
  if (toggleAfterOpen) { const fn = window[toggleAfterOpen]; if (fn) setTimeout(fn, 0); }
}
