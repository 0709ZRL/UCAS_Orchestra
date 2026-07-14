// ===== 文章管理页面 =====
let _editId = null;
let _uploadedImages = [];
let _uploadedFiles = [];

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) renderArticleList();
  });
});

// ===== 1. 文章列表 =====
async function renderArticleList(page) {
  page = page || 1;
  const el = document.getElementById('page-articles');
  if (!el) return;
  const title = document.getElementById('af-title')?.value || '';
  const type = document.getElementById('af-type')?.value || '';
  const dateFrom = document.getElementById('af-dateFrom')?.value || '';
  const dateTo = document.getElementById('af-dateTo')?.value || '';
  let url = '/api/articles?limit=15&page=' + page;
  if (title) url += '&title=' + encodeURIComponent(title);
  if (type) url += '&type=' + type;
  if (dateFrom) url += '&dateFrom=' + dateFrom;
  if (dateTo) url += '&dateTo=' + dateTo;
  const res = await fetch(url).then(r => r.json());
  if (!res.success) { el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>'; return; }
  const list = res.data || [];
  const total = res.total || 0;
  const totalPages = Math.ceil(total / 15) || 1;
  let html = '<div style="max-width:1000px;margin:0 auto">'
    + '<div class="toolbar" style="margin-bottom:16px;justify-content:space-between">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<input id="af-title" placeholder="搜索标题..." value="' + escHtml(title) + '" style="padding:8px 12px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;width:160px">'
    + '<select id="af-type" style="padding:8px 12px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px">'
    + '<option value="">全部分类</option>'
    + '<option value="0"' + (type==='0'?' selected':'') + '>排练通知</option>'
    + '<option value="1"' + (type==='1'?' selected':'') + '>演出通知</option>'
    + '<option value="2"' + (type==='2'?' selected':'') + '>乐团新闻</option>'
    + '</select>'
    + '<input id="af-dateFrom" type="date" value="' + dateFrom + '" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;width:140px">'
    + '<span style="color:#999">至</span>'
    + '<input id="af-dateTo" type="date" value="' + dateTo + '" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;width:140px">'
    + '<button class="btn" onclick="renderArticleList(1)" style="background:linear-gradient(135deg,#667eea,#764ba2)">搜索</button>'
    + '</div>'
    + '<button class="btn btn-green" onclick="showArticleEditor()">＋ 发布文章</button>'
    + '</div>';
  if (!list.length) {
    html += '<div style="text-align:center;padding:60px;color:#ccc;font-size:16px">暂无文章</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr>'
      + '<th style="width:50px">ID</th>'
      + '<th>标题</th>'
      + '<th style="width:85px">类型</th>'
      + '<th style="width:170px">起止时间</th>'
      + '<th style="width:130px">创建时间</th>'
      + '<th style="width:120px">操作</th>'
      + '</tr></thead><tbody>';
    list.forEach(a => {
      const timeStr = (a.type === 0 || a.type === 1) && a.startTime
        ? (a.startTime || '').replace('T', ' ').substring(0, 16) + ' ~ ' + (a.endTime || '').replace('T', ' ').substring(0, 16)
        : '';
      html += '<tr>'
        + '<td>' + a.articleId + '</td>'
        + '<td><a style="cursor:pointer;color:#667eea;text-decoration:none" onclick="showArticleDetailView(' + a.articleId + ')">' + escHtml(a.title) + '</a></td>'
        + '<td><span class="mtag ' + TYPE_TAGS[a.type] + '">' + TYPE_LABELS[a.type] + '</span></td>'
        + '<td style="color:#999;font-size:12px">' + timeStr + '</td>'
        + '<td style="color:#999;font-size:13px">' + (a.createdAt || '').replace('T', ' ').substring(0, 16) + '</td>'
        + '<td class="actions">'
        + '<button class="btn-edit" onclick="showArticleEditor(' + a.articleId + ')">编辑</button>'
        + '<button class="btn-del" onclick="deleteArticle(' + a.articleId + ')">删除</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="pagination"><span>共 ' + total + ' 条</span>'
      + '<div><button onclick="renderArticleList(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>'
      + '<span style="margin:0 12px">' + page + '/' + totalPages + '</span>'
      + '<button onclick="renderArticleList(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '>下一页</button></div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
  scrollToTop();
}

// ===== 2. 文章详情查看 =====
async function showArticleDetailView(id) {
  const el = document.getElementById('page-articles');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px">⏳ 加载中...</div>';
  const res = await fetch('/api/articles/' + id).then(r => r.json());
  if (!res.success) { el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败</p>'; return; }
  const a = res.data;
  let attachments = [];
  try { attachments = a.attachments ? JSON.parse(a.attachments) : []; } catch(e) {}
  const images = a.images ? a.images.split(',').filter(Boolean) : [];
  let html = '<div style="max-width:900px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">'
    + '<div style="margin-bottom:16px;display:flex;gap:8px">'
    + '<button class="btn btn-secondary" onclick="renderArticleList()">← 返回列表</button>'
    + '<button class="btn" onclick="showArticleEditor(' + a.articleId + ')">✏️ 编辑</button>'
    + '</div>'
    + '<h2 style="font-size:22px;margin-bottom:8px">' + escHtml(a.title) + '</h2>'
    + '<div style="font-size:13px;color:#999;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0f0f0">'
    + '<span class="mtag ' + TYPE_TAGS[a.type] + '" style="margin-right:10px">' + TYPE_LABELS[a.type] + '</span>'
    + (a.createdAt || '').replace('T', ' ').substring(0, 16)
    + '</div>';
  // 渲染富文本内容
  html += '<div class="article-content" style="font-size:15px;line-height:1.9;color:#444">' + (a.content || '无内容') + '</div>';
  // 附件
  if (attachments.length) {
    html += '<div style="margin:16px 0;padding:16px;background:#f8f9ff;border-radius:8px">'
      + '<div style="font-weight:600;font-size:14px;margin-bottom:10px">📎 附件下载</div>';
    attachments.forEach(f => {
      const sizeStr = f.size ? (f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : (f.size/1024).toFixed(1)+'KB') : '';
      html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee">'
        + '<span style="flex:1;font-size:14px">' + escHtml(f.originalName || f.name) + '</span>'
        + '<span style="font-size:12px;color:#999">' + sizeStr + '</span>'
    '<a class="btn btn-sm" href="/uploads/articles/' + encodeURIComponent(f.filename) + '" download="' + (f.originalName || f.name) + '" style="background:linear-gradient(135deg,#2d8a4e,#1e6b38);text-decoration:none">📥 下载</a>'
        + '</div>';
    });
    html += '</div>';
  }
  html += '<div style="margin-top:20px"><button class="btn btn-secondary" onclick="renderArticleList()">← 返回列表</button></div></div>';
  el.innerHTML = html;
  scrollToTop();
}

// ===== 3. 删除 =====
async function deleteArticle(id) {
  if (!confirm('确认删除该文章？')) return;
  const res = await fetch('/api/articles/' + id, { method: 'DELETE' }).then(r => r.json());
  if (res.success) { showToast('已删除'); renderArticleList(); }
  else showToast(res.message, 'error');
}

// ===== 4. 文章编辑器 =====
async function showArticleEditor(id) {
  _editId = id || null;
  _uploadedImages = [];
  _uploadedFiles = [];
  const el = document.getElementById('page-articles');
  if (!el) return;
  let data = null;
  if (id) {
    el.innerHTML = '<div style="text-align:center;padding:40px">⏳ 加载中...</div>';
    const res = await fetch('/api/articles/' + id).then(r => r.json());
    if (res.success) data = res.data;
  }
  renderEditor(el, data);
}

function renderEditor(el, data) {
  const isEdit = !!data;
  const title = data ? data.title : '';
  const type = data ? data.type : 0;
  const content = data ? (data.content || '') : '';
  let attachments = [];
  try { if (data && data.attachments) attachments = JSON.parse(data.attachments); } catch(e) {}
  let images = data && data.images ? data.images.split(',').filter(Boolean) : [];
  _uploadedImages = [...images];
  _uploadedFiles = [...attachments];

  let editorContent = content;
  const fmtDT = (v) => v ? v.replace('T',' ').substring(0,16) : '';

  let html = '<div style="max-width:960px;margin:0 auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">'
    + '<h2 style="font-size:20px;margin-bottom:20px">' + (isEdit ? '编辑文章' : '发布文章') + '</h2>'
    + '<div class="form-group" style="margin-bottom:14px"><label>标题 *</label>'
    + '<input id="ae-title" type="text" value="' + escHtml(title) + '" placeholder="请输入文章标题" style="width:100%;padding:10px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:15px"></div>'
    + '<div class="form-group" style="margin-bottom:14px"><label>分类</label>'
    + '<select id="ae-type" onchange="toggleEventTimes()" style="width:100%;padding:10px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px">'
    + '<option value="0"' + (type==0?' selected':'') + '>排练通知</option>'
    + '<option value="1"' + (type==1?' selected':'') + '>演出通知</option>'
    + '<option value="2"' + (type==2?' selected':'') + '>乐团新闻</option>'
    + '</select></div>'
    + '<div id="ae-time-fields" style="display:' + (type==2?'none':'') + ';gap:12px;margin-bottom:14px">'
    + '<div class="form-group" style="flex:1"><label>活动开始时间</label>'
    + '<input id="ae-startTime" type="datetime-local" value="' + (data && data.startTime ? fmtDT(data.startTime) : '') + '" style="width:100%;padding:10px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px"></div>'
    + '<div class="form-group" style="flex:1"><label>活动结束时间</label>'
    + '<input id="ae-endTime" type="datetime-local" value="' + (data && data.endTime ? fmtDT(data.endTime) : '') + '" style="width:100%;padding:10px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px"></div>'
    + '</div>'
    + '<div class="form-group" style="margin-bottom:14px"><label>正文内容</label>'
    + '<div style="border:1px solid #d9d9d9;border-radius:8px;overflow:hidden">'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid #eee;background:#fafafa">'
    + '<button type="button" class="editor-btn" onclick="execCmd(\'bold\')" title="加粗"><b>B</b></button>'
    + '<button type="button" class="editor-btn" onclick="execCmd(\'italic\')" title="斜体"><i>I</i></button>'
    + '<button type="button" class="editor-btn" onclick="execCmd(\'underline\')" title="下划线"><u>U</u></button>'
    + '<span style="color:#ddd">|</span>'
    + '<button type="button" class="editor-btn" onclick="insertImage()" title="插入图片">🖼 图片</button>'
    + '<button type="button" class="editor-btn" onclick="insertLink()" title="插入链接">🔗 链接</button>'
    + '<button type="button" class="editor-btn" onclick="insertVideo()" title="插入视频">🎬 视频</button>'
    + '<button type="button" class="editor-btn" onclick="uploadAttachment()" title="上传文件">📎 文件</button>'
    + '</div>'
    + '<div id="ae-editor" contenteditable="true" style="min-height:320px;padding:14px;font-size:15px;line-height:1.8;color:#333;outline:none">'
    + (isEdit ? editorContent : '') + '</div>'
    + '</div></div>'
    + '<div id="ae-files" style="margin-bottom:14px"></div>'
    + '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f0f0f0">'
    + '<button class="btn btn-secondary" onclick="renderArticleList()">取消</button>'
    + '<button class="btn btn-green" onclick="saveArticle()">' + (isEdit ? '保存修改' : '发布') + '</button>'
    + '</div></div>';
  el.innerHTML = html;
  if (_uploadedFiles.length) renderFileList();
  scrollToTop();
}

// 编辑命令
function execCmd(cmd, val) {
  document.execCommand(cmd, false, val || null);
  document.getElementById('ae-editor')?.focus();
}

// 插入图片
function insertImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function() {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('image', input.files[0]);
    const res = await fetch('/api/articles/upload-image', { method: 'POST', body: fd }).then(r => r.json());
    if (res.success) {
      _uploadedImages.push(res.filename);
      execCmd('insertHTML', '<br><img src="' + res.url + '" style="max-width:100%;max-height:500px;border-radius:6px;margin:8px 0"><br>');
      showToast('图片已插入');
    } else showToast(res.message, 'error');
  };
  input.click();
}

// 插入链接
function insertLink() {
  const url = prompt('请输入链接地址：', 'https://');
  if (!url) return;
  const text = prompt('请输入链接文字：', '点击访问');
  if (!text) return;
  execCmd('insertHTML', '<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
}

// 插入视频
function insertVideo() {
  const url = prompt('请输入视频嵌入地址：', 'https://');
  if (!url) return;
  const width = prompt('视频宽度（px）：', '560') || '560';
  const height = prompt('视频高度（px）：', '315') || '315';
  execCmd('insertHTML', '<br><iframe src="' + escHtml(url) + '" width="' + width + '" height="' + height + '" frameborder="0" allowfullscreen style="max-width:100%;border-radius:8px;margin:8px 0"></iframe><br>');
}

// 上传附件
async function uploadAttachment() {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async function() {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const res = await fetch('/api/articles/upload-file', { method: 'POST', body: fd }).then(r => r.json());
    if (res.success) {
      _uploadedFiles.push({ filename: res.filename, originalName: res.originalName, size: res.size });
      renderFileList();
      execCmd('insertHTML', '<br><a href="' + res.url + '" download="' + (res.originalName || '') + '" style="display:inline-block;padding:6px 16px;background:#f0f2f5;border-radius:6px;text-decoration:none;color:#333;font-size:14px;margin:4px 0">📎 ' + escHtml(res.originalName) + '</a><br>');
      showToast('文件已上传');
    } else showToast(res.message, 'error');
  };
  input.click();
}

// 附件列表渲染
function renderFileList() {
  const el = document.getElementById('ae-files');
  if (!el) return;
  if (!_uploadedFiles.length) { el.innerHTML = ''; return; }
  let html = '<div style="padding:10px;background:#f8f9ff;border-radius:8px"><div style="font-weight:600;font-size:13px;margin-bottom:8px">📎 附件（' + _uploadedFiles.length + '个）</div>';
  _uploadedFiles.forEach((f, i) => {
    const sizeStr = f.size ? (f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : (f.size/1024).toFixed(1)+'KB') : '';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px">'
      + '<span style="flex:1">' + escHtml(f.originalName || f.name) + '</span>'
      + '<span style="color:#999">' + sizeStr + '</span>'
      + '<span style="color:#e94560;cursor:pointer;font-size:12px" onclick="_uploadedFiles.splice(' + i + ',1);renderFileList()">✕ 移除</span>'
      + '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ===== 5. 保存 =====
async function saveArticle() {
  if (window._submitting) return;
  const title = document.getElementById('ae-title')?.value?.trim();
  if (!title) { showToast('请输入标题', 'error'); return; }
  const type = parseInt(document.getElementById('ae-type')?.value || '0');
  const editor = document.getElementById('ae-editor');
  const content = editor ? editor.innerHTML : '';
  window._submitting = true;
  const body = { title, type, content };
  if (type !== 2) {
    const st = document.getElementById('ae-startTime')?.value;
    const et = document.getElementById('ae-endTime')?.value;
    if (st) body.startTime = st;
    if (et) body.endTime = et;
  }
  if (_uploadedFiles.length) body.attachments = JSON.stringify(_uploadedFiles);
  try {
    let res;
    if (_editId) {
      res = await fetch('/api/articles/' + _editId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    } else {
      res = await fetch('/api/articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    }
    if (res.success) {
      showToast(_editId ? '保存成功' : '发布成功');
      renderArticleList();
    } else {
      showToast(res.message, 'error');
    }
  } catch(e) { showToast('操作失败', 'error'); }
  window._submitting = false;
}

// 显示/隐藏活动时间字段
function toggleEventTimes() {
  const t = parseInt(document.getElementById('ae-type')?.value || '0');
  const el = document.getElementById('ae-time-fields');
  if (el) el.style.display = t === 2 ? 'none' : 'flex';
}

function scrollToTop() {
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
}
