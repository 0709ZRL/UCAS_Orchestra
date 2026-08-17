// ===== 排练记录页面（仅学生指挥 managerJob=6，非学生指挥由 auth.js 重定向到 /home）=====
document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadRehearsals();
  });
});

// 已结束排练活动缓存（供选择排练活动）
let _eventsCache = null;

async function loadEvents(force) {
  if (_eventsCache && !force) return _eventsCache;
  const res = await api('/rehearsals/events');
  _eventsCache = res.success ? (res.data || []) : [];
  return _eventsCache;
}

// 加载排练记录列表
async function loadRehearsals() {
  const el = document.getElementById('page-rehearsals');
  const res = await api('/rehearsals');
  if (!res.success) { el.innerHTML = '<p>加载失败</p>'; return; }
  const list = res.data || [];

  let html = `<div class="toolbar">
    <h2 style="margin:0;font-size:18px">🎬 排练记录</h2>
    <button class="btn-green" onclick="showAddForm()">＋ 记录排练要点</button>
  </div>`;

  if (!list.length) {
    html += '<p style="padding:40px;text-align:center;color:#999">暂无排练记录</p>';
  } else {
    html += '<div class="rehearsal-list">';
    list.forEach(r => {
      html += `<div class="rehearsal-card">
        <div class="rehearsal-head">
          <span class="rehearsal-title">${escHtml(r.eventTitle || '未命名排练')}</span>
          <span class="rehearsal-date">${escHtml(r.recordDate || '')}</span>
        </div>
        <div class="rehearsal-content">${escHtml(r.content || '').replace(/\n/g, '<br>')}</div>
        <div class="rehearsal-foot">
          <span class="rehearsal-meta">记录人：${escHtml(r.creatorName || '')}</span>
          <span class="actions">
            <button class="btn-edit" onclick="showEditForm(${r.id})">编辑</button>
            <button class="btn-del" onclick="delRehearsal(${r.id})">删除</button>
          </span>
        </div>
      </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

// 新增：选择排练活动 + 填写要点
async function showAddForm() {
  const events = await loadEvents();
  const opts = events.length
    ? events.map(e =>
        `<option value="${escHtml(e.eventId)}">${escHtml(e.title)}${e.startTime ? '（' + escHtml(String(e.startTime).slice(0, 10)) + '）' : ''}</option>`
      ).join('')
    : '<option value="">暂无已结束的排练活动</option>';
  openModal(`
    <h2>记录排练要点</h2>
    <form id="form">
      <div class="form-group">
        <label>排练活动 *</label>
        <select id="f-eventId">${opts}</select>
        <div style="font-size:12px;color:#888;margin-top:4px">仅可选择已结束的排练通知/演出</div>
      </div>
      <div class="form-group">
        <label>排练要点 *</label>
        <textarea id="f-content" rows="8" placeholder="记录本次排练的重点内容、存在问题与改进方向…"></textarea>
      </div>
    </form>
    <div class="form-actions">
      <button class="btn-cancel" onclick="closeModal()">取消</button>
      <button class="btn-green" onclick="submitRehearsal()">保存</button>
    </div>
  `);
}

// 编辑：修改排练要点
async function showEditForm(id) {
  const res = await api('/rehearsals');
  if (!res.success) { showToast('加载失败', 'error'); return; }
  const r = (res.data || []).find(x => x.id === id);
  if (!r) { showToast('记录不存在', 'error'); return; }
  openModal(`
    <h2>编辑排练要点</h2>
    <form id="form">
      <div class="form-group">
        <label>排练活动</label>
        <input id="f-title" type="text" value="${escHtml(r.eventTitle || '')}" readonly style="background:#f5f5f5">
      </div>
      <div class="form-group">
        <label>排练日期</label>
        <input id="f-date" type="text" value="${escHtml(r.recordDate || '')}" readonly style="background:#f5f5f5">
      </div>
      <div class="form-group">
        <label>排练要点 *</label>
        <textarea id="f-content" rows="8">${escHtml(r.content || '')}</textarea>
      </div>
    </form>
    <div class="form-actions">
      <button class="btn-cancel" onclick="closeModal()">取消</button>
      <button class="btn-green" onclick="saveRehearsal(${id})">保存</button>
    </div>
  `);
}

// 新增提交
async function submitRehearsal() {
  if (window._submitting) return;
  const eventId = document.getElementById('f-eventId').value;
  const content = document.getElementById('f-content').value.trim();
  if (!eventId) { showToast('请选择排练活动', 'error'); return; }
  if (!content) { showToast('请填写排练要点', 'error'); return; }
  window._submitting = true;
  const res = await api('/rehearsals', { method: 'POST', body: JSON.stringify({ eventId, content }) });
  window._submitting = false;
  if (res.success) { showToast('已记录'); closeModal(); loadRehearsals(); }
  else showToast(res.message, 'error');
}

// 编辑提交
async function saveRehearsal(id) {
  if (window._submitting) return;
  const content = document.getElementById('f-content').value.trim();
  if (!content) { showToast('请填写排练要点', 'error'); return; }
  window._submitting = true;
  const res = await api('/rehearsals/' + id, { method: 'PUT', body: JSON.stringify({ content }) });
  window._submitting = false;
  if (res.success) { showToast('已更新'); closeModal(); loadRehearsals(); }
  else showToast(res.message, 'error');
}

// 删除
async function delRehearsal(id) {
  if (!confirm('确认删除该排练要点？')) return;
  const res = await api('/rehearsals/' + id, { method: 'DELETE' });
  if (res.success) { showToast('已删除'); loadRehearsals(); }
  else showToast(res.message, 'error');
}
