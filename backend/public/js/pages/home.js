// 首页渲染
// 将富文本HTML转为纯文本摘要（处理残缺标签、HTML实体）
function summarizeHtml(html, maxLen) {
  if (!html) return '';
  let s = html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // 去除所有 <...> 以及不完整的 <...（被截断的标签）
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen) + '…';
  return s;
}

async function renderHomepage() {
  const el = document.getElementById('page-home');
  if (!el) return;

  const [sectionRes, scoresRes] = await Promise.all([
    Promise.all([0, 1, 2].map(t => fetch('/api/articles?type=' + t + '&limit=30').then(r => r.json()))),
    fetch('/api/scores?limit=30').then(r => r.json())
  ]);

  // 根据视口高度计算每类最多展示卡片数
  const vh = window.innerHeight;
  const isMobile = window.innerWidth <= 800;
  const headerH = (document.querySelector('.header')?.offsetHeight || 52);
  const mainPad = 36;
  const wrapPad = 8;
  const marqueeH = 60;
  const titleH = 50;
  const cardEstH = 82;
  const availH = vh - headerH - mainPad - wrapPad - marqueeH - 20;
  let cardsPerSection;
  if (isMobile) {
    cardsPerSection = Math.max(1, Math.floor((availH - titleH * 4) / 4 / cardEstH));
  } else {
    // 桌面端2×2，减去一行标题后行高为 (availH - titleH*2) / 2
    cardsPerSection = Math.max(1, Math.floor(((availH - titleH * 2) / 2) / cardEstH));
  }

  let html = '<div class="homepage-wrap">';

  // 走马灯（三类文章每类取前3条）
  const marqueeItems = [];
  for (let t = 0; t < 3; t++) {
    const list = (sectionRes[t] && sectionRes[t].success && sectionRes[t].data) || [];
    marqueeItems.push(...list.slice(0, 3));
  }
  html += '<div class="home-marquee"><div class="marquee-inner" id="marqueeInner">';
  if (marqueeItems.length) {
    for (let round = 0; round < 3; round++) {
      marqueeItems.forEach(a => {
        html += '<span class="marquee-item" onclick="showArticleDetail(' + a.articleId + ')">'
          + '<span class="mtag ' + TYPE_TAGS[a.type] + '">' + TYPE_LABELS[a.type] + '</span> '
          + escHtml(a.title) + '</span>';
      });
    }
  }
  html += '</div></div>';

  // 四板块（3类文章 + 乐谱下载），2×2 布局
  html += '<div class="home-sections">';
  // 前三类是文章
  for (let t = 0; t < 3; t++) {
    const list = (sectionRes[t] && sectionRes[t].success && sectionRes[t].data) || [];
    const total = sectionRes[t] && sectionRes[t].total !== undefined ? sectionRes[t].total : list.length;
    const showList = list.slice(0, cardsPerSection);

    html += '<div class="home-section">'
      + '<h3 class="hs-title hs-' + t + '">' + TYPE_LABELS[t]
      + '<a class="hs-more" onclick="showAllArticles(' + t + ')" style="cursor:pointer">查看全部 ›</a>'
      + '</h3><div class="hs-list">';
    if (showList.length) {
      showList.forEach(a => {
        html += '<div class="hs-card" onclick="showArticleDetail(' + a.articleId + ')">'
          + '<div class="hs-card-title">' + escHtml(a.title) + '</div>'
          + '<div class="hs-card-summary">' + summarizeHtml(a.summary || a.content, 120) + '</div>'
          + '<div class="hs-card-date">' + (a.createdAt ? a.createdAt.replace('T', ' ').substring(0, 16) : '') + '</div></div>';
      });
    } else {
      html += '<div class="hs-empty">暂无</div>';
    }
    html += '</div></div>';
  }
  // 第四块：乐谱下载
  const t = 3;
  const scoreList = (scoresRes && scoresRes.success && scoresRes.data) || [];
  const scoreTotal = scoresRes && scoresRes.total !== undefined ? scoresRes.total : scoreList.length;
  const showScores = scoreList.slice(0, cardsPerSection);

  html += '<div class="home-section">'
    + '<h3 class="hs-title hs-' + t + '">' + TYPE_LABELS[t]
    + '<a class="hs-more" onclick="showAllScores(1)" style="cursor:pointer">查看全部 ›</a>'
    + '</h3><div class="hs-list">';
  if (showScores.length) {
    showScores.forEach(s => {
      const totalLabel = s.isTotal == 1 ? '总谱' : '分谱';
      html += '<div class="hs-card" onclick="showScoreDetail(' + s.scoreId + ')">'
        + '<div class="hs-card-title">' + escHtml(s.title) + '</div>'
        + '<div class="hs-card-subs">' + totalLabel + (s.section && s.section !== 'NaN' ? ' · ' + escHtml(s.section) : '') + '</div>'
        + '</div>';
    });
  } else {
    html += '<div class="hs-empty">暂无</div>';
  }
  html += '</div></div>';
  html += '</div></div>';
  el.innerHTML = html;
  scrollToTop();
  // 渲染完成后检查报名弹窗
  checkEventModal();
}

// ===== 活动报名弹窗 =====
function checkEventModal() {
  fetch('/api/register/next-event').then(r => r.json()).then(res => {
    if (!res.success || !res.data || res.data.registered) return;
    const ev = res.data;
    const overlay = document.createElement('div');
    overlay.id = 'rehearsal-overlay';
    overlay.innerHTML = '<div class="rehearsal-backdrop" onclick="closeRehearsal(event)"></div>'
      + '<div class="rehearsal-modal">'
      + '<div class="rehearsal-badge">📢 活动报名</div>'
      + '<h2 class="rehearsal-title">' + escHtml(ev.title) + '</h2>'
      + '<div class="rehearsal-time">🕐 ' + (ev.startTime || '').replace('T',' ').substring(0,16) + ' ~ ' + (ev.endTime || '').replace('T',' ').substring(0,16) + '</div>'
      + '<div class="rehearsal-desc">' + escHtml((ev.appendix || ev.title || '').substring(0, 200)) + '</div>'
      + '<div class="rehearsal-actions">'
      + '<button class="rehearsal-detail-btn" onclick="closeRehearsal()">关闭</button>'
      + '</div>'
      + '<div class="rehearsal-register-row">'
      + '<button class="rehearsal-register-btn" id="rehearsalRegBtn" onclick="doEventRegister(' + ev.articleId + ')">报 名</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.querySelector('.rehearsal-modal').classList.add('show');
    });
  }).catch(() => {});
}

// 关闭弹窗
function closeRehearsal(e) {
  if (e && e.target && !e.target.classList.contains('rehearsal-backdrop')) return;
  const overlay = document.getElementById('rehearsal-overlay');
  if (overlay) {
    overlay.querySelector('.rehearsal-modal')?.classList.remove('show');
    setTimeout(() => overlay.remove(), 400);
  }
}

// 报名活动
async function doEventRegister(eventId) {
  if (window._registering) return;
  window._registering = true;
  const btn = document.getElementById('rehearsalRegBtn');
  if (btn) { btn.textContent = '✓'; btn.classList.add('registered'); }
  const res = await fetch('/api/register/event/' + eventId, { method: 'POST', credentials: 'same-origin' }).then(r => r.json());
  if (res.success) {
    const overlay = document.getElementById('rehearsal-overlay');
    if (overlay) {
      overlay.querySelector('.rehearsal-modal')?.classList.add('hiding');
      setTimeout(() => { overlay.remove(); showToast('🎉 报名成功！'); }, 600);
    }
  } else {
    if (btn) { btn.textContent = '报 名'; btn.classList.remove('registered'); }
    showToast(res.message || '报名失败', 'error');
  }
  window._registering = false;
}

// 读取 cookie（保留备用）
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? m[2] : null;
}

// ===== 以下函数已在上方使用，但需在此重新声明以供 hoisting =====
// 注：showAllArticles 内有引用 goHome()，goHome() 内有引用 renderHomepage()
//     所以它们必须定义在 goHome 之前或使用 function 声明提升

// 乐谱详情
async function showScoreDetail(id) {
  if (!id) return;
  const expectedPath = '/score/' + id;
  if (window.location.pathname !== expectedPath) {
    history.pushState({ page: 'score', id: id }, '', expectedPath);
  } else {
    history.replaceState({ page: 'score', id: id }, '', expectedPath);
  }
  document.title = '乐谱详情 - 乐团管理平台';
  const el = document.getElementById('page-home');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:20px">⏳</div><div>加载中...</div></div>';
  const res = await fetch('/api/scores/' + id).then(r => r.json());
  if (!res.success) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>';
    return;
  }
  const s = res.data;
  const totalLabel = s.isTotal == 1 ? '总谱' : '分谱';
  const sectionLabel = (s.section && s.section !== 'NaN') ? escHtml(s.section) : '未指定';
  const pdfUrl = '/api/scores/' + s.scoreId + '/file';
  let html = '<div class="sd-wrap">'
    + '<div class="sd-header">'
    + '<button class="btn" onclick="history.back()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回</button>'
    + '<h2>' + escHtml(s.title) + '</h2>'
    + '</div>'
    + '<div class="sd-meta">'
    + '<span class="sd-meta-item"><strong>类型：</strong>' + totalLabel + '</span>'
    + '<span class="sd-meta-item"><strong>声部：</strong>' + sectionLabel + '</span>'
    + (s.filehash ? '<span class="sd-meta-item"><strong>文件哈希：</strong>' + s.filehash.substring(0, 16) + '…</span>' : '')
    + '</div>'
    + '<div class="sd-actions">'
    + '<a class="btn" href="' + pdfUrl + '" download style="background:linear-gradient(135deg,#2d8a4e,#1e6b38);box-shadow:0 2px 6px rgba(45,138,78,.3);text-decoration:none">📥 下载 PDF</a>'
    + '</div>'
    + '<div class="sd-viewer">';
  // 尝试用 embed 在线预览
  html += '<embed src="' + pdfUrl + '" type="application/pdf" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />'
    + '<div class="sd-no-file" style="display:none"><span>📄</span><div>无法在线预览，请使用下载按钮获取文件</div></div>'
    + '</div>'
    + '</div>';
  el.innerHTML = html;
  // embed 加载失败时显示 fallback
  const embed = el.querySelector('embed');
  if (embed) {
    embed.addEventListener('error', function() {
      this.style.display = 'none';
      const fb = this.nextElementSibling;
      if (fb) fb.style.display = 'flex';
    });
  }
  scrollToTop();
}

// 乐谱全部列表（含分页）
const SCORE_PAGE_SIZE = 12;
async function showAllScores(page) {
  page = page || 1;
  const expectedPath = '/scores-list';
  const searchParams = page > 1 ? '?page=' + page : '';
  const fullUrl = expectedPath + searchParams;
  if (window.location.pathname + window.location.search !== fullUrl) {
    history.pushState({ page: 'scores', page: page }, '', fullUrl);
  } else {
    history.replaceState({ page: 'scores', page: page }, '', fullUrl);
  }
  document.title = '乐谱下载 - 乐团管理平台';
  const el = document.getElementById('page-home');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:20px">⏳</div><div>加载中...</div></div>';
  const res = await fetch('/api/scores?limit=' + SCORE_PAGE_SIZE + '&page=' + page).then(r => r.json());
  if (!res.success || !res.data) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>';
    return;
  }
  const list = res.data;
  const total = res.total || 0;
  const totalPages = Math.ceil(total / SCORE_PAGE_SIZE) || 1;
  let html = '<div class="al-wrap">'
    + '<div class="al-header">'
    + '<button class="btn" onclick="history.back()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回</button>'
    + '<h2>乐谱下载（共' + total + '份）</h2>'
    + '</div>';
  if (!list.length) {
    html += '<div class="al-empty">暂无乐谱</div>';
  } else {
    list.forEach(s => {
      const totalLabel = s.isTotal == 1 ? '总谱' : '分谱';
      html += '<div class="al-card sc-card" onclick="showScoreDetail(' + s.scoreId + ')">'
        + '<span class="mtag t3 al-tag">乐谱</span>'
        + '<div class="al-body">'
        + '<div class="al-title">' + escHtml(s.title) + '</div>'
        + '<div class="al-summary">' + totalLabel + (s.section && s.section !== 'NaN' ? ' · ' + escHtml(s.section) : '') + '</div>'
        + '</div>'
        + '</div>';
    });
  }
  // 分页
  html += '<div class="al-pagination">';
  html += '<span style="color:#999;font-size:13px">共 ' + total + ' 份，第 ' + page + '/' + totalPages + ' 页</span>';
  html += '<div class="al-page-btns">';
  html += '<button class="btn btn-sm" onclick="showAllScores(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>';
  const maxShow = 5;
  let startP = Math.max(1, page - Math.floor(maxShow / 2));
  let endP = Math.min(totalPages, startP + maxShow - 1);
  if (endP - startP + 1 < maxShow) startP = Math.max(1, endP - maxShow + 1);
  for (let p = startP; p <= endP; p++) {
    html += '<button class="btn btn-sm' + (p === page ? ' btn-active' : '') + '" onclick="showAllScores(' + p + ')">' + p + '</button>';
  }
  html += '<button class="btn btn-sm" onclick="showAllScores(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '>下一页</button>';
  html += '</div></div>';
  html += '</div>';
  el.innerHTML = html;
  scrollToTop();
}

// 查看文章全部（按类型，含分页）
const PAGE_SIZE = 10;
async function showAllArticles(type, page) {
  page = page || 1;
  const expectedPath = '/articles/type/' + type;
  const searchParams = page > 1 ? '?page=' + page : '';
  const fullUrl = expectedPath + searchParams;
  if (window.location.pathname + window.location.search !== fullUrl) {
    history.pushState({ page: 'articles-type', type: type, page: page }, '', fullUrl);
  } else {
    history.replaceState({ page: 'articles-type', type: type, page: page }, '', fullUrl);
  }
  document.title = TYPE_LABELS[type] + ' - 乐团管理平台';
  const el = document.getElementById('page-home');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:20px">⏳</div><div>加载中...</div></div>';
  const res = await fetch('/api/articles?type=' + type + '&limit=' + PAGE_SIZE + '&page=' + page).then(r => r.json());
  if (!res.success || !res.data) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>';
    return;
  }
  const list = res.data;
  const total = res.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  let html = '<div class="al-wrap">'
    + '<div class="al-header">'
    + '<button class="btn" onclick="history.back()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回</button>'
    + '<h2>' + TYPE_LABELS[type] + '（共' + total + '条）</h2>'
    + '</div>';
  if (!list.length) {
    html += '<div class="al-empty">暂无内容</div>';
  } else {
    list.forEach(a => {
      html += '<div class="al-card" onclick="showArticleDetail(' + a.articleId + ')">'
        + '<span class="mtag ' + TYPE_TAGS[a.type] + ' al-tag">' + TYPE_LABELS[a.type] + '</span>'
        + '<div class="al-body">'
        + '<div class="al-title">' + escHtml(a.title) + '</div>'
        + '<div class="al-summary">' + summarizeHtml(a.summary || a.content, 80) + '</div>'
        + '</div>'
        + '<div class="al-date">' + (a.createdAt ? a.createdAt.replace('T', ' ').substring(0, 16) : '') + '</div>'
        + '</div>';
    });
  }
  // 分页
  html += '<div class="al-pagination">';
  html += '<span style="color:#999;font-size:13px">共 ' + total + ' 条，第 ' + page + '/' + totalPages + ' 页</span>';
  html += '<div class="al-page-btns">';
  html += '<button class="btn btn-sm" onclick="showAllArticles(' + type + ',' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>';
  // 页码按钮
  const maxShow = 5;
  let startP = Math.max(1, page - Math.floor(maxShow / 2));
  let endP = Math.min(totalPages, startP + maxShow - 1);
  if (endP - startP + 1 < maxShow) startP = Math.max(1, endP - maxShow + 1);
  for (let p = startP; p <= endP; p++) {
    html += '<button class="btn btn-sm' + (p === page ? ' btn-active' : '') + '" onclick="showAllArticles(' + type + ',' + p + ')">' + p + '</button>';
  }
  html += '<button class="btn btn-sm" onclick="showAllArticles(' + type + ',' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '>下一页</button>';
  html += '</div></div>';
  html += '</div>';
  el.innerHTML = html;
  scrollToTop();
}

// 文章详情（在首页内嵌显示，使用 History API 改变 URL）
async function showArticleDetail(id) {
  if (!id) return;
  const expectedPath = '/article/' + id;
  if (window.location.pathname !== expectedPath) {
    history.pushState({ page: 'article', id: id }, '', expectedPath);
  } else {
    history.replaceState({ page: 'article', id: id }, '', expectedPath);
  }
  document.title = '文章详情 - 乐团管理平台';
  const el = document.getElementById('page-home');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:20px">⏳</div><div>加载中...</div></div>';
  const res = await fetch('/api/articles/' + id).then(r => r.json());
  if (!res.success) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>';
    return;
  }
  const a = res.data;
  el.innerHTML = '<div style="max-width:800px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">'
    + '<div style="margin-bottom:16px"><button class="btn" onclick="history.back()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回</button></div>'
    + '<h2 style="font-size:22px;margin-bottom:8px">' + escHtml(a.title) + '</h2>'
    + '<div style="font-size:14px;color:#999;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0f0f0">'
    + '<span class="mtag ' + TYPE_TAGS[a.type] + '" style="margin-right:10px">' + TYPE_LABELS[a.type] + '</span>'
    + (a.createdAt || '').replace('T', ' ').substring(0, 16)
    + '</div>'
    + '<div class="article-content" style="font-size:15px;line-height:1.9;color:#444;padding:0 4px">' + (a.content || '无内容') + '</div>'
    + ((a.type === 0 || a.type === 1) && a.startTime ? '<div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap"><span style="font-size:13px;color:#888">🕐 ' + (a.startTime||'').replace('T',' ').substring(0,16) + ' ~ ' + (a.endTime||'').replace('T',' ').substring(0,16) + '</span></div>' : '')
    + '<div style="margin-top:24px;display:flex;gap:8px">'
    + '<button class="btn" onclick="history.back()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回</button>'
    + ((a.type === 0 || a.type === 1) && a.endTime && new Date(a.endTime) > new Date() ? '<button class="btn rehearsal-detail-reg-btn" onclick="doDetailRegister(' + a.articleId + ')">📝 报名</button>' : '')
    + '</div>'
    + '</div>';
  scrollToTop();
}

// 详情页报名
async function doDetailRegister(articleId) {
  if (window._registering) return;
  window._registering = true;
  const res = await fetch('/api/register/event/' + articleId, { method: 'POST', credentials: 'same-origin' }).then(r => r.json());
  if (res.success) showToast('🎉 报名成功！');
  else showToast(res.message || '报名失败', 'error');
  window._registering = false;
}

// 我的报名
async function showMyRegistrations() {
  const expectedPath = '/my-registrations';
  if (window.location.pathname !== expectedPath) {
    history.pushState({ page: 'my-registrations' }, '', expectedPath);
  } else {
    history.replaceState({ page: 'my-registrations' }, '', expectedPath);
  }
  document.title = '我的报名 - 乐团管理平台';
  const el = document.getElementById('page-home');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px">⏳ 加载中...</div>';
  const res = await fetch('/api/register/my', { credentials: 'same-origin' }).then(r => r.json());
  if (!res.success || !res.data) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>';
    return;
  }
  const list = res.data;
  const now = new Date();
  let html = '<div style="max-width:800px;margin:0 auto">'
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">'
    + '<button class="btn" onclick="goHome()" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回首页</button>'
    + '<h2 style="font-size:20px">我的报名（共' + list.length + '条）</h2>'
    + '</div>';
  if (!list.length) {
    html += '<div style="text-align:center;padding:60px;color:#ccc;font-size:16px">暂无报名记录</div>';
  } else {
    list.forEach(r => {
      if (!r.articleId) return; // 跳过无关联数据的记录
      const isPast = r.endTime && new Date(r.endTime) < now;
      const timeStr = r.startTime ? (r.startTime||'').replace('T',' ').substring(0,16) + ' ~ ' + (r.endTime||'').replace('T',' ').substring(0,16) : '';
      html += '<div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)">'
        + '<div style="display:flex;align-items:center;gap:12px">'
        + '<span class="mtag ' + (r.type === 0 || r.type === 1 ? TYPE_TAGS[r.type] : 't0') + '">' + (r.type === 0 ? '排练' : r.type === 1 ? '演出' : '活动') + '</span>'
        + '<span style="flex:1;font-weight:600;font-size:15px;cursor:pointer;color:#1a1a2e" onclick="showArticleDetail(' + r.articleId + ')">' + escHtml(r.title) + '</span>'
        + (isPast ? '<span style="font-size:12px;color:#999">已结束</span>' : '<button class="btn btn-sm" onclick="cancelRegistration(' + r.articleId + ')" style="background:linear-gradient(135deg,#e94560,#c73650)">取消报名</button>')
        + '</div>'
        + (timeStr ? '<div style="font-size:12px;color:#999;margin-top:6px">🕐 ' + timeStr + '</div>' : '')
        + '</div>';
    });
  }
  html += '</div>';
  el.innerHTML = html;
  scrollToTop();
}

// 取消报名
async function cancelRegistration(articleId) {
  if (!confirm('确定要取消报名吗？')) return;
  const res = await fetch('/api/register/event/' + articleId, { method: 'DELETE', credentials: 'same-origin' }).then(r => r.json());
  if (res.success) { showToast('已取消报名'); showMyRegistrations(); }
  else showToast(res.message || '取消失败', 'error');
}

// 返回首页（使用 History API）
function goHome() {
  if (window.location.pathname !== '/home') {
    history.pushState({ page: 'home' }, '', '/home');
  } else {
    history.replaceState({ page: 'home' }, '', '/home');
  }
  document.title = '首页 - 乐团管理平台';
  scrollToTop();
  renderHomepage();
}

// 处理浏览器前进/后退
window.addEventListener('popstate', function(e) {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const artMatch = path.match(/^\/article\/(\d+)$/);
  const typeMatch = path.match(/^\/articles\/type\/(\d+)$/);
  const scoreMatch = path.match(/^\/score\/(\d+)$/);
  const scoresMatch = path === '/scores-list';
  const myRegMatch = path === '/my-registrations';
  scrollToTop();
  if (artMatch) {
    showArticleDetail(parseInt(artMatch[1]));
  } else if (typeMatch) {
    showAllArticles(parseInt(typeMatch[1]), parseInt(params.get('page')) || 1);
  } else if (scoreMatch) {
    showScoreDetail(parseInt(scoreMatch[1]));
  } else if (scoresMatch) {
    showAllScores(parseInt(params.get('page')) || 1);
  } else if (myRegMatch) {
    showMyRegistrations();
  } else {
    document.title = '首页 - 乐团管理平台';
    renderHomepage();
  }
});

// 页面加载时根据 URL 决定显示内容
document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (!ok) return;
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const artMatch = path.match(/^\/article\/(\d+)$/);
    const typeMatch = path.match(/^\/articles\/type\/(\d+)$/);
    const scoreMatch = path.match(/^\/score\/(\d+)$/);
    const scoresMatch = path === '/scores-list';
    const myRegMatch = path === '/my-registrations';
    if (artMatch) {
      showArticleDetail(parseInt(artMatch[1]));
    } else if (typeMatch) {
      showAllArticles(parseInt(typeMatch[1]), parseInt(params.get('page')) || 1);
    } else if (scoreMatch) {
      showScoreDetail(parseInt(scoreMatch[1]));
    } else if (scoresMatch) {
      showAllScores(parseInt(params.get('page')) || 1);
    } else if (myRegMatch) {
      showMyRegistrations();
    } else {
      renderHomepage();
    }
  });
});

// 滚动主区域到顶部
function scrollToTop() {
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
}
