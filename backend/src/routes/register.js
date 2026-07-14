const express = require('express');
const pool = require('../db');
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';

function getUser(req) {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

router.get('/next-event', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.json({ success: false, message: '未登录', data: null });
    const [articles] = await pool.query(
      "SELECT articleId, type, title, content, startTime, endTime FROM articles WHERE type IN (0,1) AND endTime > NOW() ORDER BY startTime ASC LIMIT 1"
    );
    if (!articles.length) return res.json({ success: true, data: null });
    const a = articles[0];
    const [existing] = await pool.query(
      'SELECT attendanceId FROM attendance WHERE personalId = ? AND eventId = ?', [user.personalId, 'ARTICLE_' + a.articleId]
    );
    res.json({ success: true, data: {
      articleId: a.articleId, type: a.type, title: a.title,
      content: a.content, startTime: a.startTime, endTime: a.endTime,
      registered: existing.length > 0
    }});
  } catch (err) { next(err); }
});

router.post('/event/:articleId', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    const [articles] = await pool.query(
      "SELECT articleId, title, endTime FROM articles WHERE articleId = ? AND type IN (0,1) AND endTime > NOW()", [req.params.articleId]
    );
    if (!articles.length) return res.status(404).json({ success: false, message: '该活动不存在或已结束' });
    const a = articles[0];
    const eventId = 'ARTICLE_' + a.articleId;
    const [existing] = await pool.query(
      'SELECT attendanceId FROM attendance WHERE personalId = ? AND eventId = ?', [user.personalId, eventId]
    );
    if (existing.length) return res.status(409).json({ success: false, message: '你已报名该活动' });
    await pool.query('INSERT INTO attendance (personalId, eventId, title, method) VALUES (?, ?, ?, 0)', [user.personalId, eventId, a.title]);
    res.json({ success: true, message: '报名成功！' });
  } catch (err) { next(err); }
});

// GET /api/register/my — 我的报名列表
router.get('/my', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    const [rows] = await pool.query(
      `SELECT a.attendanceId, a.eventId, a.title AS attTitle, a.method,
              ar.articleId, ar.type, COALESCE(ar.title, a.title) AS title, ar.startTime, ar.endTime
       FROM attendance a
       LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
       WHERE a.personalId = ?
       ORDER BY a.attendanceId DESC`, [user.personalId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// DELETE /api/register/event/:articleId — 取消报名
router.delete('/event/:articleId', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    const articleId = parseInt(req.params.articleId);
    if (!articleId) return res.status(400).json({ success: false, message: '无效的活动ID' });
    const eventId = 'ARTICLE_' + articleId;
    const [articles] = await pool.query(
      "SELECT articleId FROM articles WHERE articleId = ? AND type IN (0,1) AND endTime > NOW()", [articleId]
    );
    if (!articles.length) return res.status(404).json({ success: false, message: '该活动已结束，无法取消' });
    const [result] = await pool.query(
      'DELETE FROM attendance WHERE personalId = ? AND eventId = ?', [user.personalId, eventId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到报名记录' });
    res.json({ success: true, message: '已取消报名' });
  } catch (err) { next(err); }
});

module.exports = router;
