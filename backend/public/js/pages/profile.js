let _profileData = null;

// 加载个人信息
async function showProfile() {
  const res = await api('/auth/me');
  if (!res.success) return;
  const pid = res.data.personalId;
  const ures = await api('/persons/' + pid);
  if (!ures.success) { document.getElementById('page-profile').innerHTML = '<p>加载失败</p>'; return; }
  const u = ures.data;

  let html = `<div class="profile-wrap">
    <div class="profile-avatar">
      <img src="/api/auth/avatar" id="profileAvatar">
      <div class="edit-badge" onclick="document.getElementById('avatarInput').click()">📷 更换头像</div>
      <input id="avatarInput" type="file" accept="image/*" style="display:none" onchange="startCrop(this)">
    </div>`;

  const order = ['name','gender','personalId','account','institute','grade','campus','section','job','isManager','managerJob','instrument','isMaster'];
  order.forEach(k => {
    if (k === 'personalId' || k === 'account') {
      html += `<div class="profile-field"><div class="pl">${PROFILE_LABELS[k]}</div><div class="pv">${u[k]||''}</div></div>`;
    } else {
      const v = u[k];
      const label = PROFILE_MAP[k] ? PROFILE_MAP[k][v] : (v !== null && v !== undefined ? v : '');
      html += `<div class="profile-field"><div class="pl">${PROFILE_LABELS[k]}</div><div class="pv" id="pv-${k}">${label}</div></div>`;
    }
  });

  html += `<div class="profile-actions"><button class="btn-primary" onclick="showProfileEdit()">✏️ 编辑信息</button></div></div>`;
  document.getElementById('page-profile').innerHTML = html;

  // 头像加载失败时显示默认占位
  const pa = document.getElementById('profileAvatar');
  if (pa) {
    pa.onerror = function() {
      this.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#ddd" width="100" height="100"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>');
    };
  }
}

// 编辑个人信息弹窗
async function showProfileEdit() {
  const res = await api('/auth/me');
  if (!res.success) return;
  const ures = await api('/persons/' + res.data.personalId);
  if (!ures.success) return;
  _profileData = ures.data;
  const flds = fields.persons.filter(f => f.key !== 'personalId');
  let html = `<h2>编辑个人信息</h2><form id="form">`;
  let rows = [];
  flds.forEach(f => {
    if (f.key === 'isManager' || f.key === 'managerJob' || f.key === 'isMaster' || f.key === 'gender' || f.key === 'campus' || f.key === 'section' || f.key === 'job') {
      const val = _profileData[f.key] !== null && _profileData[f.key] !== undefined ? _profileData[f.key] : f.default;
      const inp = `<select id="f-${f.key}">${f.options.map(o => `<option value="${o.v}" ${String(val)==String(o.v)?'selected':''}>${o.t}</option>`).join('')}</select>`;
      rows.push({ key: f.key, label: f.label, html: inp });
    } else {
      const val = _profileData[f.key] || '';
      const inp = `<input id="f-${f.key}" type="text" value="${val}">`;
      rows.push({ key: f.key, label: f.label, html: inp });
    }
  });
  rows.forEach((r, i) => {
    if (i % 2 === 0) html += '<div class="form-row">';
    html += `<div class="form-group" id="fg-${r.key}"><label>${r.label}</label>${r.html}</div>`;
    if (i % 2 === 1 || i === rows.length - 1) html += '</div>';
  });
  html += `</form><div class="form-actions">
    <button class="btn-cancel" onclick="closeModal()">取消</button>
    <button class="btn-green" onclick="submitProfile()">保存</button>
  </div>`;
  openModal(html);
  // 管理职责联动
  const e = document.getElementById('f-isManager');
  const r = document.getElementById('fg-managerJob');
  if (e && r) {
    e.addEventListener('change', function() { r.style.display = this.value === '1' ? '' : 'none'; });
    r.style.display = e.value === '1' ? '' : 'none';
  }
}

// 提交个人信息编辑
async function submitProfile() {
  const flds = fields.persons.filter(f => f.key !== 'personalId');
  const body = {};
  const intKeys = ['gender','campus','section','job','isManager','managerJob','isMaster'];
  flds.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (!el) return;
    const val = el.value;
    if (intKeys.includes(f.key)) body[f.key] = parseInt(val || 0);
    else body[f.key] = val || null;
  });
  const res = await api('/auth/profile', { method: 'PUT', body: JSON.stringify(body) });
  if (res.success) { showToast('已更新'); closeModal(); showProfile(); }
  else showToast(res.message, 'error');
}

// 点击主区域关闭侧栏（移动端）
document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) showProfile();
  });
});
