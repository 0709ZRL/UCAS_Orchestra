let _attLookupState = {};

// 出勤手动加载（不走通用 loadPage）
async function loadAttendance() {
  const el = document.getElementById('page-attendance');
  if (!el) return;

  const search = {};
  const personalId = document.getElementById('sf-attendance-personalId');
  const eventId = document.getElementById('sf-attendance-eventId');
  if (personalId && personalId.value) search.personalId = personalId.value;
  if (eventId && eventId.value) search.eventId = eventId.value;

  search.page = 1;
  search.limit = 100;
  const qs = Object.entries(search).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await api('/attendance?' + qs);
  if (!res.success) { el.innerHTML = '<p>加载失败</p>'; return; }

  let html = '';
  // 工具栏
  html += '<div class="toolbar">';
  html += '<input id="sf-attendance-personalId" placeholder="用户ID" onkeydown="if(event.key===\'Enter\')loadAttendance()">';
  html += '<input id="sf-attendance-eventId" placeholder="活动ID" onkeydown="if(event.key===\'Enter\')loadAttendance()">';
  html += '<button onclick="loadAttendance()">🔍 搜索</button>';
  html += '<button class="btn-green" onclick="showAttendanceForm()">＋ 新增签到</button>';
  html += '</div>';

  // 表格
  if (!res.data || !res.data.length) {
    html += '<p style="padding:20px;text-align:center;color:#999">暂无数据</p>';
  } else {
    html += '<div class="table-wrap"><table><tr><th>ID</th><th>成员</th><th>活动</th><th>方式</th><th>操作</th></tr>';
    res.data.forEach(row => {
      html += `<tr><td>${row.attendanceId}</td><td>${row.personName || ''}</td><td>${row.eventTitle || ''}</td>`;
      html += `<td>${row.method == 1 ? '参加' : '报名'}</td>`;
      html += `<td class="actions"><button class="btn-del" onclick="delAttendance(${row.attendanceId})">删除</button></td></tr>`;
    });
    html += '</table></div>';
  }

  const totalPages = Math.ceil(res.total / res.limit) || 1;
  html += `<div class="pagination"><span>共 ${res.total} 条</span></div>`;
  el.innerHTML = html;
}

// 出勤表单
function showAttendanceForm() {
  let h = `<h2>新增签到</h2><form id="form">
    <div class="form-row">
      <div class="form-group"><label>成员姓名 *</label><input id="f-personName" type="text" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px"></div>
      <div class="form-group"><label>活动标题 *</label><input id="f-eventTitle" type="text" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px"></div>
    </div>
    <div style="margin-bottom:12px"><button type="button" class="btn-green" onclick="attLookup()">🔍 查找确认</button></div>
    <div id="att-lookup-result" style="margin-bottom:12px"></div>
    <div id="att-confirmed" style="display:none">
      <div class="form-row">
        <div class="form-group"><label>成员（已确认）</label><input id="f-personDisplay" type="text" readonly style="background:#f5f5f5;width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px"></div>
        <div class="form-group"><label>活动（已确认）</label><input id="f-eventDisplay" type="text" readonly style="background:#f5f5f5;width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>参加方式</label>
          <select id="f-method" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px">
            <option value="0">报名</option><option value="1">参加</option>
          </select>
        </div>
      </div>
    </div>
    <input id="f-personalId" type="hidden"><input id="f-eventId" type="hidden">
  </form><div class="form-actions">
    <button class="btn-cancel" onclick="closeModal()">取消</button>
    <button class="btn-green" onclick="attSubmit()">创建</button>
  </div>`;
  openModal(h);
}

// 出勤查找
async function attLookup() {
  const pn = document.getElementById('f-personName').value.trim();
  const et = document.getElementById('f-eventTitle').value.trim();
  if (!pn && !et) { showToast('请至少填写成员姓名或活动标题', 'error'); return; }
  const body = {};
  if (pn) body.personName = pn;
  if (et) body.eventTitle = et;
  const res = await api('/attendance/lookup', { method: 'POST', body: JSON.stringify(body) });
  if (!res.success) { showToast('查询失败', 'error'); return; }
  const el = document.getElementById('att-lookup-result');
  const cf = document.getElementById('att-confirmed');
  let html = '';
  let personId = null, personLabel = '';
  if (res.person) {
    personId = res.person.personalId;
    personLabel = `${res.person.name} (${res.person.section||'?'})`;
  } else if (res.personOptions && res.personOptions.length > 0) {
    if (res.personOptions.length === 1) {
      personId = res.personOptions[0].personalId;
      personLabel = `${res.personOptions[0].name} (${res.personOptions[0].section||'?'})`;
    } else {
      html += `<div style="background:#fff3cd;padding:8px 12px;border-radius:6px;margin-bottom:8px"><b>⚠ 找到多位成员：</b></div>`;
      res.personOptions.forEach(p => {
        html += `<label style="display:block;padding:6px 10px;background:#f8f9ff;border-radius:4px;margin-bottom:4px;cursor:pointer">
          <input type="radio" name="att-pick-person" value="${p.personalId}" data-label="${p.name}(${p.section||'?'})"> ${p.name} (${p.section||'无声部'}) ${p.campus||''}
        </label>`;
      });
    }
  } else {
    html += `<div style="background:#f8d7da;padding:8px 12px;border-radius:6px;margin-bottom:8px">❌ 未找到匹配的成员</div>`;
  }
  let eventId = null, eventLabel = '';
  if (res.event) {
    eventId = res.event.eventId;
    eventLabel = `${res.event.title} (${res.event.year}-${res.event.month}-${res.event.date})`;
  } else if (res.eventOptions && res.eventOptions.length > 0) {
    if (res.eventOptions.length === 1) {
      eventId = res.eventOptions[0].eventId;
      eventLabel = `${res.eventOptions[0].title} (${res.eventOptions[0].year}-${res.eventOptions[0].month}-${res.eventOptions[0].date})`;
    } else {
      html += `<div style="background:#fff3cd;padding:8px 12px;border-radius:6px;margin-bottom:8px"><b>⚠ 找到多项活动：</b></div>`;
      res.eventOptions.forEach(e => {
        const st = e.startTime ? e.startTime.replace('T', ' ').substring(0, 16) : '';
        html += `<label style="display:block;padding:6px 10px;background:#f8f9ff;border-radius:4px;margin-bottom:4px;cursor:pointer">
          <input type="radio" name="att-pick-event" value="${e.eventId}" data-label="${e.title}(${e.year}-${e.month}-${e.date})"> ${e.title} ${st} ${e.year}-${e.month}-${e.date}
        </label>`;
      });
    }
  } else {
    html += `<div style="background:#f8d7da;padding:8px 12px;border-radius:6px;margin-bottom:8px">❌ 未找到匹配的活动</div>`;
  }
  const needPick = !personId || !eventId || html.includes('radio');
  if (needPick && (res.personOptions || res.eventOptions)) {
    html += `<button class="btn-green" onclick="attConfirmPick()">✅ 确认选择</button>`;
  }
  el.innerHTML = html;
  if (!needPick) {
    if (personId) {
      document.getElementById('f-personalId').value = personId;
      document.getElementById('f-personDisplay').value = personLabel;
    }
    if (eventId) {
      document.getElementById('f-eventId').value = eventId;
      document.getElementById('f-eventDisplay').value = eventLabel;
    }
    cf.style.display = 'block';
    _attLookupState = {};
  } else {
    cf.style.display = 'none';
    _attLookupState = { personId, eventId, personLabel, eventLabel, needPick };
  }
}

function attConfirmPick() {
  const pSel = document.querySelector('input[name="att-pick-person"]:checked');
  const eSel = document.querySelector('input[name="att-pick-event"]:checked');
  const cf = document.getElementById('att-confirmed');
  if (_attLookupState.personId || pSel) {
    const pid = _attLookupState.personId || pSel.value;
    const plab = _attLookupState.personLabel || (pSel ? pSel.dataset.label : '');
    document.getElementById('f-personalId').value = pid;
    document.getElementById('f-personDisplay').value = plab;
  }
  if (_attLookupState.eventId || eSel) {
    const eid = _attLookupState.eventId || eSel.value;
    const elab = _attLookupState.eventLabel || (eSel ? eSel.dataset.label : '');
    document.getElementById('f-eventId').value = eid;
    document.getElementById('f-eventDisplay').value = elab;
  }
  cf.style.display = 'block';
  document.getElementById('att-lookup-result').innerHTML = '<div style="color:#2d8a4e">✅ 已确认</div>';
  _attLookupState = {};
}

async function attSubmit() {
  if (window._submitting) return;
  window._submitting = true;
  const pid = document.getElementById('f-personalId').value;
  const eid = document.getElementById('f-eventId').value;
  if (!pid || !eid) { showToast('请先通过查找确认成员和活动', 'error'); window._submitting = false; return; }
  const method = parseInt(document.getElementById('f-method').value);
  const res = await api('/attendance', { method: 'POST', body: JSON.stringify({ personalId: pid, eventId: eid, method }) });
  if (res.success) { showToast('签到成功'); closeModal(); loadAttendance(); }
  else showToast(res.message, 'error');
  window._submitting = false;
}

async function delAttendance(id) {
  if (!confirm('确认删除该签到记录？')) return;
  const res = await api('/attendance/' + id, { method: 'DELETE' });
  if (res.success) { showToast('已删除'); loadAttendance(); }
  else showToast(res.message, 'error');
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadAttendance();
  });
});
