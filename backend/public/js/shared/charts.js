// ===== 共享图表组件（数据大屏用，纯 SVG/CSS 实现，无外部依赖）=====
const CHART_COLORS = ['#1890ff', '#00d4ff', '#7c5cff', '#ff4d6d', '#52c41a', '#fa8c16', '#fadb14', '#13c2c2', '#eb2f96', '#a0d911', '#2f54eb'];

// 环形图
function donutChart(segments, total, size = 180) {
  const r = 70, cx = 90, cy = 90, stroke = 22;
  const circ = 2 * Math.PI * r;
  const nonZero = (segments || []).filter(s => s.value > 0);
  if (!nonZero.length) return '<div class="dash-empty">暂无数据</div>';
  let offset = 0;
  let circles = '';
  nonZero.forEach(s => {
    const frac = s.value / (total || 1);
    const len = frac * circ;
    circles += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '"'
      + ' stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + (circ - len) + '"'
      + ' stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"'
      + '><title>' + s.label + '：' + s.value + '</title></circle>';
    offset += len;
  });
  let legend = '';
  nonZero.forEach(s => {
    legend += '<div class="dash-legend"><span class="dash-dot" style="background:' + s.color + '"></span>'
      + s.label + ' <b>' + s.value + '</b>（' + Math.round(s.value / (total || 1) * 100) + '%）</div>';
  });
  return '<div class="dash-donut-wrap">'
    + '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + circles
    + '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" class="dash-donut-center-main">' + (total || 0) + '</text>'
    + '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="dash-donut-center-sub">' + (segments && segments[0] && segments[0].centerLabel || '总人数') + '</text>'
    + '</svg>'
    + '<div class="dash-legend-wrap">' + legend + '</div></div>';
}

// 纵向柱状图
function barChart(items, W = 260, H = 200) {
  if (!items || !items.length) return '<div class="dash-empty">暂无数据</div>';
  const max = Math.max(...items.map(i => i.value), 1);
  const padB = 34, padT = 20, padX = 10;
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

// 分组柱状图（每类两组：如 总人次 / 平均）
function groupedBarChart(groups, W = 480, H = 220) {
  if (!groups || !groups.length) return '<div class="dash-empty">暂无数据</div>';
  const series = groups[0].bars || [];
  const max = Math.max(...groups.flatMap(g => (g.bars || []).map(b => b.value)), 1);
  const padB = 34, padT = 24, padX = 12;
  const innerH = H - padB - padT;
  const n = groups.length;
  const slot = (W - padX * 2) / n;
  const grpW = Math.min(slot * 0.7, 60);
  const barW = Math.min(grpW / series.length, 22);
  let bars = '';
  groups.forEach((g, i) => {
    const gx = padX + slot * i + (slot - grpW) / 2;
    g.bars.forEach((b, j) => {
      const h = Math.max((b.value / max) * innerH, 2);
      const x = gx + j * barW + (grpW - series.length * barW) / 2;
      const y = padT + (innerH - h);
      bars += '<g>'
        + '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="3" fill="' + b.color + '" opacity="0.92">'
        + '<animate attributeName="height" from="0" to="' + h + '" dur="0.6s" fill="freeze"/>'
        + '<animate attributeName="y" from="' + (padT + innerH) + '" to="' + y + '" dur="0.6s" fill="freeze"/>'
        + '</rect>'
        + '<text x="' + (x + barW / 2) + '" y="' + (y - 4) + '" text-anchor="middle" class="dash-bar-val" style="font-size:9px">' + b.value + '</text>'
        + '</g>';
    });
    // 类别标签（可能被柱子覆盖，放到底部并旋转/截断）
    const label = g.label.length > 4 ? g.label.slice(0, 4) + '…' : g.label;
    bars += '<text x="' + (gx + grpW / 2) + '" y="' + (H - 12) + '" text-anchor="middle" class="dash-bar-label" style="font-size:9px">' + label + '</text>';
  });
  return '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" class="dash-bar">' + bars + '</svg>';
}

// 横向条形图
function hBarChart(items) {
  if (!items || !items.length) return '<div class="dash-empty">暂无数据</div>';
  const max = Math.max(...items.map(i => i.value), 1);
  let html = '';
  items.forEach(it => {
    const pct = Math.round((it.value / max) * 100);
    html += '<div class="dash-hbar-row">'
      + '<div class="dash-hbar-label">' + it.label + '</div>'
      + '<div class="dash-hbar-track"><div class="dash-hbar-fill" style="width:0%;background:' + it.color + '" data-w="' + pct + '%">'
      + '<span class="dash-hbar-num">' + it.value + '</span></div></div>'
      + '<div class="dash-hbar-pct">' + (it.pct !== undefined ? it.pct + '%' : '') + '</div>'
      + '</div>';
  });
  return '<div class="dash-hbars">' + html + '</div>';
}

// 数字滚动 + 条形填充动画
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
  setTimeout(() => {
    document.querySelectorAll('.dash-hbar-fill').forEach(f => { f.style.width = f.dataset.w; });
  }, 60);
}

// 数字格式化（保留1位小数的平均）
function fmtNum(v) {
  const n = Number(v);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}
