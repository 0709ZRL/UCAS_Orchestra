// ===== 发展成员入口：登录 / 注册（仅发展成员）/ 修改密码 =====
// 该页面不加载 auth.js，因此自带轻量 api() 与提示

async function devApi(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return r.json();
}

function devErr(msg) {
  const el = document.getElementById('devErr');
  if (el) el.textContent = msg || '';
}

const DEV_VIEWS = ['loginView', 'registerView', 'resetView'];
function devShow(id) {
  DEV_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === id) ? '' : 'none';
  });
  devErr('');
}

function devSubmitting(on) {
  window._devBusy = !!on;
  const b = document.getElementById('regBtn');
  if (b) b.disabled = !!on;
}

// 登录
async function devLogin() {
  if (window._devBusy) return;
  const account = document.getElementById('loginAccount').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) { devErr('请填写账号和密码'); return; }
  devSubmitting(true);
  try {
    const res = await devApi('/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });
    if (!res.success) { devErr(res.message || '登录失败'); return; }
    // 校验是否为发展成员
    const me = await devApi('/auth/me');
    if (!me.success) { devErr('登录状态异常，请重试'); return; }
    if (Number(me.data.job) !== 3) {
      devErr('该账号不是「发展成员」，请使用正式成员入口登录');
      await devApi('/auth/logout', { method: 'POST' });
      return;
    }
    try { localStorage.setItem('_me', JSON.stringify(me.data)); } catch (e) {}
    window.location.href = '/rooms';
  } catch (e) {
    devErr('网络错误，请稍后重试');
  } finally {
    devSubmitting(false);
  }
}

// 注册（只能注册为发展成员）
async function devRegister() {
  if (window._devBusy) return;
  const account = document.getElementById('reg-account').value.trim();
  const password = document.getElementById('reg-password').value;
  const name = document.getElementById('reg-name').value.trim();
  const gender = parseInt(document.getElementById('reg-gender').value);
  const campus = parseInt(document.getElementById('reg-campus').value);
  const institute = document.getElementById('reg-institute').value.trim();
  const grade = document.getElementById('reg-grade').value.trim();
  const instrument = document.getElementById('reg-instrument').value.trim();

  if (!account || !password || !name) { devErr('账号、密码、姓名为必填项'); return; }
  if (password.length < 6) { devErr('密码长度不能少于 6 位'); return; }

  devSubmitting(true);
  try {
    const res = await devApi('/auth/register-dev', {
      method: 'POST',
      body: JSON.stringify({ account, password, name, gender, campus, institute, grade, instrument })
    });
    if (res.success) {
      window.location.href = '/rooms';
    } else {
      devErr(res.message || '注册失败');
    }
  } catch (e) {
    devErr('网络错误，请稍后重试');
  } finally {
    devSubmitting(false);
  }
}

// 修改密码（账号 + 真实姓名 校验）
async function devResetPassword() {
  if (window._devBusy) return;
  const account = document.getElementById('reset-account').value.trim();
  const name = document.getElementById('reset-name').value.trim();
  const pwd = document.getElementById('reset-pwd').value;
  const pwd2 = document.getElementById('reset-pwd2').value;
  if (!account || !name || !pwd || !pwd2) { devErr('请填写所有字段'); return; }
  if (pwd.length < 6) { devErr('新密码长度不能少于 6 位'); return; }
  if (pwd !== pwd2) { devErr('两次输入的新密码不一致'); return; }

  devSubmitting(true);
  try {
    const res = await devApi('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ account, name, newPassword: pwd })
    });
    if (res.success) {
      devShow('loginView');
      const la = document.getElementById('loginAccount');
      if (la) la.value = account;
      const err = document.getElementById('devErr');
      if (err) err.textContent = '密码修改成功，请使用新密码登录';
    } else {
      devErr(res.message || '修改失败');
    }
  } catch (e) {
    devErr('网络错误，请稍后重试');
  } finally {
    devSubmitting(false);
  }
}

// 已登录的发展成员直接进入琴房页
document.addEventListener('DOMContentLoaded', function () {
  devApi('/auth/me').then(res => {
    if (res.success && res.data && Number(res.data.job) === 3) {
      window.location.replace('/rooms');
    }
  }).catch(() => {});
  ['loginPassword', 'reg-password', 'reset-pwd2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (id === 'loginPassword') devLogin();
      else if (id === 'reg-password') devRegister();
      else devResetPassword();
    });
  });
});
