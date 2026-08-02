const express = require('express');
const pool = require('../db');
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';

// 认证中间件
function getUser(req) {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

/**
 * Haversine 公式计算两点间距离（米）
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径（米）
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/checkin — 活动打卡
 * 请求体：{ eventId, userLat, userLng }
 * 验证：活动正在进行中、用户在地点附近 10m 内
 */
router.post('/', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });

    const { eventId, userLat, userLng } = req.body;
    if (!eventId || userLat === undefined || userLng === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整，需要 eventId、userLat、userLng' });
    }

    // 1. 查找活动（支持 events 表和 articles 表）
    let ev;
    if (eventId.startsWith('ARTICLE_')) {
      const articleId = eventId.replace('ARTICLE_', '');
      const [articles] = await pool.query('SELECT articleId AS id, title, startTime, endTime, location FROM articles WHERE articleId = ?', [articleId]);
      if (!articles.length) return res.status(404).json({ success: false, message: '未找到该活动' });
      ev = articles[0];
    } else {
      const [events] = await pool.query('SELECT * FROM events WHERE eventId = ?', [eventId]);
      if (!events.length) return res.status(404).json({ success: false, message: '未找到该活动' });
      ev = events[0];
    }

    // 2. 检查活动是否已结束
    const now = new Date();
    if (new Date(ev.endTime) < now) {
      return res.status(400).json({ success: false, message: '该活动已结束，不能打卡' });
    }

    // 3. 检查活动是否已开始
    if (new Date(ev.startTime) > now) {
      return res.status(400).json({ success: false, message: '该活动尚未开始，不能打卡' });
    }

    // 4. 检查是否有打卡地点
    if (!ev.location || ev.location.trim() === '') {
      return res.status(400).json({ success: false, message: '该活动未设置打卡地点，请联系管理员' });
    }

    // 5. 验证地理位置距离
    const [eventLat, eventLng] = ev.location.split(',').map(Number);
    if (isNaN(eventLat) || isNaN(eventLng)) {
      return res.status(500).json({ success: false, message: '活动地点坐标格式错误' });
    }

    const distance = haversineDistance(
      parseFloat(userLat), parseFloat(userLng),
      eventLat, eventLng
    );

    const MAX_DISTANCE = 10; // 10 米
    if (distance > MAX_DISTANCE) {
      return res.status(403).json({
        success: false,
        message: `您不在活动地点附近（距打卡点约 ${Math.round(distance)} 米），请前往正确的地点附近或确保定位服务已开启`,
        distance: Math.round(distance)
      });
    }

    // 6. 检查是否已打卡（仅 method=1 算打卡，method=0 报名不冲突）
    const [existingCheckin] = await pool.query(
      'SELECT attendanceId FROM attendance WHERE personalId = ? AND eventId = ? AND method = 1',
      [user.personalId, eventId]
    );
    if (existingCheckin.length) {
      return res.status(409).json({ success: false, message: '您已打卡该活动，无需重复打卡' });
    }

    // 如果有报名记录（method=0），先删除以便重新插入打卡记录
    await pool.query(
      'DELETE FROM attendance WHERE personalId = ? AND eventId = ? AND method = 0',
      [user.personalId, eventId]
    );

    // 7. 创建打卡记录（method=1 表示"参加"即打卡）
    await pool.query(
      'INSERT INTO attendance (personalId, eventId, title, method) VALUES (?, ?, ?, 1)',
      [user.personalId, eventId, ev.title]
    );

    res.json({
      success: true,
      message: '✅ 打卡成功！',
      data: { distance: Math.round(distance), eventTitle: ev.title }
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/checkin/history — 当前用户的打卡历史
 */
router.get('/history', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });

    const [rows] = await pool.query(
      `SELECT a.attendanceId, a.eventId, a.title, a.method, a.attendanceId AS checkedAt,
              e.startTime, e.endTime, e.location,
              ar.startTime AS arStartTime, ar.endTime AS arEndTime, ar.location AS arLocation
       FROM attendance a
       LEFT JOIN events e ON a.eventId = e.eventId
       LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
       WHERE a.personalId = ? AND a.method = 1
       ORDER BY a.attendanceId DESC`,
      [user.personalId]
    );
    // 合并 events 和 articles 的时间/地点信息
    rows.forEach(r => {
      if (r.arStartTime) { r.startTime = r.arStartTime; r.endTime = r.arEndTime; }
      if (r.arLocation) r.location = r.arLocation;
      delete r.arStartTime; delete r.arEndTime; delete r.arLocation;
    });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
