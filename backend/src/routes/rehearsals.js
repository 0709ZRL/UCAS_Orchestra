// ===== 排练记录（仅学生指挥 managerJob=6 可用）=====
const express = require('express');
const pool = require('../db');
const router = express.Router();
const { loadUser, requireConductor } = require('../middleware/auth');

router.use(loadUser);

// 根据 eventId 查找活动/文章，返回 { eventId, title, date }
async function findEvent(eventId) {
  if (String(eventId).startsWith('ARTICLE_')) {
    const id = String(eventId).replace('ARTICLE_', '');
    const [rows] = await pool.query('SELECT articleId, title, startTime FROM articles WHERE articleId = ?', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { eventId, title: r.title, date: r.startTime ? new Date(r.startTime) : null };
  }
  const [rows] = await pool.query('SELECT eventId, title, startTime FROM events WHERE eventId = ?', [eventId]);
  if (!rows.length) return null;
  const r = rows[0];
  return { eventId, title: r.title, date: r.startTime ? new Date(r.startTime) : null };
}

// GET /api/rehearsals — 查看排练记录列表（按排练日期倒序）
router.get('/', requireConductor, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.eventId, r.eventTitle, DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate,
              r.content, r.createdBy, p.name AS creatorName, r.createdAt, r.updatedAt
       FROM rehearsal_records r
       LEFT JOIN persons p ON r.createdBy = p.personalId
       ORDER BY COALESCE(r.recordDate, r.createdAt) DESC, r.id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/rehearsals/events — 可记录的（已结束的）排练活动列表
router.get('/events', requireConductor, async (req, res, next) => {
  try {
    const [articles] = await pool.query(
      `SELECT CONCAT('ARTICLE_', articleId) AS eventId, title, startTime, endTime
       FROM articles WHERE type IN (0,1) AND COALESCE(endTime, startTime) < NOW()
       ORDER BY COALESCE(endTime, startTime) DESC`
    );
    const [events] = await pool.query(
      `SELECT eventId, title, startTime, endTime FROM events
       WHERE COALESCE(endTime, startTime) < NOW()
       ORDER BY COALESCE(endTime, startTime) DESC`
    );
    // 按开始时间倒序，按标题去重（articles 与 events 可能存在重复数据），保留最近的一场
    const seen = new Set();
    const list = [...articles, ...events]
      .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
      .filter(e => (seen.has(e.title) ? false : (seen.add(e.title), true)));
    res.json({ success: true, data: list.slice(0, 100) });
  } catch (err) { next(err); }
});

// POST /api/rehearsals — 为某次排练记录排练要点
router.post('/', requireConductor, async (req, res, next) => {
  try {
    const { eventId, content } = req.body;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId 为必填项' });
    if (!content || !String(content).trim()) return res.status(400).json({ success: false, message: '排练要点不能为空' });

    const ev = await findEvent(eventId);
    if (!ev) return res.status(404).json({ success: false, message: '该活动/排练不存在' });

    const dateStr = ev.date
      ? `${ev.date.getFullYear()}-${String(ev.date.getMonth() + 1).padStart(2, '0')}-${String(ev.date.getDate()).padStart(2, '0')}`
      : null;

    const [result] = await pool.query(
      'INSERT INTO rehearsal_records (eventId, eventTitle, recordDate, content, createdBy) VALUES (?, ?, ?, ?, ?)',
      [eventId, ev.title, dateStr, String(content).trim(), req.user.personalId]
    );
    res.status(201).json({ success: true, message: '排练要点已记录', id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/rehearsals/:id — 编辑排练要点
router.put('/:id', requireConductor, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rehearsal_records WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该排练记录' });

    const { content, eventId } = req.body;
    const sets = [];
    const values = [];

    if (content !== undefined) {
      if (!String(content).trim()) return res.status(400).json({ success: false, message: '排练要点不能为空' });
      sets.push('content = ?');
      values.push(String(content).trim());
    }
    if (eventId !== undefined && eventId !== rows[0].eventId) {
      const ev = await findEvent(eventId);
      if (!ev) return res.status(404).json({ success: false, message: '该活动/排练不存在' });
      const dateStr = ev.date
        ? `${ev.date.getFullYear()}-${String(ev.date.getMonth() + 1).padStart(2, '0')}-${String(ev.date.getDate()).padStart(2, '0')}`
        : null;
      sets.push('eventId = ?', 'eventTitle = ?', 'recordDate = ?');
      values.push(eventId, ev.title, dateStr);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });

    values.push(req.params.id);
    await pool.query(`UPDATE rehearsal_records SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: '排练要点已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/rehearsals/:id — 删除排练要点
router.delete('/:id', requireConductor, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM rehearsal_records WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该排练记录' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
