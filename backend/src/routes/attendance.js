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
    if (eventId) { where += ' AND a.eventId = ?'; params.push(eventId); }

    // 单独统计总数（避免跨行 regex 问题）
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`, params
    );
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT a.*, p.name AS personName, e.title AS eventTitle
                 FROM attendance a
                 LEFT JOIN persons p ON a.personalId = p.personalId
                 LEFT JOIN events e ON a.eventId = e.eventId
                 ${where}
                 ORDER BY a.attendanceId DESC LIMIT ? OFFSET ?`;
    const allParams = [...params, parseInt(limit), offset];

    const [rows] = await pool.query(sql, allParams);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// POST /api/attendance — 签到
router.post('/', async (req, res, next) => {
  try {
    const { personalId, eventId, title } = req.body;
    if (!personalId || !eventId) {
      return res.status(400).json({ success: false, message: 'personalId 和 eventId 为必填项' });
    }
    await pool.query(
      'INSERT INTO attendance (personalId, eventId, title) VALUES (?, ?, ?)',
      [personalId, eventId, title || null]
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
