// ===== 活动打卡页面 =====
let _selectedEvent = null;
let _userPosition = null;
let _checkingIn = false;

// scrollToTop 工具函数（本页面独立使用）
function scrollToTop() {
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadCheckinPage();
  });
});

// ===== 主渲染函数 =====
async function loadCheckinPage() {
  const el = document.getElementById('page-checkin');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:20px">⏳</div><div>加载中...</div></div>';

  try {
    // 并行获取进行中的活动列表、用户打卡历史
    const [ongoingRes, historyRes] = await Promise.all([
      fetch('/api/events/ongoing').then(r => r.json()),
      fetch('/api/checkin/history', { credentials: 'same-origin' }).then(r => r.json())
    ]);

    const events = (ongoingRes.success && ongoingRes.data) || [];
    const history = (historyRes.success && historyRes.data) || [];
    const checkedEventIds = new Set(history.map(h => h.eventId));

    let html = '<div class="checkin-wrap">';

    // 头部
    html += '<div class="checkin-header">'
      + '<h2>📍 活动打卡</h2>'
      + '</div>';

    // 进行中的活动列表
    html += '<div class="event-select-area">'
      + '<h3>📋 选择要进行打卡的排练活动</h3>';

    if (!events.length) {
      html += '<div class="no-events"><span>🎉</span><div>当前没有进行中的可打卡活动</div></div>';
    } else {
      html += '<div class="event-list">';
      events.forEach(ev => {
        const timeStr = (ev.startTime || '').replace('T', ' ').substring(0, 16)
          + ' ~ ' + (ev.endTime || '').replace('T', ' ').substring(0, 16);
        const alreadyChecked = checkedEventIds.has(ev.eventId);
        const locTxt = ev.location || '';

        html += '<div class="event-card" data-eventid="' + ev.eventId + '" data-location="' + escHtml(locTxt) + '"'
          + ' onclick="selectEvent(\'' + ev.eventId + '\')">'
          + '<div class="ec-time">' + timeStr + '</div>'
          + '<div class="ec-title">' + escHtml(ev.title) + '</div>'
          + (locTxt ? '<div class="ec-location">📍 ' + escHtml(locTxt) + '</div>' : '<div class="ec-location" style="color:#999">未设置地点</div>')
          + (alreadyChecked ? '<span class="ec-status" style="background:#2d8a4e">✅ 已打卡</span>' : '<span class="ec-status ongoing">进行中</span>')
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // 打卡区域
    html += '<div class="checkin-area" id="checkinArea">'
      + '<div class="selected-event-info" id="selectedEventInfo">'
      + '<div style="color:#999;font-size:14px">请先在上方选择一个活动</div>'
      + '</div>'
      + '<div class="checkin-btn-wrap">'
      + '<button class="checkin-btn" id="checkinBtn" onclick="doCheckin()" disabled>📍<br>打卡</button>'
      + '</div>'
      + '<div class="checkin-status" id="checkinStatus"></div>'
      + '</div>';

    // 打卡历史
    html += '<div class="checkin-history">'
      + '<h3>📜 我的打卡记录</h3>'
      + '<div class="history-list">';
    if (!history.length) {
      html += '<div style="text-align:center;padding:30px;color:#ccc;font-size:14px">暂无打卡记录</div>';
    } else {
      history.slice(0, 20).forEach(h => {
        const t = h.startTime ? (h.startTime || '').replace('T', ' ').substring(0, 16) : '';
        html += '<div class="history-item">'
          + '<div class="hi-title">' + escHtml(h.title || '活动') + '</div>'
          + '<div class="hi-time">' + t + '</div>'
          + '<div class="hi-badge">✅ 已打卡</div>'
          + '</div>';
      });
    }
    html += '</div></div>';

    html += '</div>';
    el.innerHTML = html;
    scrollToTop();

    // 如果之前已选择活动（页面刷新后），尝试恢复
    if (_selectedEvent) {
      const card = document.querySelector('.event-card[data-eventid="' + _selectedEvent.eventId + '"]');
      if (card) card.classList.add('selected');
      updateCheckinArea();
    }

    // 尝试获取用户位置（预加载）
    getCurrentPosition();
  } catch (err) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:#999">加载失败，请刷新重试</p>';
  }
}

// ===== 选择活动 =====
function selectEvent(eventId) {
  const cards = document.querySelectorAll('.event-card');
  cards.forEach(c => c.classList.remove('selected'));

  const card = document.querySelector('.event-card[data-eventid="' + eventId + '"]');
  if (!card) return;
  card.classList.add('selected');

  // 获取活动信息
  const title = card.querySelector('.ec-title').textContent;
  const timeText = card.querySelector('.ec-time').textContent;
  const location = card.dataset.location;
  const alreadyChecked = card.querySelector('.ec-status.ongoing') === null; // 如果ongoing标签不存在则已打卡

  _selectedEvent = { eventId, title, timeText, location, alreadyChecked };
  updateCheckinArea();
}

// ===== 更新打卡区域 =====
function updateCheckinArea() {
  const infoEl = document.getElementById('selectedEventInfo');
  const btn = document.getElementById('checkinBtn');
  const statusEl = document.getElementById('checkinStatus');

  if (!_selectedEvent) return;

  let infoHtml = '<div class="se-title">' + escHtml(_selectedEvent.title) + '</div>'
    + '<div class="se-time">🕐 ' + _selectedEvent.timeText + '</div>';
  if (_selectedEvent.location) {
    infoHtml += '<div class="se-location">📍 打卡地点：' + escHtml(_selectedEvent.location) + '</div>';
  }
  infoEl.innerHTML = infoHtml;

  if (_selectedEvent.alreadyChecked) {
    btn.disabled = true;
    btn.className = 'checkin-btn success';
    btn.innerHTML = '✅<br>已打卡';
    statusEl.className = 'checkin-status success';
    statusEl.textContent = '您已成功打卡该活动 ✅';
    return;
  }

  if (!_selectedEvent.location) {
    btn.disabled = true;
    btn.className = 'checkin-btn';
    btn.innerHTML = '❌<br>无地点';
    statusEl.className = 'checkin-status error';
    statusEl.textContent = '该活动未设置打卡地点，请联系管理员';
    return;
  }

  btn.disabled = false;
  btn.className = 'checkin-btn';
  btn.innerHTML = '📍<br>打卡';
  statusEl.className = 'checkin-status';
  statusEl.textContent = '点击按钮进行打卡（需开启定位服务）';
}

// ===== 获取当前位置 =====
function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      _userPosition = null;
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        resolve(_userPosition);
      },
      () => {
        _userPosition = null;
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ===== 执行打卡 =====
async function doCheckin() {
  if (_checkingIn || !_selectedEvent || _selectedEvent.alreadyChecked) return;
  const btn = document.getElementById('checkinBtn');
  const statusEl = document.getElementById('checkinStatus');
  if (!btn || !statusEl) return;

  _checkingIn = true;
  btn.disabled = true;
  btn.className = 'checkin-btn checking';
  btn.innerHTML = '⏳<br>定位中';
  statusEl.className = 'checkin-status loading';
  statusEl.textContent = '正在获取您的位置...';

  // 获取用户位置
  const pos = await getCurrentPosition();
  if (!pos) {
    btn.disabled = false;
    btn.className = 'checkin-btn error';
    btn.innerHTML = '📍<br>打卡';
    statusEl.className = 'checkin-status error';
    statusEl.textContent = '无法获取您的位置，请确保定位服务已开启或前往活动地点附近';
    _checkingIn = false;
    setTimeout(() => {
      btn.className = 'checkin-btn';
      btn.innerHTML = '📍<br>打卡';
      statusEl.className = 'checkin-status';
      statusEl.textContent = '点击按钮进行打卡（需开启定位服务）';
    }, 3000);
    return;
  }

  statusEl.textContent = '正在验证位置...';

  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        eventId: _selectedEvent.eventId,
        userLat: pos.lat,
        userLng: pos.lng
      })
    }).then(r => r.json());

    if (res.success) {
      btn.className = 'checkin-btn success';
      btn.innerHTML = '✅<br>成功';
      statusEl.className = 'checkin-status success';
      statusEl.textContent = '🎉 打卡成功！距打卡点约 ' + res.data.distance + ' 米';
      _selectedEvent.alreadyChecked = true;
      showToast('✅ 打卡成功！');
      // 刷新页面数据
      setTimeout(() => loadCheckinPage(), 1500);
    } else {
      btn.className = 'checkin-btn error';
      btn.innerHTML = '📍<br>打卡';
      statusEl.className = 'checkin-status error';
      statusEl.textContent = res.message || '打卡失败';
      // 如果是因为距离问题，显示更具体的提示
      if (res.distance) {
        statusEl.innerHTML += '<br><div class="distance-info">📏 您距打卡点约 ' + res.distance + ' 米，请前往活动地点附近</div>';
      }
      setTimeout(() => {
        btn.className = 'checkin-btn';
        btn.innerHTML = '📍<br>打卡';
        btn.disabled = false;
        statusEl.className = 'checkin-status';
        statusEl.textContent = '点击按钮进行打卡（需开启定位服务）';
      }, 4000);
    }
  } catch (err) {
    btn.className = 'checkin-btn error';
    btn.innerHTML = '📍<br>打卡';
    statusEl.className = 'checkin-status error';
    statusEl.textContent = '网络错误，请稍后重试';
    setTimeout(() => {
      btn.className = 'checkin-btn';
      btn.innerHTML = '📍<br>打卡';
      btn.disabled = false;
      statusEl.className = 'checkin-status';
      statusEl.textContent = '点击按钮进行打卡（需开启定位服务）';
    }, 3000);
  }
  _checkingIn = false;
}
