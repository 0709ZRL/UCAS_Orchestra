const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/articles — 列表
router.get('/', async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (type !== undefined && type !== '') { where += ' AND type = ?'; params.push(parseInt(type)); }
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM articles ${where}`, params);
    const total = countRows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT articleId, type, title, LEFT(content, 200) AS summary, createdAt
                 FROM articles ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...params, parseInt(limit), offset]);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/articles/latest — 各类别最新一条
router.get('/latest', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.* FROM articles a
       INNER JOIN (SELECT type, MAX(createdAt) AS maxTime FROM articles GROUP BY type) b
       ON a.type = b.type AND a.createdAt = b.maxTime
       ORDER BY a.type`
    );
    // 按类型补全（可能某些类型无数据）
    const result = {};
    for (let i = 0; i <= 2; i++) {
      const item = rows.find(r => r.type === i);
      result[i] = item || null;
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/articles/:id — 详情
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM articles WHERE articleId = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/articles — 新增
router.post('/', async (req, res, next) => {
  try {
    const { type, title, content } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '标题为必填项' });
    const [result] = await pool.query(
      'INSERT INTO articles (type, title, content) VALUES (?, ?, ?)',
      [type !== undefined ? parseInt(type) : 0, title, content || null]
    );
    res.status(201).json({ success: true, message: '已添加', articleId: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/articles/:id
router.put('/:id', async (req, res, next) => {
  try {
    const fields = ['type', 'title', 'content'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '无更新字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE articles SET ${sets.join(', ')} WHERE articleId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/articles/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM articles WHERE articleId = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
