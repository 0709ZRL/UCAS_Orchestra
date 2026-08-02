// 注册字段
const REG_FIELDS = [
  { key:'account', label:'账号', required:true },
  { key:'password', label:'密码', type:'password', required:true },
  { key:'name', label:'真实姓名', required:true },
  { key:'gender', label:'性别', type:'select', options:[{v:0,t:'女'},{v:1,t:'男'}], default:0 },
  { key:'institute', label:'学院' },
  { key:'grade', label:'年级' },
  { key:'campus', label:'校区', type:'select', options:[{v:0,t:'中关村校区'},{v:1,t:'玉泉路校区'},{v:3,t:'雁栖湖校区'},{v:4,t:'京内其他地区'},{v:5,t:'京外其他地区'}], default:0 },
  { key:'section', label:'声部', type:'select', options:[{v:0,t:'民族管乐声部'},{v:1,t:'弹拨一组'},{v:2,t:'弹拨二组'},{v:3,t:'胡琴声部'},{v:4,t:'提琴声部'},{v:5,t:'西洋木管声部'},{v:6,t:'西洋铜管声部'},{v:7,t:'低音声部'},{v:8,t:'钢琴声部'},{v:9,t:'打击声部'},{v:10,t:'无声部'}], default:0 },
  { key:'job', label:'职位', type:'select', options:[{v:0,t:'普通成员'},{v:1,t:'声部长'}], default:0 },
  { key:'isManager', label:'是否管理人员', type:'select', options:[{v:0,t:'否'},{v:1,t:'是'}], default:0 },
  { key:'managerJob', label:'管理职责', type:'select', options:[{v:0,t:'普通干事'},{v:1,t:'团长'},{v:2,t:'业务副团长'},{v:3,t:'人事副团长'},{v:4,t:'后勤组组长'},{v:5,t:'宣传组组长'},{v:6,t:'学生指挥'},{v:7,t:'指挥助理'},{v:8,t:'指挥'}], default:0 },
  { key:'instrument', label:'乐器（多个用分号分隔）' },
  { key:'isMaster', label:'声部首席', type:'select', options:[{v:0,t:'否'},{v:1,t:'是'}], default:0 }
];

// 裁剪变量
let _cropper = null;
let _regCropBlob = null;

// 角色持久化：登录后存 localStorage，供页面同步隐藏导航（防被屏蔽功能闪现）
function saveMe(me) {
  window._me = me || null;
  try {
    if (me) localStorage.setItem('_me', JSON.stringify(me));
    else localStorage.removeItem('_me');
  } catch (e) { /* 忽略 */ }
}

// 应用角色界面：按当前用户角色隐藏无权限的导航项；无权限的页面直接跳走（不显示界面/提示）
function applyRoleUI() {
  const me = window._me || {};
  const isManager = me.isManager == 1;
  // 维护 <html> 的 is-manager 类：与 shared.css 的 html:not(.is-manager) 规则协同，保证导航隐藏/显示一致
  const root = document.documentElement;
  if (isManager) root.classList.add('is-manager');
  else root.classList.remove('is-manager');
  // 文章管理/活动管理仅管理员可见（/events 重定向到 /articles）
  document.querySelectorAll('a[href="/articles"], a[href="/events"]').forEach(a => {
    a.style.display = isManager ? '' : 'none';
  });
  // 非管理员访问文章/活动管理页：直接跳回首页（界面与标题都不显示）
  if (!isManager && /^\/(articles|events)(\/|$)/.test(location.pathname)) {
    location.replace('/home');
  }
}

// 同步应用已存角色：本脚本在页面底部同步执行，配合 <head> 脚本与 CSS 规则，立即隐藏无权限导航，避免闪现
(function applyStoredRoleUI() {
  try {
    const saved = localStorage.getItem('_me');
    if (!saved) return;
    const me = JSON.parse(saved);
    window._me = me;
    if (me.isManager == 1) {
      document.documentElement.classList.add('is-manager');
    } else {
      document.querySelectorAll('a[href="/articles"], a[href="/events"]').forEach(a => {
        a.style.display = 'none';
      });
    }
  } catch (e) { /* 忽略 */ }
})();

// 登录后处理
function afterLogin(name) {
  const thumb = document.getElementById('avatarThumb');
  if (thumb) {
    // 带时间戳防缓存：头像接口有 24h 缓存，避免换用户登录后仍显示上一个用户头像
    thumb.src = '/api/auth/avatar?t=' + Date.now();
    thumb.onerror = function() {
      this.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#e0e0e0"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>');
    };
  }
  const dn = document.getElementById('dropName');
  if (dn) dn.textContent = name;
  api('/auth/me').then(r => {
    if (r.success) {
      const di = document.getElementById('dropId');
      if (di) di.textContent = 'ID: ' + r.data.personalId;
    }
  });
  // 显示应用、隐藏登录页
  const app = document.getElementById('app');
  const authPage = document.getElementById('auth-page');
  if (app) app.style.display = 'block';
  if (authPage) authPage.style.display = 'none';
}

// 检查登录状态
async function checkAuth() {
  const res = await api('/auth/me');
  if (res.success) {
    saveMe(res.data || null);
    afterLogin(res.data.name);
    applyRoleUI();
    return true;
  } else {
    saveMe(null);
    // 未登录，重定向到登录页
    window.location.href = '/login';
    return false;
  }
}

// 刷新当前用户角色信息（供页面加载后调用）
async function refreshMe() {
  const res = await api('/auth/me');
  if (res.success) {
    saveMe(res.data || null);
    applyRoleUI();
    return res.data;
  }
  saveMe(null);
  return null;
}

// 登录功能
async function doLogin() {
  if (window._submitting) return;
  window._submitting = true;
  const account = document.getElementById('loginAccount').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) {
    document.getElementById('authErr').textContent = '请填写账号和密码';
    window._submitting = false;
    return;
  }
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });
  if (res.success) {
    window.location.href = '/home';
  } else {
    document.getElementById('authErr').textContent = res.message;
  }
  window._submitting = false;
}

// 注册功能
async function doRegister() {
  if (window._submitting) return;
  window._submitting = true;
  const body = {};
  REG_FIELDS.forEach(f => {
    const el = document.getElementById('reg-' + f.key);
    if (!el) return;
    const val = el.value;
    if (f.required && !val) {
      document.getElementById('authErr').textContent = '请填写所有必填项';
      window._submitting = false;
      return;
    }
    if (f.type === 'select' || ['gender','campus','section','job','isManager','managerJob','isMaster'].includes(f.key))
      body[f.key] = parseInt(val || 0);
    else body[f.key] = val || null;
  });
  if (!body.account || !body.password || !body.name) {
    document.getElementById('authErr').textContent = '账号、密码、姓名为必填项';
    window._submitting = false;
    return;
  }
  const res = await api('/auth/register', { method: 'POST', body: JSON.stringify(body) });
  if (res.success) {
    if (_regCropBlob) {
      const fd = new FormData();
      fd.append('avatar', _regCropBlob, 'avatar.jpg');
      await fetch('/api/auth/avatar', { method: 'POST', body: fd });
      _regCropBlob = null;
    }
    window.location.href = '/home';
  } else {
    document.getElementById('authErr').textContent = res.message;
  }
  window._submitting = false;
}

// 退出登录
async function logout() {
  if (!confirm('确定要退出登录吗？')) return;
  await api('/auth/logout', { method: 'POST' });
  saveMe(null);
  window.location.href = '/login';
}

// 头像裁剪（注册场景）
function regStartCrop(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('cropImage');
    img.src = e.target.result;
    document.getElementById('cropModal').classList.add('active');
    if (_cropper) _cropper.destroy();
    _cropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, minCropBoxWidth: 100, minCropBoxHeight: 100 });
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}

// 头像裁剪（个人信息场景）
function startCrop(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('cropImage');
    img.src = e.target.result;
    document.getElementById('cropModal').classList.add('active');
    if (_cropper) _cropper.destroy();
    _cropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, minCropBoxWidth: 100, minCropBoxHeight: 100 });
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}

// 确认裁剪
async function confirmCrop() {
  if (!_cropper) return;
  const canvas = _cropper.getCroppedCanvas({ width: 256, height: 256 });
  _cropper.destroy();
  _cropper = null;
  closeCrop();
  // 判断是在注册页还是个人信息页
  if (document.getElementById('regAvatarPreview')) {
    // 注册场景
    canvas.toBlob(blob => {
      _regCropBlob = blob;
      document.getElementById('regAvatarPreview').src = URL.createObjectURL(blob);
    }, 'image/jpeg', 0.9);
  } else {
    // 个人信息场景
    canvas.toBlob(async blob => {
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      const res = await fetch('/api/auth/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        showToast('头像已更新');
        const thumb = document.getElementById('avatarThumb');
        if (thumb) thumb.src = '/api/auth/avatar?' + Date.now();
        const pa = document.getElementById('profileAvatar');
        if (pa) pa.src = '/api/auth/avatar?' + Date.now();
      } else {
        showToast(data.message, 'error');
      }
    }, 'image/jpeg', 0.9);
  }
}

function closeCrop() {
  document.getElementById('cropModal').classList.remove('active');
  if (_cropper) { _cropper.destroy(); _cropper = null; }
}
