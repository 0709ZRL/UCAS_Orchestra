const express = require('express');
const pool = require('../db');
const router = express.Router();

// 生成 eventId：E + 36进制时间戳 + 4位随机数
function generateEventId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `E${ts}${rand}`;
}

// GET /api/events — 活动列表
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, title, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (title) { where += ' AND title LIKE ?'; params.push('%' + title + '%'); }
    if (status === 'ongoing') {
      where += ' AND startTime <= NOW() AND endTime >= NOW()';
    } else if (status === 'ended') {
      where += ' AND endTime < NOW()';
    } else if (status === 'upcoming') {
      where += ' AND startTime > NOW()';
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM events ${where}`, params);
    const total = countRows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT * FROM events ${where} ORDER BY startTime DESC LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...params, parseInt(limit), offset]);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/events/ongoing — 进行中且未结束的活动（用于打卡）
// 同时查询 events 表和 articles 表（排练通知/演出通知）
router.get('/ongoing', async (req, res, next) => {
  try {
    const [eventRows] = await pool.query(
      "SELECT eventId AS id, title, startTime, endTime, location, 'event' AS source FROM events WHERE startTime <= NOW() AND endTime >= NOW() AND location IS NOT NULL AND location != '' ORDER BY startTime ASC"
    );
    const [articleRows] = await pool.query(
      "SELECT CONCAT('ARTICLE_', articleId) AS id, title, startTime, endTime, location, 'article' AS source FROM articles WHERE type IN (0,1) AND startTime <= NOW() AND endTime >= NOW() AND location IS NOT NULL AND location != '' ORDER BY startTime ASC"
    );
    // 合并并按开始时间排序
    const combined = [...eventRows, ...articleRows].sort((a, b) =>
      new Date(a.startTime) - new Date(b.startTime)
    );
    res.json({ success: true, data: combined });
  } catch (err) { next(err); }
});

// GET /api/events/:id — 活动详情
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events WHERE eventId = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/events — 新增活动
router.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime, appendix, location } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '标题为必填项' });

    const eventId = generateEventId();
    const st = startTime ? new Date(startTime) : new Date();
    const et = endTime ? new Date(endTime) : new Date(st.getTime() + 3 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO events (eventId, year, month, date, startTime, endTime, title, appendix, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        st.getFullYear(), st.getMonth() + 1, st.getDate(),
        st, et,
        title, appendix || null,
        location || null
      ]
    );
    res.status(201).json({ success: true, message: '活动已创建', eventId });
  } catch (err) { next(err); }
});

// PUT /api/events/:id — 更新活动
router.put('/:id', async (req, res, next) => {
  try {
    const fields = ['title', 'startTime', 'endTime', 'appendix', 'location'];
    const sets = [];
    const values = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (f === 'startTime' || f === 'endTime') {
          const d = new Date(req.body[f]);
          sets.push(`${f} = ?`);
          values.push(d);
          if (f === 'startTime') {
            sets.push('year = ?, month = ?, date = ?');
            values.push(d.getFullYear(), d.getMonth() + 1, d.getDate());
          }
        } else {
          sets.push(`${f} = ?`);
          values.push(req.body[f]);
        }
      }
    });
    if (!sets.length) return res.status(400).json({ success: false, message: '无更新字段' });
    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE events SET ${sets.join(', ')} WHERE eventId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, message: '活动已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/events/:id — 删除活动
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM events WHERE eventId = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该活动' });
    res.json({ success: true, message: '活动已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
