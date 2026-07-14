const express = require('express');
const pool = require('../db');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const ARTICLE_UPLOAD_DIR = path.join(__dirname, '../../uploads/articles');

// multer 配置 — 文章图片上传（仅图片）
const articleUpload = multer({
  dest: ARTICLE_UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('仅允许上传图片文件'));
    cb(null, true);
  }
});

// multer 配置 — 文章附件上传（任意文件）
const fileUpload = multer({
  dest: ARTICLE_UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// GET /api/articles — 列表（支持搜索标题、类型、日期区间）
router.get('/', async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20, title, dateFrom, dateTo } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (type !== undefined && type !== '') { where += ' AND type = ?'; params.push(parseInt(type)); }
    if (title) { where += ' AND title LIKE ?'; params.push('%' + title + '%'); }
    if (dateFrom) { where += ' AND DATE(createdAt) >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND DATE(createdAt) <= ?'; params.push(dateTo); }
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM articles ${where}`, params);
    const total = countRows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT articleId, type, title, LEFT(content, 200) AS summary, createdAt, startTime, endTime
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

// POST /api/articles/upload-image — 上传文章图片
router.post('/upload-image', articleUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' });
  // 保留原始扩展名重命名
  const ext = path.extname(req.file.originalname) || '.png';
  const newName = req.file.filename + ext;
  const fs = require('fs');
  fs.renameSync(req.file.path, path.join(ARTICLE_UPLOAD_DIR, newName));
  res.json({ success: true, filename: newName, url: '/uploads/articles/' + newName });
}, (err, _req, res, _next) => {
  if (err) res.status(400).json({ success: false, message: err.message });
});

// POST /api/articles/upload-file — 上传文章附件（任意文件）
router.post('/upload-file', fileUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请选择文件' });
  const ext = path.extname(req.file.originalname) || '';
  const newName = req.file.filename + ext;
  const fs = require('fs');
  fs.renameSync(req.file.path, path.join(ARTICLE_UPLOAD_DIR, newName));
  // multer 的 originalname 是 Latin-1 编码，转回 UTF-8
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json({
    success: true,
    filename: newName,
    originalName: originalName,
    size: req.file.size,
    url: '/uploads/articles/' + newName
  });
});

// POST /api/articles — 新增
router.post('/', async (req, res, next) => {
  try {
    const { type, title, content, images, attachments, startTime, endTime } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '标题为必填项' });
    const imgStr = images ? (Array.isArray(images) ? images.join(',') : images) : null;
    const attStr = attachments ? (typeof attachments === 'string' ? attachments : JSON.stringify(attachments)) : null;
    const [result] = await pool.query(
      'INSERT INTO articles (type, title, content, images, attachments, startTime, endTime) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [type !== undefined ? parseInt(type) : 0, title, content || null, imgStr, attStr, startTime || null, endTime || null]
    );
    res.status(201).json({ success: true, message: '已添加', articleId: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/articles/:id
router.put('/:id', async (req, res, next) => {
  try {
    const fields = ['type', 'title', 'content', 'images', 'attachments', 'startTime', 'endTime'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '无更新字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => {
      const v = req.body[f];
      if (f === 'images') return Array.isArray(v) ? v.join(',') : v;
      if (f === 'attachments') return typeof v === 'string' ? v : JSON.stringify(v);
      return v;
    });
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
