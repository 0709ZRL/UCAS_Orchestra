const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/attendance
router.get('/', async (req, res, next) => {
  try {
    const { personalId, eventId, page = 1, limit = 100 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (personalId) { where += ' AND a.personalId = ?'; params.push(personalId); }
    if (eventId) {
      // 支持纯数字（自动转 ARTICLE_ 前缀）或完整 eventId
      if (/^\d+$/.test(eventId)) {
        where += ' AND a.eventId = ?'; params.push('ARTICLE_' + eventId);
      } else {
        where += ' AND a.eventId = ?'; params.push(eventId);
      }
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`, params
    );
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT a.*, p.name AS personName,
                 COALESCE(e.title, ar.title) AS eventTitle,
                 CASE WHEN a.eventId LIKE 'ARTICLE_%' THEN REPLACE(a.eventId, 'ARTICLE_', '') ELSE a.eventId END AS displayEventId
                 FROM attendance a
                 LEFT JOIN persons p ON a.personalId = p.personalId
                 LEFT JOIN events e ON a.eventId = e.eventId
                 LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
                 ${where}
                 ORDER BY a.attendanceId DESC LIMIT ? OFFSET ?`;
    const allParams = [...params, parseInt(limit), offset];

    const [rows] = await pool.query(sql, allParams);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// POST /api/attendance/lookup — 根据姓名/活动名查找匹配
router.post('/lookup', async (req, res, next) => {
  try {
    const { personName, eventTitle } = req.body;
    const result = { person: null, event: null, personOptions: [], eventOptions: [] };

    if (personName) {
      const [persons] = await pool.query(
        'SELECT personalId, name, section, campus FROM persons WHERE name LIKE ?',
        [`%${personName}%`]
      );
      if (persons.length === 1) result.person = persons[0];
      else result.personOptions = persons;
    }
    if (eventTitle) {
      const [events] = await pool.query(
        'SELECT eventId, title, year, month, date, startTime FROM events WHERE title LIKE ?',
        [`%${eventTitle}%`]
      );
      if (events.length === 1) result.event = events[0];
      else result.eventOptions = events;
    }
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// POST /api/attendance — 签到（需传入已确认的 personalId 和 eventId）
router.post('/', async (req, res, next) => {
  try {
    const { personalId, eventId, title, method } = req.body;
    if (!personalId || !eventId) {
      return res.status(400).json({ success: false, message: 'personalId 和 eventId 为必填项' });
    }
    await pool.query(
      'INSERT INTO attendance (personalId, eventId, title, method) VALUES (?, ?, ?, ?)',
      [personalId, eventId, title || null, method !== undefined ? (method ? 1 : 0) : 0]
    );
    res.status(201).json({ success: true, message: '签到成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该成员已签到此活动' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'personalId 或 eventId 不存在' });
    next(err);
  }
});

// DELETE /api/attendance/:attendanceId
router.delete('/:attendanceId', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM attendance WHERE attendanceId = ?', [req.params.attendanceId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该签到记录' });
    res.json({ success: true, message: '已删除签到记录' });
  } catch (err) { next(err); }
});

module.exports = router;
