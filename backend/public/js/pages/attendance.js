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
  const r = meRole();
  // 工具栏
  html += '<div class="toolbar">';
  html += '<input id="sf-attendance-personalId" placeholder="用户ID" onkeydown="if(event.key===\'Enter\')loadAttendance()">';
  html += '<input id="sf-attendance-eventId" placeholder="活动ID/文章ID" onkeydown="if(event.key===\'Enter\')loadAttendance()">';
  html += '<button onclick="loadAttendance()">🔍 搜索</button>';
  if (r.isManager || r.isSectionLeader) {
    html += '<button class="btn-green" onclick="showAttendanceForm()">＋ 新增签到</button>';
  }
  html += '<button class="btn-dashboard" onclick="showAttendanceDashboard()">📊 数据大屏</button>';
  html += '</div>';

  // 表格（声部长只能删除本声部成员的签到，普通成员不能删除）
  if (!res.data || !res.data.length) {
    html += '<p style="padding:20px;text-align:center;color:#999">暂无数据</p>';
  } else {
    html += '<div class="table-wrap"><table><tr><th>ID</th><th>成员</th><th>活动</th><th>方式</th><th>操作</th></tr>';
    res.data.forEach(row => {
      const canDel = r.isManager || (r.isSectionLeader && Number(row.personSection) === Number(r.section));
      html += `<tr><td>${row.attendanceId}</td><td>${row.personName || ''}</td><td>${row.eventTitle || ''}</td>`;
      html += `<td>${row.method == 1 ? '参加' : '报名'}</td>`;
      html += `<td class="actions">${canDel ? `<button class="btn-del" onclick="delAttendance(${row.attendanceId})">删除</button>` : ''}</td></tr>`;
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

// ===== 出勤数据大屏 =====
let _adashType = 'signup';   // 当前 Tab：signup 报名 / checkin 出勤 / section 声部明细
let _adashActivities = [];   // 活动列表缓存
let _adashMe = null;         // 当前用户信息（isManager/section/job），判断声部明细权限

// 声部选项（与后端 SECTION_NAMES 对应）
const ADASH_SECTIONS = [
  { v: 0, n: '民族管乐' }, { v: 1, n: '弹拨一组' }, { v: 2, n: '弹拨二组' }, { v: 3, n: '胡琴' },
  { v: 4, n: '提琴' }, { v: 5, n: '西洋木管' }, { v: 6, n: '西洋铜管' }, { v: 7, n: '低音' },
  { v: 8, n: '钢琴' }, { v: 9, n: '打击' }, { v: 10, n: '无声部' }
];

// 进入大屏（默认最近活动 + 最近一个月，报名统计）
async function showAttendanceDashboard() {
  const el = document.getElementById('page-attendance');
  if (!el) return;
  el.innerHTML = '<div class="adash-wrap"><div class="adash-loading"><div class="spin"></div><div>加载中...</div></div></div>';
  try {
    // 并行获取活动列表与当前用户信息（判断声部明细权限）
    const [actRes, meRes] = await Promise.all([
      api('/attendance/activities'),
      api('/auth/me')
    ]);
    if (!actRes.success) throw new Error();
    _adashActivities = actRes.data || [];
    _adashMe = meRes.success ? meRes.data : null;

    // 默认：最近一个活动
    let defaultAct = '';
    if (_adashActivities.length) defaultAct = _adashActivities[0].id;
    // 默认：最近一个月
    const toD = new Date();
    const fromD = new Date();
    fromD.setMonth(fromD.getMonth() - 1);
    const f = fmtD(fromD), t = fmtD(toD);

    el.innerHTML = renderDashboardShell(defaultAct, f, t);
    await adashQuery();
  } catch (err) {
    el.innerHTML = '<div class="adash-wrap"><div class="adash-loading">加载失败'
      + '<div style="margin-top:12px"><button class="adash-query" onclick="showAttendanceDashboard()">🔄 重试</button></div></div></div>';
  }
}

function fmtD(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// 渲染大屏外壳（筛选栏 + Tab + 内容容器）
function renderDashboardShell(defaultAct, from, to) {
  const actOptions = '<option value="">📅 全部活动（时间段汇总）</option>'
    + _adashActivities.map(a =>
      '<option value="' + a.id + '"' + (a.id === defaultAct ? ' selected' : '') + '>' + escHtml(a.title) + '（' + fmtD(new Date(a.startTime)) + '）</option>'
    ).join('');

  // 管理员/声部长可以「以声部为单位」查看：声部是一个筛选维度，与报名/出勤 Tab 配合使用
  // 管理员可选任意声部（默认全部声部=整团视图），声部长锁定本声部
  const isManager = _adashMe && _adashMe.isManager === 1;
  const isSectionLeader = _adashMe && _adashMe.job === 1;
  const canSection = isManager || isSectionLeader;

  let secOptions = '';
  if (canSection) {
    const secList = isManager
      ? ADASH_SECTIONS
      : ADASH_SECTIONS.filter(s => s.v === _adashMe.section);
    secOptions = (isManager ? '<option value="">📊 全部声部</option>' : '')
      + secList.map(s =>
        '<option value="' + s.v + '"' + (isSectionLeader && !isManager ? ' selected' : '') + '>' + s.n + '</option>'
      ).join('');
  }

  return '<div class="adash-wrap">'
    // 顶栏
    + '<div class="adash-header">'
    + '<div class="adash-title">📋 出勤管理数据大屏</div>'
    + '<div class="adash-sub">Attendance Analytics</div>'
    + '<button class="adash-back" onclick="loadAttendance()">← 返回出勤列表</button>'
    + '</div>'
    // 筛选栏
    + '<div class="adash-filter">'
    + '<label>活动</label>'
    + '<select id="adash-act">' + (actOptions ? actOptions : '<option value="">暂无活动</option>') + '</select>'
    + '<label>从</label><input type="date" id="adash-from" value="' + from + '">'
    + '<label>至</label><input type="date" id="adash-to" value="' + to + '">'
    + (canSection ? '<label>声部</label>'
      + '<select id="adash-sec"' + (isSectionLeader && !isManager ? ' disabled' : '') + '>'
      + secOptions + '</select>' : '')
    + '<button class="adash-query" onclick="adashQuery()">🔍 查询</button>'
    + '<div class="adash-tabs">'
    + '<button class="adash-tab active" data-t="signup" onclick="adashSwitchTab(this)">📝 报名统计</button>'
    + '<button class="adash-tab" data-t="checkin" onclick="adashSwitchTab(this)">✅ 出勤统计</button>'
    + '</div>'
    + '</div>'
    // 内容区
    + '<div class="adash-body" id="adash-body"></div>'
    + '</div>';
}

// Tab 切换（保留筛选条件，仅切数据源）
function adashSwitchTab(btn) {
  document.querySelectorAll('.adash-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _adashType = btn.dataset.t;
  adashQuery();
}

// 执行查询
async function adashQuery() {
  const body = document.getElementById('adash-body');
  if (!body) return;
  const act = document.getElementById('adash-act')?.value || '';
  const from = document.getElementById('adash-from')?.value || '';
  const to = document.getElementById('adash-to')?.value || '';
  const sec = document.getElementById('adash-sec')?.value ?? '';

  body.innerHTML = '<div class="adash-loading" style="grid-column:1/-1"><div class="spin"></div><div>统计中...</div></div>';

  // 已选择具体声部 → 以声部为单位查看（只显示当前 Tab 的报名或出勤，二者不混）
  if (sec !== '' && sec !== undefined && sec !== null) {
    try {
      const params = 'section=' + encodeURIComponent(sec)
        + '&activityId=' + encodeURIComponent(act)
        + '&dateFrom=' + from + '&dateTo=' + to;
      const res = await api('/attendance/section-detail?' + params);
      if (!res.success) throw new Error(res.message || '加载失败');
      body.innerHTML = renderSectionContent(res.data);
      animateCounters();
    } catch (err) {
      body.innerHTML = '<div class="adash-loading" style="grid-column:1/-1">' + escHtml(err.message || '加载失败，请稍后重试')
        + '<div style="margin-top:12px"><button class="adash-query" onclick="adashQuery()">🔄 重试</button></div></div>';
    }
    return;
  }

  const params = 'type=' + _adashType + '&activityId=' + encodeURIComponent(act)
    + '&dateFrom=' + from + '&dateTo=' + to;
  try {
    const res = await api('/attendance/dashboard?' + params);
    if (!res.success) throw new Error(res.message || '加载失败');
    body.innerHTML = renderDashContent(res.data);
    animateCounters();
  } catch (err) {
    body.innerHTML = '<div class="adash-loading" style="grid-column:1/-1">' + escHtml(err.message || '加载失败，请稍后重试')
      + '<div style="margin-top:12px"><button class="adash-query" onclick="adashQuery()">🔄 重试</button></div></div>';
  }
}

// 渲染大屏内容
function renderDashContent(d) {
  const typeLabel = _adashType === 'checkin' ? '出勤' : '报名';
  if (d.scope === 'activity') {
    return renderActivityContent(d, typeLabel);
  }
  return renderRangeContent(d, typeLabel);
}

// 活动详情内容
function renderActivityContent(d, typeLabel) {
  const total = d.total || 0;
  const sections = d.sections || [];
  // 各声部占比表
  let tableHtml = '';
  if (!sections.length) {
    tableHtml = '<div class="dash-empty">该活动暂无' + typeLabel + '记录</div>';
  } else {
    tableHtml = '<div class="adash-table-wrap"><table class="adash-table"><tr><th>声部</th><th>' + typeLabel + '人数</th><th>声部总人数</th><th>占比</th></tr>';
    sections.forEach(s => {
      tableHtml += '<tr><td>' + escHtml(s.name) + '</td><td>' + s.count + '</td><td>' + s.totalMembers + '</td>'
        + '<td>' + (s.totalMembers ? s.pct + '%' : '-') + '</td></tr>';
    });
    tableHtml += '</table></div>';
  }
  const hbars = hBarChart(sections.map((s, i) => ({
    label: s.name, value: s.count,
    color: CHART_COLORS[i % CHART_COLORS.length],
    pct: s.totalMembers ? s.pct : undefined
  })));

  return '<div class="adash-card">'
    + '<div class="adash-card-title">📊 总' + typeLabel + '人数</div>'
    + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + total + '">0</span><small>人</small></div>'
    + '<div class="adash-stat-label">' + typeLabel + '总人数</div></div>'
    + '<div class="dash-empty" style="padding:10px;font-size:11px">' + escHtml(d.activity.title) + '</div>'
    + '</div>'
    + '<div class="adash-card">'
    + '<div class="adash-card-title">🎼 各声部' + typeLabel + '分布</div>'
    + hbars
    + '</div>'
    + '<div class="adash-card">'
    + '<div class="adash-card-title">📋 各声部占比明细</div>'
    + tableHtml
    + '<div class="adash-export"><button onclick="adashExport()">📥 导出 Excel</button></div>'
    + '</div>';
}

// 时间段汇总内容
function renderRangeContent(d, typeLabel) {
  const activityCount = d.activityCount || 0;
  const totalTimes = d.totalTimes || 0;
  const avg = d.avgPerActivity || 0;
  const sections = d.sections || [];
  const top = d.top || [];

  // 分组柱状图：各声部 总人次 + 平均每次
  const groups = sections.map(s => ({
    label: s.name,
    bars: [
      { label: '总人次', value: s.times, color: '#1890ff' },
      { label: '平均', value: s.avg, color: '#00d4ff' }
    ]
  }));

  // Top N 表格
  let topHtml = '';
  if (!top.length) {
    topHtml = '<div class="dash-empty">该时间段内暂无' + typeLabel + '记录</div>';
  } else {
    topHtml = '<div class="adash-table-wrap"><table class="adash-table"><tr><th>排名</th><th>姓名</th><th>声部</th><th>' + typeLabel + '次数</th></tr>';
    top.forEach(p => {
      const cls = p.rank === 1 ? 'rank-top' : (p.rank === 2 ? 'rank-top2' : (p.rank === 3 ? 'rank-top3' : 'rank-n'));
      topHtml += '<tr><td><span class="' + cls + '">' + p.rank + '</span></td><td>' + escHtml(p.name) + '</td>'
        + '<td>' + escHtml(p.section) + '</td><td>' + p.count + '</td></tr>';
    });
    topHtml += '</table></div>';
  }

  return ''
    + '<div class="adash-card">'
    + '<div class="adash-card-title">📅 活动总次数</div>'
    + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + activityCount + '">0</span><small>次</small></div>'
    + '<div class="adash-stat-label">' + d.dateFrom + ' ~ ' + d.dateTo + '</div>'
    + '<div class="adash-stat-hint">时间段内活动数</div></div></div>'
    + '<div class="adash-card">'
    + '<div class="adash-card-title">👥 总人次</div>'
    + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + totalTimes + '">0</span><small>人次</small></div>'
    + '<div class="adash-stat-label">' + typeLabel + '总人次</div></div></div>'
    + '<div class="adash-card">'
    + '<div class="adash-card-title">📈 平均每次人次</div>'
    + '<div class="adash-stat"><div class="adash-stat-num">' + fmtNum(avg) + '<small>人次/次</small></div>'
    + '<div class="adash-stat-label">总人次 ÷ 活动次数</div></div></div>'
    + '<div class="adash-card adash-card-wide">'
    + '<div class="adash-card-title">🎼 各声部人次与平均每次</div>'
    + (groups.length ? groupedBarChart(groups) : '<div class="dash-empty">暂无数据</div>')
    + '</div>'
    + '<div class="adash-card adash-card-wide">'
    + '<div class="adash-card-title">🏆 参与次数 Top N</div>'
    + topHtml
    + '<div class="adash-export"><button onclick="adashExport()">📥 导出 Excel</button></div>'
    + '</div>';
}

// 声部明细内容（管理员/声部长专用）：只显示当前 Tab 的报名或出勤其中一种
function renderSectionContent(d) {
  const members = d.members || [];
  const isActivity = d.mode === 'activity';
  const isCheckin = _adashType === 'checkin';
  const typeLabel = isCheckin ? '出勤' : '报名';
  const actLabel = document.getElementById('adash-act')?.value
    ? (document.getElementById('adash-act')?.selectedOptions[0]?.textContent || '')
    : '';
  const secName = d.sectionName || '';

  // 当前类型的汇总数字（报名/出勤 二选一）
  const sum = members.reduce((s, m) => s + (isCheckin ? m.checkin : m.signup), 0);
  const count = members.filter(m => (isCheckin ? m.checkin : m.signup) > 0).length;

  // 成员表：仅当前类型一列
  // 活动模式：状态列（已报名/未报名 或 已出勤/未出勤），每个成员都有明确值，绝无空值
  // 时间段模式：次数列（0 也明确显示）
  let tableHtml = '';
  if (!members.length) {
    tableHtml = '<div class="dash-empty">该声部暂无成员</div>';
  } else if (isActivity) {
    tableHtml = '<div class="adash-table-wrap"><table class="adash-table"><tr><th>排名</th><th>姓名</th><th>用户ID</th><th>状态</th></tr>';
    members.forEach(m => {
      const val = isCheckin ? m.checkin : m.signup;
      const cls = m.rank === 1 ? 'rank-top' : (m.rank === 2 ? 'rank-top2' : (m.rank === 3 ? 'rank-top3' : 'rank-n'));
      const status = val > 0
        ? '<span class="sec-ok">✅ 已' + typeLabel + '</span>'
        : '<span class="sec-no">❌ 未' + typeLabel + '</span>';
      tableHtml += '<tr><td><span class="' + cls + '">' + m.rank + '</span></td><td>' + escHtml(m.name) + '</td><td>' + escHtml(m.personalId) + '</td>'
        + '<td>' + status + '</td></tr>';
    });
    tableHtml += '</table></div>';
  } else {
    tableHtml = '<div class="adash-table-wrap"><table class="adash-table"><tr><th>排名</th><th>姓名</th><th>用户ID</th><th>' + typeLabel + '次数</th></tr>';
    members.forEach(m => {
      const val = isCheckin ? m.checkin : m.signup;
      const cls = m.rank === 1 ? 'rank-top' : (m.rank === 2 ? 'rank-top2' : (m.rank === 3 ? 'rank-top3' : 'rank-n'));
      tableHtml += '<tr><td><span class="' + cls + '">' + m.rank + '</span></td><td>' + escHtml(m.name) + '</td><td>' + escHtml(m.personalId) + '</td>'
        + '<td>' + val + '</td></tr>';
    });
    tableHtml += '</table></div>';
  }

  // 参与率（活动）或人均次数（时间段）
  const rateCard = isActivity
    ? '<div class="adash-card-title">📈 ' + typeLabel + '参与率</div>'
      + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + (d.totalMembers ? Math.round(count / d.totalMembers * 100) : 0) + '">0</span><small>%</small></div>'
      + '<div class="adash-stat-label">' + count + ' / ' + d.totalMembers + ' 人</div></div></div>'
    : '<div class="adash-card-title">📈 人均' + typeLabel + '次数</div>'
      + '<div class="adash-stat"><div class="adash-stat-num">' + fmtNum(d.totalMembers ? Math.round(sum / d.totalMembers * 10) / 10 : 0) + '<small>次</small></div>'
      + '<div class="adash-stat-label">共 ' + sum + ' 次 / ' + d.totalMembers + ' 人</div></div></div>';

  return ''
    + '<div class="adash-card">'
    + '<div class="adash-card-title">👥 声部成员</div>'
    + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + d.totalMembers + '">0</span><small>人</small></div>'
    + '<div class="adash-stat-label">' + escHtml(secName) + '声部</div></div></div>'
    + '<div class="adash-card">'
    + '<div class="adash-card-title">' + (isCheckin ? '✅' : '📝') + ' ' + typeLabel + (isActivity ? '人数' : '总次数') + '</div>'
    + '<div class="adash-stat"><div class="adash-stat-num"><span data-count="' + (isActivity ? count : sum) + '">0</span><small>' + (isActivity ? '人' : '次') + '</small></div>'
    + '<div class="adash-stat-label">' + (isActivity ? ('已' + typeLabel + '成员数') : ('时间段内' + typeLabel + '总次数')) + '</div></div></div>'
    + '<div class="adash-card">' + rateCard
    + '<div class="adash-card adash-card-wide">'
    + '<div class="adash-card-title">📋 ' + escHtml(secName) + '声部 ' + typeLabel + (isActivity ? '明细' : '汇总') + '</div>'
    + '<div class="dash-empty" style="padding:4px 2px 12px;text-align:left;color:rgba(255,255,255,.55);font-size:12px">'
    + (isActivity ? ('活动：' + escHtml(actLabel || '')) : ('时间段：' + (document.getElementById('adash-from')?.value || '') + ' ~ ' + (document.getElementById('adash-to')?.value || '')))
    + '</div>'
    + tableHtml
    + '</div>';
}

// 导出 Excel
async function adashExport() {
  const act = document.getElementById('adash-act')?.value || '';
  const from = document.getElementById('adash-from')?.value || '';
  const to = document.getElementById('adash-to')?.value || '';
  const btn = document.querySelector('.adash-export button');
  if (btn) { btn.textContent = '⏳ 导出中...'; btn.disabled = true; }
  try {
    const params = 'type=' + _adashType + '&activityId=' + encodeURIComponent(act)
      + '&dateFrom=' + from + '&dateTo=' + to;
    const res = await fetch('/api/attendance/export?' + params);
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('json')) {
      const j = await res.json();
      showToast(j.message || '导出失败', 'error');
    } else {
      // 触发下载
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      let fname = '统计.xlsx';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      if (m) { try { fname = decodeURIComponent(m[1]); } catch (e) { fname = m[1]; } }
      a.href = url; a.download = fname; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      showToast('✅ 已导出 Excel');
    }
  } catch (e) {
    showToast('导出失败，请稍后重试', 'error');
  }
  if (btn) { btn.textContent = '📥 导出 Excel'; btn.disabled = false; }
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadAttendance();
  });
});
