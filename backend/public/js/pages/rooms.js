// ===== 琴房预约页面 =====
// 常量
const OPEN_TIME = '07:00';
const CLOSE_TIME = '22:30';
const OPEN_MIN = 7 * 60;          // 420 分钟
const CLOSE_MIN = 22 * 60 + 30;   // 1350 分钟
const MIN_PX = 1.5;               // 1 分钟 = 1.5px
const MAX_PARTICIPANTS = 6;
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 预约块颜色板（暖色为主，饱和度适中，白字可读）
const BLOCK_COLORS = [
  '#f5222d', '#fa541c', '#fa8c16', '#eb2f96', '#d4380d',
  '#c41d7f', '#ad4b00', '#d46b08', '#f759ab', '#722ed1',
  '#13c2c2', '#08979c', '#389e0d', '#cf1322', '#d4380d'
];

let _rooms = [];                 // 当前校区琴房
let _currentCampus = '';         // 当前选中校区
let _currentRoomId = '';         // 当前选中琴房
let _weekStart = null;           // 当前显示周的周一（Date）
let _reservations = [];          // 当前周预约数据
let _myId = '';                  // 当前登录用户 personalId
let _isAdmin = false;            // 是否为管理员（可覆盖预约、管理任何预约）
let _serverOffset = 0;           // 服务器与客户端时间差（ms）
let _selectedResvId = null;      // 详情面板选中的预约 id
let _editingId = null;           // 编辑中的预约 id
let _participants = [];          // 模态框中已添加的参与人 [{personalId,name,isOrchestraMember}]
let _pendingNonMember = null;    // 待确认的非乐团成员

// 滚动到顶部
function scrollToTop() {
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
}

// 服务器时间（与客户端对齐）
function nowServer() {
  return new Date(Date.now() + _serverOffset);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtDateCN(d) { return `${d.getMonth()+1}月${d.getDate()}日`; }

// 解析参与人数组（兼容数组或 JSON 字符串）
function parseParticipants(p) {
  if (Array.isArray(p)) return p;
  if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return []; } }
  return [];
}

// 从 TIME 字符串获取当天对应 Date
function timeToDate(dateStr, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(`${dateStr}T00:00:00`);
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelector('.main')?.addEventListener('click', function () {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) initRoomsPage();
  });
});

async function initRoomsPage() {
  // 获取当前用户 & 服务器时间
  try {
    const [meRes, healthRes] = await Promise.all([
      api('/auth/me'),
      fetch('/api/health').then(r => r.json())
    ]);
    if (meRes.success && meRes.data) {
      _myId = meRes.data.personalId;
      _isAdmin = meRes.data.isManager == 1;
    }
    if (healthRes.success) {
      _serverOffset = new Date(healthRes.time).getTime() - Date.now();
    }
  } catch (e) { /* 忽略 */ }

  // 初始化本周一
  const today = new Date();
  const day = (today.getDay() + 6) % 7; // 周一=0
  _weekStart = new Date(today);
  _weekStart.setDate(today.getDate() - day);
  _weekStart.setHours(0, 0, 0, 0);

  renderToolbar();
}

// ===== 顶部操作栏 =====
const ROOM_NOTICE_TEXT = '🎹 琴房钢琴单次使用时间不超过2小时，其他乐器无此要求。为了良好的使用体验，请与其他同学错峰预约！';

function renderToolbar() {
  const el = document.getElementById('page-rooms');
  el.innerHTML = '<div class="rooms-wrap">'
    + '<div class="rooms-toolbar">'
    + '<label>琴房</label>'
    + '<select id="room-select" onchange="onRoomChange()"><option value="">请选择琴房</option></select>'
    + '<button class="btn-query" id="btn-query" onclick="loadWeek()">🔍 查询</button>'
    + '<button class="btn-reserve" id="btn-reserve" onclick="openCreateModal()">＋ 预约</button>'
    + '</div>'
    + '<div class="room-notice">' + ROOM_NOTICE_TEXT + '</div>'
    + '<div class="rooms-main" id="rooms-main"></div>'
    + '</div>';
  loadAllRooms();
}

// 加载全部琴房（平铺显示，每个选项带校区分组前缀，避免 optgroup 在移动端渲染问题）
async function loadAllRooms() {
  try {
    const res = await api('/rooms');
    if (!res.success) throw new Error();
    _rooms = res.data || [];
    const roomSel = document.getElementById('room-select');
    if (!roomSel) return;

    // 按固定校区顺序排序：玉泉路 → 雁栖湖 → 奥运村，再按 roomId
    const campusOrder = ['玉泉路琴房', '雁栖湖琴房', '奥运村琴房'];
    _rooms.sort((a, b) => {
      const ia = campusOrder.indexOf(a.campus);
      const ib = campusOrder.indexOf(b.campus);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
    });

    // 平铺选项：每个选项显示完整琴房名（含校区别名与 A/B，如：玉泉路琴房 A）
    let html = '<option value="">请选择琴房</option>';
    _rooms.forEach(r => {
      // 琴房名已含校区前缀则直接用；否则补全
      const label = r.name && r.name.indexOf(r.campus) !== -1 ? r.name : (r.campus + ' ' + r.name);
      html += '<option value="' + r.roomId + '">' + escHtml(label) + '</option>';
    });
    roomSel.innerHTML = html;

    // 默认选择第一间琴房
    if (_rooms.length) {
      _currentRoomId = _rooms[0].roomId;
      _currentCampus = _rooms[0].campus;
      roomSel.value = _currentRoomId;
      await loadWeek();
    } else {
      document.getElementById('rooms-main').innerHTML = '<div class="rooms-error" style="padding:60px;text-align:center;color:#bbb">暂无琴房</div>';
    }
  } catch (e) {
    document.getElementById('rooms-main').innerHTML = '<div class="rooms-error" style="padding:60px;text-align:center;color:#999">加载琴房失败</div>';
  }
}

function onRoomChange() {
  _currentRoomId = document.getElementById('room-select').value;
  const room = _rooms.find(r => r.roomId === _currentRoomId);
  _currentCampus = room ? room.campus : '';
  if (_currentRoomId) {
    loadWeek();
  }
}

// ===== 加载周数据 =====
async function loadWeek() {
  if (!_currentRoomId) return;
  const main = document.getElementById('rooms-main');
  main.innerHTML = '<div class="loading-wrap"><div class="spin"></div><div>加载课表中...</div></div>';

  const monday = new Date(_weekStart);
  const sunday = new Date(_weekStart);
  sunday.setDate(monday.getDate() + 6);

  try {
    const url = '/api/reservations?roomId=' + encodeURIComponent(_currentRoomId)
      + '&dateFrom=' + fmtDate(monday) + '&dateTo=' + fmtDate(sunday);
    const res = await fetch(url).then(r => r.json());
    if (!res.success) throw new Error(res.message);
    _reservations = res.data || [];
    renderTimetable();
  } catch (err) {
    main.innerHTML = '<div class="rooms-error"><p style="color:#999;margin-bottom:12px">加载失败，请检查网络连接</p>'
      + '<button class="retry-btn" onclick="loadWeek()">🔄 重试</button></div>';
  }
}

// ===== 渲染课表 =====
function renderTimetable() {
  const main = document.getElementById('rooms-main');
  if (!main) return;

  const totalMin = CLOSE_MIN - OPEN_MIN;              // 930 分钟
  const totalH = totalMin * MIN_PX;                    // 1395px

  // 周日期
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(_weekStart);
    d.setDate(_weekStart.getDate() + i);
    days.push(d);
  }
  const todayStr = fmtDate(new Date());
  const weekTitle = fmtDateCN(days[0]) + ' ~ ' + fmtDateCN(days[6]);

  // 按天分组预约
  const byDay = {};
  _reservations.forEach(r => {
    const key = String(r.date).slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(r);
  });

  let html = '<div class="timetable-panel">'
    + '<div class="week-nav">'
    + '<button onclick="changeWeek(-1)" title="上一周">←</button>'
    + '<span class="week-title">' + weekTitle + '</span>'
    + '<div class="week-btns">'
    + '<button class="today-btn" onclick="changeWeek(0)">回到本日</button>'
    + '<button onclick="changeWeek(1)" title="下一周">→</button>'
    + '</div>'
    + '</div>'
    + '<div class="timetable-scroll">'
    + '<table class="timetable">'
    + '<thead><tr><th class="time-col">时间</th>';
  days.forEach((d, i) => {
    const ds = fmtDate(d);
    const isToday = ds === todayStr;
    html += '<th class="' + (isToday ? 'today' : '') + '">' + DAY_NAMES[i]
      + '<span class="day-date">' + (d.getMonth()+1) + '/' + d.getDate() + '</span></th>';
  });
  html += '</tr></thead>';

  // 主体：单行，每列独立相对定位容器
  html += '<tbody><tr>';
  // 时间列
  html += '<td class="time-col" style="position:relative;height:' + totalH + 'px">';
  for (let m = OPEN_MIN; m <= CLOSE_MIN; m += 30) {
    const mm = m - OPEN_MIN;
    const label = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    // 用 Math.max(0,...) 保证 07:00 标签不被吸顶的日期表头遮住
    html += '<div style="position:absolute;top:' + Math.max(0, mm * MIN_PX - 6) + 'px;left:0;right:0;text-align:center">' + label + '</div>';
  }
  html += '</td>';

  // 每日列
  days.forEach(d => {
    const ds = fmtDate(d);
    const isToday = ds === todayStr;
    const list = byDay[ds] || [];
    // 计算重叠布局：重叠的预约并排显示（各占部分列宽）
    const layout = computeDayLayout(list);
    html += '<td class="day-cell' + (isToday ? ' is-today' : '') + '" style="height:' + totalH + 'px">';
    list.forEach(r => {
      html += renderBlock(r, ds, layout[r.id] || { leftPct: 0, widthPct: 100 });
    });
    html += '</td>';
  });

  html += '</tr></tbody></table></div></div>';

  // 详情面板
  html += '<div class="detail-panel" id="detail-panel">' + renderDetailPanel() + '</div>';

  main.innerHTML = html;

  // 高亮选中的预约
  if (_selectedResvId) {
    const block = main.querySelector('.resv-block[data-id="' + _selectedResvId + '"]');
    if (block) block.classList.add('active');
  }
}

// 计算单日预约的重叠布局
// 返回 { [resvId]: { leftPct, widthPct } }
// 算法：按开始时间排序，用贪心分配"列"（lane），重叠的预约分到不同列并排显示，
// 每个预约占 1/列数 的宽度（保证同一时刻任意列不重叠）
function computeDayLayout(list) {
  if (!list || !list.length) return {};
  const toMin = (t) => timeToMin(t);

  // 按开始时间排序（同时开始则持续时间长的优先）
  const sorted = [...list].sort((a, b) => {
    const d = toMin(a.startTime) - toMin(b.startTime);
    if (d !== 0) return d;
    return toMin(b.endTime) - toMin(a.endTime);
  });

  // 划分连通重叠簇（扫描线：新区间开始时间 >= 当前簇最晚结束则开新簇）
  const byCluster = new Map();
  let curEnd = -1;
  let curCluster = null;
  sorted.forEach(r => {
    const st = toMin(r.startTime);
    const et = toMin(r.endTime);
    if (!curCluster || st >= curEnd) {
      curCluster = [];
      byCluster.set(byCluster.size, curCluster);
    }
    curCluster.push(r);
    curEnd = Math.max(curEnd, et);
  });

  const layout = {};
  byCluster.forEach(resvs => {
    // 贪心分配列：每列记录最后结束时间
    const laneEnds = [];
    const laneOf = {};
    resvs.forEach(r => {
      const st = toMin(r.startTime);
      const et = toMin(r.endTime);
      let lane = laneEnds.findIndex(e => e <= st);
      if (lane === -1) {
        laneEnds.push(et);
        lane = laneEnds.length - 1;
      } else {
        laneEnds[lane] = et;
      }
      laneOf[r.id] = lane;
    });
    const numCols = Math.max(laneEnds.length, 1);

    // 每个预约只占其所在列的宽度
    resvs.forEach(r => {
      const l = laneOf[r.id];
      layout[r.id] = {
        leftPct: (l / numCols) * 100,
        widthPct: (1 / numCols) * 100
      };
    });
  });

  return layout;
}

// 生成预约块
function renderBlock(r, dateStr, pos) {
  const color = pickColor(r.id);
  const textColor = pickTextColor(color);
  const stMin = timeToMin(r.startTime);
  const etMin = timeToMin(r.endTime);
  const top = (stMin - OPEN_MIN) * MIN_PX;
  const height = Math.max((etMin - stMin) * MIN_PX, 24);
  const bookerName = r.bookerName || r.bookerId;
  const isSelf = r.bookerId === _myId;
  const timeStr = fmtTime(r.startTime) + ' - ' + fmtTime(r.endTime);

  // 重叠时按列宽缩放，列宽内保留 4px 间隔
  const leftPct = pos.leftPct;
  const widthPct = pos.widthPct;
  const style = 'top:' + top + 'px;height:' + height + 'px;'
    + 'left:calc(' + leftPct + '% + 2px);'
    + 'width:calc(' + widthPct + '% - 4px);'
    + 'background:' + color + ';color:' + textColor + ';';

  return '<div class="resv-block' + (isSelf ? ' self' : '') + '" data-id="' + r.id + '"'
    + ' style="' + style + '"'
    + ' onclick="selectReservation(' + r.id + ')"'
    + ' title="' + timeStr + ' · ' + escHtml(bookerName) + '">'
    + '<div class="rb-time">' + timeStr + '</div>'
    + '<div class="rb-name">👤 ' + escHtml(bookerName) + '</div>'
    + (r.participants && r.participants.length > 1 ? '<div class="rb-name">+' + (r.participants.length - 1) + '人</div>' : '')
    + '</div>';
}

function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
function fmtTime(t) {
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

// 稳定随机色（按 id 哈希）
function pickColor(id) {
  let hash = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

// 根据背景亮度选择文字颜色
function pickTextColor(bg) {
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160 ? '#333333' : '#ffffff';
}

// ===== 周切换 =====
function changeWeek(dir) {
  if (dir === 0) {
    const today = new Date();
    const day = (today.getDay() + 6) % 7;
    _weekStart = new Date(today);
    _weekStart.setDate(today.getDate() - day);
    _weekStart.setHours(0, 0, 0, 0);
  } else {
    _weekStart.setDate(_weekStart.getDate() + dir * 7);
  }
  loadWeek();
}

// ===== 详情面板 =====
function renderDetailPanel() {
  if (!_selectedResvId) {
    return '<h3>预约详情</h3><div class="detail-empty">点击日程表中的预约块<br>查看详情</div>';
  }
  const r = _reservations.find(x => x.id === _selectedResvId);
  if (!r) return '<h3>预约详情</h3><div class="detail-empty">预约不存在</div>';

  const now = nowServer();
  const startLocal = new Date(String(r.date).slice(0,10) + 'T' + String(r.startTime).slice(0,5));
  const endLocal = new Date(String(r.date).slice(0,10) + 'T' + String(r.endTime).slice(0,5));

  let status, statusCls;
  if (now < startLocal) { status = '未开始'; statusCls = 'upcoming'; }
  else if (now < endLocal) { status = '进行中'; statusCls = 'ongoing'; }
  else { status = '已结束'; statusCls = 'ended'; }

  // 参与人（含姓名）
  const participants = parseParticipants(r.participants);

  const isSelf = r.bookerId === _myId;
  // 管理员可管理任何预约；普通用户仅可管理自己作为主预约人的预约
  const canManage = isSelf || _isAdmin;
  // 修改：管理员无视时间；普通用户未结束（含进行中）可改
  const canEdit = _isAdmin || (isSelf && now < endLocal);
  // 取消：管理员无视时间；普通用户未结束（含进行中）可取消
  const canCancel = _isAdmin || (isSelf && now < endLocal);
  // 是否可修改开始时间（管理员始终可；普通用户仅未开始时）
  const canEditStart = _isAdmin || (isSelf && now < startLocal);

  let html = '<h3>预约详情</h3>';
  html += '<div class="detail-card">'
    + '<div class="dc-row"><span class="dc-label">状态</span><span class="dc-value"><span class="dc-status ' + statusCls + '">' + status + '</span></span></div>'
    + '<div class="dc-row"><span class="dc-label">日期</span><span class="dc-value">' + String(r.date).slice(0,10) + '</span></div>'
    + '<div class="dc-row"><span class="dc-label">时间</span><span class="dc-value">' + fmtTime(r.startTime) + ' ~ ' + fmtTime(r.endTime) + '</span></div>'
    + '<div class="dc-row"><span class="dc-label">预约人</span><span class="dc-value">' + escHtml(r.bookerName || r.bookerId) + (isSelf ? '（我）' : '') + '</span></div>'
    + '<div class="dc-row dc-part"><span class="dc-label">参与人</span><span class="dc-value">';

  if (!participants.length) {
    html += '<span style="color:#999">无</span>';
  } else {
    participants.forEach(pt => {
      const isBooker = pt.personalId === r.bookerId;
      html += '<span class="tag' + (isBooker ? ' self' : '') + '">' + escHtml(pt.name || pt.personalId) + '</span>';
    });
  }
  html += '</span></div>'
    + '<div class="dc-row"><span class="dc-label">创建时间</span><span class="dc-value">' + String(r.createdAt || '').replace('T',' ').slice(0,16) + '</span></div>'
    + '</div>';

  if (canManage) {
    html += '<div class="detail-actions">';
    if (canEdit) {
      html += '<button class="btn-edit-resv" onclick="openEditModal(' + r.id + ')">'
        + (_isAdmin ? '⚙️ 修改预约' : (canEditStart ? '✏️ 修改预约' : '⏰ 修改结束时间')) + '</button>';
    } else {
      html += '<button class="btn-edit-resv" disabled>' + (now >= endLocal ? '已结束' : '✏️ 修改预约') + '</button>';
    }
    if (canCancel) {
      html += '<button class="btn-cancel-resv" onclick="cancelReservation(' + r.id + ')">🗑 取消预约</button>';
    } else {
      html += '<button class="btn-cancel-resv" disabled>' + (now >= endLocal ? '已结束不可取消' : '🗑 取消预约') + '</button>';
    }
    if (_isAdmin && !isSelf) {
      html += '<div style="font-size:11px;color:#fa8c16;margin-top:8px;text-align:center">👑 管理员权限：可修改/删除该预约</div>';
    }
    html += '</div>';
  }

  return html;
}

// 选中预约
function selectReservation(id) {
  _selectedResvId = id;
  const main = document.getElementById('rooms-main');
  if (main) {
    main.querySelectorAll('.resv-block').forEach(b => b.classList.remove('active'));
    const block = main.querySelector('.resv-block[data-id="' + id + '"]');
    if (block) block.classList.add('active');
    const panel = main.querySelector('#detail-panel');
    if (panel) panel.innerHTML = renderDetailPanel();
  }
}

// ===== 预约模态框 =====
function openCreateModal() {
  _editingId = null;
  _participants = [];
  const meName = '';
  api('/auth/me').then(r => {
    const name = r.success ? (r.data.name || '') : '';
    buildResvModal(null, name);
  }).catch(() => buildResvModal(null, ''));
}

function openEditModal(id) {
  const r = _reservations.find(x => x.id === id);
  if (!r) { showToast('预约不存在', 'error'); return; }
  _editingId = id;
  // 初始化参与人（数组对象 {personalId, name}）
  const plist = parseParticipants(r.participants);
  _participants = plist.map(pt => ({
    personalId: pt.personalId || pt,
    name: pt.name || pt,
    isOrchestraMember: 1
  }));
  api('/auth/me').then(res => {
    const meName = res.success ? (res.data.name || '') : '';
    buildResvModal(r, meName);
  });
}

function buildResvModal(r, meName) {
  const isEdit = !!r;
  const now = nowServer();
  const todayStr = fmtDate(now);

  // 编辑时计算规则（管理员可无视时间要求，任意修改）
  let allowEditStart = true;
  let endMin = '';
  let startVal = '', endVal = '', dateVal = '';
  if (isEdit) {
    dateVal = String(r.date).slice(0, 10);
    startVal = fmtTime(r.startTime);
    endVal = fmtTime(r.endTime);
    if (!_isAdmin) {
      const startLocal = new Date(dateVal + 'T' + startVal);
      const endLocal = new Date(dateVal + 'T' + endVal);
      if (now >= startLocal && now < endLocal) {
        allowEditStart = false;
        endMin = fmtTime(new Date(now.getTime() + 60000)); // 当前时间+1分钟
      }
    }
  } else {
    dateVal = todayStr;
    startVal = '19:00';
    endVal = '20:00';
  }

  const me = { personalId: _myId, name: meName, isOrchestraMember: 1 };

  let html = '<div class="resv-modal-head"><h3>' + (isEdit ? (allowEditStart ? '修改预约' : '修改结束时间') : '新建预约') + '</h3>'
    + '<button class="resv-modal-close" onclick="closeModal()">✕</button></div>'
    + '<div class="resv-form">'
    + '<div class="form-group"><label>琴房</label>'
    + '<div style="padding:9px 12px;background:#f5f5f5;border-radius:8px;font-size:14px;color:#333">' + escHtml((_rooms.find(x=>x.roomId===_currentRoomId)||{}).name || _currentRoomId) + '</div></div>'
    + '<div class="form-group"><label>预约日期</label>'
    + '<input type="date" id="rv-date" value="' + dateVal + '" min="' + todayStr + '"' + (isEdit ? ' disabled' : '') + '></div>'
    + '<div class="time-row">'
    + '<div class="form-group"><label>开始时间</label>'
    + '<input type="time" id="rv-start" value="' + startVal + '" min="07:00" max="22:30"' + (!allowEditStart ? ' disabled' : '') + '></div>'
    + '<div class="form-group"><label>结束时间</label>'
    + '<input type="time" id="rv-end" value="' + endVal + '" min="' + (endMin || '07:00') + '" max="22:30"></div>'
    + '</div>'
    + '<div class="form-group"><label>参与人（含主预约人，最多 ' + MAX_PARTICIPANTS + ' 人）</label>'
    + '<div class="participant-input-wrap" id="p-input-wrap">'
    + '<span class="p-tag self">' + escHtml(meName || _myId) + '（我）</span>'
    + '<input id="p-search-input" type="text" placeholder="输入姓名或 personId 搜索添加" autocomplete="off">'
    + '</div>'
    + '<div id="p-search-results"></div>'
    + '<div class="p-error-msg" id="p-error"></div>'
    + '<div class="p-hint">💡 输入姓名模糊搜索或精确输入 personId</div>'
    + '<div class="p-count" id="p-count"></div>'
    + '</div>'
    + '</div>'
    + '<div class="resv-form-actions">'
    + '<button class="btn-cancel" onclick="closeModal()">取消</button>'
    + '<button class="btn-ok" id="btn-submit" onclick="submitReservation()">' + (isEdit ? '保存修改' : '确认预约') + '</button>'
    + '</div>';

  openModal(html);

  // 渲染已添加参与人标签
  _participants.forEach(p => renderParticipantTag(p));
  renderPCount();
  bindParticipantSearch();
  bindTimeValidation();
}

// 渲染参与人标签
function renderParticipantTag(p) {
  const wrap = document.getElementById('p-input-wrap');
  if (!wrap) return;
  const isSelf = p.personalId === _myId;
  if (isSelf) return; // 主预约人标签已在模态框模板中
  const cls = p.isOrchestraMember ? '' : ' non-member';
  const span = document.createElement('span');
  span.className = 'p-tag' + cls;
  span.dataset.pid = p.personalId;
  span.innerHTML = escHtml(p.name || p.personalId)
    + (p.isOrchestraMember ? '' : ' <span style="font-size:11px;color:#cf1322">(非成员)</span>')
    + '<span class="p-tag-x" onclick="removeParticipant(this)">✕</span>';
  const input = document.getElementById('p-search-input');
  wrap.insertBefore(span, input);
}

function removeParticipant(el) {
  const span = el.closest('.p-tag');
  if (!span) return;
  const pid = span.dataset.pid;
  _participants = _participants.filter(p => p.personalId !== pid);
  span.remove();
  renderPCount();
}

function renderPCount() {
  const el = document.getElementById('p-count');
  if (!el) return;
  const total = _participants.length + 1; // +主预约人
  el.textContent = '已添加 ' + total + '/' + MAX_PARTICIPANTS + ' 人';
  if (total >= MAX_PARTICIPANTS) el.style.color = '#fa8c16';
  else el.style.color = '#999';
}

// 参与者搜索（防抖）
let _searchTimer = null;
function bindParticipantSearch() {
  const input = document.getElementById('p-search-input');
  if (!input) return;
  input.addEventListener('input', function () {
    clearTimeout(_searchTimer);
    const q = this.value.trim();
    const resultsEl = document.getElementById('p-search-results');
    if (!q) { resultsEl.innerHTML = ''; return; }
    _searchTimer = setTimeout(() => doParticipantSearch(q), 300);
  });
}

async function doParticipantSearch(q) {
  const resultsEl = document.getElementById('p-search-results');
  const errEl = document.getElementById('p-error');
  if (!resultsEl) return;
  try {
    const res = await api('/persons/search?q=' + encodeURIComponent(q));
    if (!res.success || !res.data || !res.data.length) {
      errEl.textContent = '查无此人，请重新输入';
      resultsEl.innerHTML = '';
      return;
    }
    errEl.textContent = '';
    let html = '<div class="p-search-results">';
    res.data.forEach(p => {
      // 已在列表中的跳过
      if (p.personalId === _myId || _participants.some(x => x.personalId === p.personalId)) return;
      const isMember = p.isOrchestraMember == 1;
      html += '<div class="p-search-item" onclick="addParticipant(\'' + p.personalId + '\', \'' + escHtml(p.name).replace(/'/g,"\\'") + '\', ' + (isMember ? 1 : 0) + ')">'
        + '<span class="psi-name">' + escHtml(p.name) + '</span>'
        + '<span class="psi-id">' + escHtml(p.personalId) + '</span>'
        + '<span class="psi-badge ' + (isMember ? 'member' : 'nonmember') + '">' + (isMember ? '乐团成员' : '非乐团成员') + '</span>'
        + '</div>';
    });
    if (!html.includes('p-search-item')) {
      html = '<div class="p-search-results"><div class="p-search-item" style="color:#999;cursor:default">该人员已在列表中</div></div>';
    }
    html += '</div>';
    resultsEl.innerHTML = html;
  } catch (e) {
    errEl.textContent = '搜索失败，请稍后重试';
    resultsEl.innerHTML = '';
  }
}

// 添加参与者（非乐团成员需二次确认）
function addParticipant(pid, name, isMember) {
  const resultsEl = document.getElementById('p-search-results');
  const errEl = document.getElementById('p-error');
  if (_participants.length + 1 >= MAX_PARTICIPANTS) {
    errEl.textContent = '参与人数量已达上限（' + MAX_PARTICIPANTS + ' 人）';
    return;
  }
  if (!isMember) {
    // 非乐团成员：弹出须知确认
    _pendingNonMember = { pid, name };
    showNonMemberNotice(pid, name);
    return;
  }
  _participants.push({ personalId: pid, name, isOrchestraMember: 1 });
  renderParticipantTag({ personalId: pid, name, isOrchestraMember: 1 });
  renderPCount();
  if (resultsEl) resultsEl.innerHTML = '';
  if (errEl) errEl.textContent = '';
  const input = document.getElementById('p-search-input');
  if (input) input.value = '';
}

// 非乐团成员须知弹窗
function showNonMemberNotice(pid, name) {
  const overlay = document.createElement('div');
  overlay.className = 'notice-overlay';
  overlay.id = 'notice-overlay';
  overlay.innerHTML = '<div class="notice-box">'
    + '<h4>⚠️ 添加非乐团成员</h4>'
    + '<div class="notice-text">非乐团成员必须在乐团成员同意后才可进入琴房，请注意爱惜琴房财物！</div>'
    + '<label class="notice-check"><input type="checkbox" id="notice-agree"> 已阅读并同意上述须知</label>'
    + '<div class="notice-actions">'
    + '<button class="btn-cancel" onclick="closeNonMemberNotice()">取消</button>'
    + '<button class="btn-confirm" id="notice-confirm" disabled onclick="confirmNonMember()">确认添加</button>'
    + '</div></div>';
  document.body.appendChild(overlay);
  document.getElementById('notice-agree').addEventListener('change', function () {
    document.getElementById('notice-confirm').disabled = !this.checked;
  });
}

function closeNonMemberNotice() {
  _pendingNonMember = null;
  const ov = document.getElementById('notice-overlay');
  if (ov) ov.remove();
}

function confirmNonMember() {
  if (!_pendingNonMember) return;
  const { pid, name } = _pendingNonMember;
  _participants.push({ personalId: pid, name, isOrchestraMember: 0 });
  renderParticipantTag({ personalId: pid, name, isOrchestraMember: 0 });
  renderPCount();
  const resultsEl = document.getElementById('p-search-results');
  const errEl = document.getElementById('p-error');
  if (resultsEl) resultsEl.innerHTML = '';
  if (errEl) errEl.textContent = '';
  const input = document.getElementById('p-search-input');
  if (input) input.value = '';
  closeNonMemberNotice();
  showToast('已添加非乐团成员：' + name, 'success');
}

// 时间输入校验
function bindTimeValidation() {
  const start = document.getElementById('rv-start');
  const end = document.getElementById('rv-end');
  if (start && end) {
    start.addEventListener('change', () => {
      if (end.value && end.value <= start.value) {
        // 自动调整为开始+30分钟
        const [h, m] = start.value.split(':').map(Number);
        const total = h * 60 + m + 30;
        if (total > CLOSE_MIN) { showToast('开始时间过晚，无法安排30分钟', 'error'); start.value = '22:00'; }
        else end.value = pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
      }
    });
  }
}

// ===== 提交预约 =====
async function submitReservation() {
  const btn = document.getElementById('btn-submit');
  if (!btn || btn.disabled) return;
  btn.disabled = true;

  const date = document.getElementById('rv-date').value;
  const start = document.getElementById('rv-start').value;
  const end = document.getElementById('rv-end').value;

  // 校验
  if (!date) { showToast('请选择预约日期', 'error'); btn.disabled = false; return; }
  if (!start || !end) { showToast('请选择起止时间', 'error'); btn.disabled = false; return; }
  if (start < '07:00' || end > '22:30') { showToast('预约时间必须在 07:00 ~ 22:30 之间', 'error'); btn.disabled = false; return; }
  if (end <= start) { showToast('结束时间必须晚于开始时间', 'error'); btn.disabled = false; return; }
  // 不跨天（date 同一天已由日期选择器保证，这里无需额外校验）

  const participants = _participants.map(p => p.personalId);

  const body = { roomId: _currentRoomId, date, startTime: start, endTime: end, participants };

  try {
    let res;
    if (_editingId) {
      res = await fetch('/api/reservations/' + _editingId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(r => r.json());
    } else {
      res = await fetch('/api/reservations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(r => r.json());
    }
    if (res.success) {
      closeModal();
      showToast(res.message || '操作成功');
      await loadWeek();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (e) {
    showToast('网络错误，请稍后重试', 'error');
  }
  btn.disabled = false;
}

// ===== 取消预约 =====
async function cancelReservation(id) {
  if (!confirm('确定要取消该预约吗？')) return;
  try {
    const res = await fetch('/api/reservations/' + id, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('预约已取消');
      _selectedResvId = null;
      await loadWeek();
    } else {
      showToast(res.message || '取消失败', 'error');
    }
  } catch (e) {
    showToast('网络错误，请稍后重试', 'error');
  }
}
