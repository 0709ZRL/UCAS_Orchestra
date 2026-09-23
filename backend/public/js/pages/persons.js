document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadPage('persons');
  });
});

// ===== 成员列表单元格渲染 =====
// 头像占位（无头像时显示姓名首字）
function avatarFallback(text) {
  const ch = String(text || '?').trim().charAt(0) || '?';
  const safe = ch.replace(/[&<>"]/g, '');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">'
    + '<rect width="80" height="80" rx="40" fill="#e8eefc"/>'
    + '<text x="40" y="53" font-size="34" text-anchor="middle" fill="#7c8db5" font-family="sans-serif">' + safe + '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// 成员首列：头像 + 姓名 + 用户ID + 首席标记
function memberCellHTML(row) {
  const name = escHtml(row.name || '');
  const id = escHtml(row.personalId || '');
  const fb = escHtml(avatarFallback(row.name));
  const master = row.isMaster == 1 ? '<span class="tag tag-master">首席</span>' : '';
  return '<div class="member-cell">'
    + '<img class="member-avatar" loading="lazy" alt="" src="/api/persons/' + id + '/avatar"'
    + ' onerror="this.onerror=null;this.src=\'' + fb + '\'">'
    + '<div class="member-meta">'
    + '<div class="member-name">' + name + master + '</div>'
    + '<div class="member-id">' + id + '</div>'
    + '</div></div>';
}

// 职位列：琴房负责人 / 发展成员 / 声部长 / 管理职务 / 普通成员
function personTagsHTML(row) {
  const job = Number(row.job);
  const tags = [];
  if (job === JOB_ROOM_MANAGER) tags.push('<span class="tag tag-roommgr">琴房负责人</span>');
  else if (job === JOB_DEV_MEMBER) tags.push('<span class="tag tag-dev">发展成员</span>');
  else if (job === JOB_SECTION_LEADER) tags.push('<span class="tag tag-job">声部长</span>');
  if (row.isManager == 1) {
    const mj = (PROFILE_MAP.managerJob && PROFILE_MAP.managerJob[row.managerJob]) || '管理人员';
    tags.push('<span class="tag tag-manager">' + escHtml(mj) + '</span>');
  }
  if (!tags.length) tags.push('<span class="cell-empty">普通成员</span>');
  return '<div class="tag-list">' + tags.join('') + '</div>';
}

// ===== 发展成员（job=3）独立表格：不与正式成员混在一起 =====
// 页面级渲染钩子：loadPage 渲染完主表格后调用
window.afterLoadPage = function (page, el) {
  if (page === 'persons') renderDevMemberSection(el);
};

async function renderDevMemberSection(el) {
  if (!el) return;
  let html = '<div class="dev-section" id="dev-section">'
    + '<div class="dev-head"><span class="dev-title">🌱 发展成员</span>'
    + '<span class="dev-sub">正在发展中的人员（不占用正式成员名额，仅可查看琴房与个人信息）</span></div>'
    + '<div class="dev-body"><div class="loading-wrap"><div class="spin"></div><div>加载中...</div></div></div>'
    + '</div>';
  // 挂到主表格之后（分页条下方）
  el.insertAdjacentHTML('beforeend', html);

  const body = document.getElementById('dev-body') || el.querySelector('.dev-body');
  try {
    const res = await api('/persons?job=3&limit=200&page=1');
    if (!res.success) throw new Error();
    const list = res.data || [];
    const countEl = el.querySelector('.dev-title');
    if (countEl) countEl.textContent = '🌱 发展成员（' + (res.total || list.length) + '）';
    if (!list.length) {
      body.innerHTML = '<div class="dev-empty">暂无发展成员</div>';
      return;
    }
    const cols = [
      { key: 'personalId', label: '姓名 / 用户ID', _page: 'persons', _id: true, render: (row) => memberCellHTML(row) },
      { key: 'account', label: '账号' },
      { key: 'gender', label: '性别', render: (row) => row.gender == 1 ? '<span class="tag tag-male">男</span>' : '<span class="tag tag-female">女</span>' },
      { key: 'institute', label: '学院', render: (row) => row.institute ? escHtml(row.institute) : '<span class="cell-empty">—</span>' },
      { key: 'grade', label: '年级', render: (row) => row.grade ? escHtml(row.grade) : '<span class="cell-empty">—</span>' },
      { key: 'instrument', label: '乐器', render: (row) => instrumentSlotHTML(row.instrument) }
    ];
    body.innerHTML = '<div class="table-wrap">' + buildTable(list, cols, null) + '</div>';
    hydrateInstrumentBadges(body);
  } catch (e) {
    body.innerHTML = '<div class="dev-empty">加载失败</div>';
  }
}

const DASH_COLORS = ['#1890ff', '#00d4ff', '#7c5cff', '#ff4d6d', '#52c41a', '#fa8c16', '#fadb14', '#13c2c2', '#eb2f96', '#a0d911', '#2f54eb'];

// ===== 数据大屏 =====
async function showPersonDashboard() {
  const el = document.getElementById('page-persons');
  if (!el) return;
  el.innerHTML = '<div class="loading-wrap"><div class="spin"></div><div>加载数据中...</div></div>';
  try {
    const res = await api('/persons/stats');
    if (!res.success) throw new Error();
    el.innerHTML = renderDashboard(res.data);
    animateCounters();
  } catch (err) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:#999">加载失败，请稍后重试'
      + '<div style="margin-top:12px"><button class="retry-btn" onclick="showPersonDashboard()">🔄 重试</button></div></div>';
  }
}

// 渲染整个大屏
function renderDashboard(d) {
  const gender = d.gender || { male: 0, female: 0 };
  const sections = d.sections || [];
  const campuses = d.campuses || [];
  const total = d.total || 0;

  return '<div class="dash-wrap">'
    // 顶栏
    + '<div class="dash-header">'
    + '<div class="dash-title">🎵 乐团成员数据大屏</div>'
    + '<div class="dash-sub">Orchestra Member Analytics</div>'
    + '<button class="dash-back" onclick="loadPage(\'persons\')">← 返回成员列表</button>'
    + '</div>'

    // 总人数大数字卡片
    + '<div class="dash-hero">'
    + '<div class="dash-hero-label">乐团成员总数</div>'
    + '<div class="dash-hero-num"><span data-count="' + total + '">0</span><span class="dash-hero-unit">人</span></div>'
    + '<div class="dash-hero-sub">Members</div>'
    + '</div>'

    // 图表区
    + '<div class="dash-grid">'
    // 男女比例 - 环形图
    + '<div class="dash-card">'
    + '<div class="dash-card-title">👫 男女比例</div>'
    + donutChart([
        { label: '男', value: gender.male, color: '#1890ff' },
        { label: '女', value: gender.female, color: '#ff4d6d' }
      ], total)
    + '</div>'
    // 校区分布 - 柱状图
    + '<div class="dash-card">'
    + '<div class="dash-card-title">🏫 校区分布</div>'
    + barChart(campuses.map((c, i) => ({ label: c.name, value: c.count, color: DASH_COLORS[i % DASH_COLORS.length] })))
    + '</div>'
    + '</div>'

    // 声部分布 - 横向条形图（全宽卡片）
    + '<div class="dash-card dash-card-wide">'
    + '<div class="dash-card-title">🎼 声部分布</div>'
    + hBarChart(sections.map((s, i) => ({ label: s.name, value: s.count, color: DASH_COLORS[i % DASH_COLORS.length] })), total)
    + '</div>'
    + '</div>';
}

// 环形图（SVG donut）
function donutChart(segments, total) {
  const size = 180, r = 70, cx = 90, cy = 90;
  const stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const nonZero = segments.filter(s => s.value > 0);
  if (!nonZero.length) {
    return '<div class="dash-empty">暂无数据</div>';
  }
  let circles = '';
  nonZero.forEach(s => {
    const frac = s.value / (total || 1);
    const len = frac * circ;
    circles += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '"'
      + ' stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + (circ - len) + '"'
      + ' stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"'
      + ' style="transition:stroke-dasharray .8s ease">'
      + '<title>' + s.label + '：' + s.value + '</title></circle>';
    offset += len;
  });
  const malePct = total ? Math.round(segments[0].value / total * 100) : 0;
  const femalePct = total ? Math.round(segments[1].value / total * 100) : 0;
  let legend = '';
  nonZero.forEach(s => {
    legend += '<div class="dash-legend"><span class="dash-dot" style="background:' + s.color + '"></span>'
      + s.label + ' <b>' + s.value + '</b>（' + Math.round(s.value / (total || 1) * 100) + '%）</div>';
  });
  return '<div class="dash-donut-wrap">'
    + '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
    + circles
    + '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" class="dash-donut-center-main">' + (total || 0) + '</text>'
    + '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="dash-donut-center-sub">总人数</text>'
    + '</svg>'
    + '<div class="dash-legend-wrap">' + legend + '</div>'
    + '</div>';
}

// 纵向柱状图（SVG）
function barChart(items) {
  if (!items || !items.length) return '<div class="dash-empty">暂无数据</div>';
  const max = Math.max(...items.map(i => i.value), 1);
  const W = 260, H = 200, padB = 34, padT = 20, padX = 10;
  const innerH = H - padB - padT;
  const n = items.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.min(slot * 0.55, 46);
  let bars = '';
  items.forEach((it, i) => {
    const h = Math.max((it.value / max) * innerH, 2);
    const x = padX + slot * i + (slot - barW) / 2;
    const y = padT + (innerH - h);
    bars += '<g>'
      + '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="' + it.color + '" opacity="0.92">'
      + '<animate attributeName="height" from="0" to="' + h + '" dur="0.6s" fill="freeze"/>'
      + '<animate attributeName="y" from="' + (padT + innerH) + '" to="' + y + '" dur="0.6s" fill="freeze"/>'
      + '</rect>'
      + '<text x="' + (x + barW / 2) + '" y="' + (y - 5) + '" text-anchor="middle" class="dash-bar-val">' + it.value + '</text>'
      + '<text x="' + (x + barW / 2) + '" y="' + (H - 12) + '" text-anchor="middle" class="dash-bar-label">' + it.label + '</text>'
      + '</g>';
  });
  return '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" class="dash-bar">' + bars + '</svg>';
}

// 横向条形图（纯 div 实现）
function hBarChart(items, total) {
  if (!items || !items.length) return '<div class="dash-empty">暂无数据</div>';
  const max = Math.max(...items.map(i => i.value), 1);
  let html = '';
  items.forEach(it => {
    const pct = Math.round((it.value / max) * 100);
    html += '<div class="dash-hbar-row">'
      + '<div class="dash-hbar-label">' + it.label + '</div>'
      + '<div class="dash-hbar-track"><div class="dash-hbar-fill" style="width:0%;background:' + it.color + '" data-w="' + pct + '%">'
      + '<span class="dash-hbar-num">' + it.value + '人</span></div></div>'
      + '<div class="dash-hbar-pct">' + (total ? Math.round(it.value / total * 100) : 0) + '%</div>'
      + '</div>';
  });
  return '<div class="dash-hbars">' + html + '</div>';
}

// 数字滚动动画
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10) || 0;
    const dur = 1200, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  // 条形图填充动画
  setTimeout(() => {
    document.querySelectorAll('.dash-hbar-fill').forEach(f => {
      f.style.width = f.dataset.w;
    });
  }, 60);
}
