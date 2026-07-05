const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const router = express.Router();

// 生成唯一 eventId: E + 36进制时间戳 + 4位随机数
function generateEventId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomInt(1000, 9999);
  return `E${ts}${rand}`;
}

// 格式化 DATETIME: "YYYY-MM-DD HH:mm:ss"
function fmtDateTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// GET /api/events
router.get('/', async (req, res, next) => {
  try {
    const { year, month, title, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    if (year) { sql += ' AND year = ?'; params.push(parseInt(year)); }
    if (month) { sql += ' AND month = ?'; params.push(parseInt(month)); }
    if (title) { sql += ' AND title LIKE ?'; params.push(`%${title}%`); }

    const [countRows] = await pool.query(sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params);
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ' ORDER BY year DESC, month DESC, date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/events/:eventId
router.get('/:eventId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events WHERE eventId = ?', [req.params.eventId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/events — eventId 自动生成
router.post('/', async (req, res, next) => {
  try {
    const { startTime: stInput, endTime: etInput, title, appendix } = req.body;

    // 处理起始时间
    const now = new Date();
    const startDate = stInput ? new Date(stInput) : now;
    const startTime = fmtDateTime(startDate);

    // 处理结束时间（默认 +3h）
    const endDate = etInput ? new Date(etInput) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
    const endTime = fmtDateTime(endDate);

    // 校验起止时间
    if (startDate >= endDate) {
      return res.status(400).json({ success: false, message: '起始时间必须早于结束时间' });
    }

    const eventId = generateEventId();
    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1;
    const date = startDate.getDate();

    await pool.query(
      `INSERT INTO events (eventId, year, month, date, startTime, endTime, title, appendix)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, year, month, date, startTime, endTime, title || '乐团活动', appendix || null]
    );
    res.status(201).json({ success: true, message: '活动已添加', eventId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/events/:eventId
router.put('/:eventId', async (req, res, next) => {
  try {
    const fields = ['year', 'month', 'date', 'startTime', 'endTime', 'title', 'appendix'];
    // 如果同时修改起止时间，校验先后
    if (req.body.startTime && req.body.endTime && new Date(req.body.startTime) >= new Date(req.body.endTime)) {
      return res.status(400).json({ success: false, message: '起始时间必须早于结束时间' });
    }
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
    values.push(req.params.eventId);
    const [result] = await pool.query(`UPDATE events SET ${sets.join(', ')} WHERE eventId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/events/:eventId
router.delete('/:eventId', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM events WHERE eventId = ?', [req.params.eventId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
