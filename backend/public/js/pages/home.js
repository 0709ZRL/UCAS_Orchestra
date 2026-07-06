// 首页渲染（含文章详情弹窗）
async function renderHomepage() {
  const el = document.getElementById('page-home');
  if (!el) return;

  const [marqueeRes, sectionRes] = await Promise.all([
    fetch('/api/articles?limit=6').then(r => r.json()),
    Promise.all([0, 1, 2].map(t => fetch('/api/articles?type=' + t + '&limit=10').then(r => r.json())))
  ]);

  let html = '<div class="homepage-wrap">';

  // 走马灯
  html += '<div class="home-marquee"><div class="marquee-inner" id="marqueeInner">';
  if (marqueeRes && marqueeRes.success && marqueeRes.data && marqueeRes.data.length) {
    for (let round = 0; round < 3; round++) {
      marqueeRes.data.forEach(a => {
        html += '<span class="marquee-item" onclick="showArticleDetail(' + a.articleId + ')">'
          + '<span class="mtag ' + TYPE_TAGS[a.type] + '">' + TYPE_LABELS[a.type] + '</span> '
          + escHtml(a.title) + '</span>';
      });
    }
  }
  html += '</div></div>';

  // 三板块
  html += '<div class="home-sections">';
  for (let t = 0; t < 3; t++) {
    html += '<div class="home-section"><h3 class="hs-title hs-' + t + '">' + TYPE_LABELS[t] + '</h3><div class="hs-list">';
    if (sectionRes[t] && sectionRes[t].success && sectionRes[t].data && sectionRes[t].data.length) {
      sectionRes[t].data.forEach(a => {
        html += '<div class="hs-card" onclick="showArticleDetail(' + a.articleId + ')">'
          + '<div class="hs-card-title">' + escHtml(a.title) + '</div>'
          + '<div class="hs-card-summary">' + escHtml((a.summary || a.content || '暂无').substring(0, 120)) + '</div>'
          + '<div class="hs-card-date">' + (a.createdAt ? a.createdAt.replace('T', ' ').substring(0, 16) : '') + '</div></div>';
      });
    } else {
      html += '<div class="hs-empty">暂无</div>';
    }
    html += '</div></div>';
  }
  html += '</div></div>';
  el.innerHTML = html;
}

// 文章详情（在首页内嵌显示）
async function showArticleDetail(id) {
  if (!id) return;
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
    + '<div style="margin-bottom:16px"><button class="btn" onclick="window.location.href=\'/home\'" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回首页</button></div>'
    + '<h2 style="font-size:22px;margin-bottom:8px">' + escHtml(a.title) + '</h2>'
    + '<div style="font-size:14px;color:#999;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0f0f0">'
    + '<span class="mtag ' + TYPE_TAGS[a.type] + '" style="margin-right:10px">' + TYPE_LABELS[a.type] + '</span>'
    + (a.createdAt || '').replace('T', ' ').substring(0, 16)
    + '</div>'
    + '<div style="font-size:15px;line-height:1.9;color:#444;white-space:pre-wrap">' + escHtml(a.content || '无内容') + '</div>'
    + '<div style="margin-top:24px"><button class="btn" onclick="window.location.href=\'/home\'" style="background:linear-gradient(135deg,#6c757d,#495057)">← 返回首页</button></div>'
    + '</div>';
}

// 点击主区域关闭侧栏（移动端）
document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  // 检查登录
  checkAuth().then(ok => {
    if (ok) renderHomepage();
  });
});
