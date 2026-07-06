const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads/logistics');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function generateItemId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomInt(1000, 9999);
  return `I${ts}${rand}`;
}

// multer 配置：仅接受图片
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype))
      return cb(new Error('仅允许上传图片文件 (jpg/png/gif/webp)'));
    cb(null, true);
  }
});

function computeHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// GET /api/logistics
router.get('/', async (req, res, next) => {
  try {
    const { name, campus, isPublic, belongsToId, page = 1, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (name) { where += ' AND l.name LIKE ?'; params.push(`%${name}%`); }
    if (campus) { where += ' AND l.campus = ?'; params.push(campus); }
    if (isPublic !== undefined) { where += ' AND l.isPublic = ?'; params.push(parseInt(isPublic)); }
    if (belongsToId) { where += ' AND l.belongsToId = ?'; params.push(belongsToId); }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM logistics l ${where}`, params
    );
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT l.*, p.name AS ownerName
                 FROM logistics l
                 LEFT JOIN persons p ON l.belongsToId = p.personalId
                 ${where}
                 ORDER BY l.name LIMIT ? OFFSET ?`;
    const allParams = [...params, parseInt(limit), offset];

    const [rows] = await pool.query(sql, allParams);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/logistics/:itemId
router.get('/:itemId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, p.name AS ownerName
       FROM logistics l
       LEFT JOIN persons p ON l.belongsToId = p.personalId
       WHERE l.itemId = ?`,
      [req.params.itemId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该物品' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/logistics/:itemId/image — 返回图片
router.get('/:itemId/image', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM logistics WHERE itemId = ?', [req.params.itemId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该物品' });
    const hash = rows[0].imagehash;
    if (!hash) return res.status(404).json({ success: false, message: '该物品无图片' });
    const files = fs.readdirSync(UPLOAD_DIR);
    const match = files.find(f => f.startsWith(hash));
    if (!match) return res.status(404).json({ success: false, message: '图片文件不存在' });
    const filePath = path.join(UPLOAD_DIR, match);
    const ext = path.extname(match).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

// POST /api/logistics — 新增物品（无图片）
router.post('/', async (req, res, next) => {
  try {
    const { name, campus, address, isPublic, belongsToId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name 为必填项' });
    const itemId = generateItemId();
    await pool.query(
      `INSERT INTO logistics (itemId, name, campus, address, imagehash, isPublic, belongsToId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, name, campus || null, address || null, null,
       isPublic !== undefined ? parseInt(isPublic) : 1,
       belongsToId && belongsToId.trim() ? belongsToId.trim() : null]
    );
    res.status(201).json({ success: true, message: '物品已添加', itemId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该 itemId 已存在' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'belongsToId 指向的成员不存在' });
    next(err);
  }
});

// POST /api/logistics/upload — 新增物品 + 可选图片上传
router.post('/upload', (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err.message?.startsWith('仅允许')) return res.status(400).json({ success: false, message: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: '图片大小不能超过 20MB' });
      return next(err);
    }
    try {
      const { name, campus, address, isPublic, belongsToId } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'name 为必填项' });
      const itemId = generateItemId();
      let imagehash = null;
      if (req.file) {
        imagehash = await computeHash(req.file.path);
        const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
        const newPath = path.join(UPLOAD_DIR, `${imagehash}${ext}`);
        if (fs.existsSync(newPath)) fs.unlinkSync(req.file.path);
        else fs.renameSync(req.file.path, newPath);
      }
      await pool.query(
        `INSERT INTO logistics (itemId, name, campus, address, imagehash, isPublic, belongsToId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, name, campus || null, address || null, imagehash,
         isPublic !== undefined ? parseInt(isPublic) : 1,
         belongsToId && belongsToId.trim() ? belongsToId.trim() : null]
      );
      res.status(201).json({ success: true, message: '物品已添加', itemId });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该 itemId 已存在' });
      if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'belongsToId 指向的成员不存在' });
      next(e);
    }
  });
});

// PUT /api/logistics/:itemId — 更新
router.put('/:itemId', async (req, res, next) => {
  try {
    const fields = ['name', 'campus', 'address', 'isPublic', 'belongsToId'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
    values.push(req.params.itemId);
    const [result] = await pool.query(`UPDATE logistics SET ${sets.join(', ')} WHERE itemId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该物品' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/logistics/:itemId — 同时删除图片
router.delete('/:itemId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM logistics WHERE itemId = ?', [req.params.itemId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该物品' });
    const hash = rows[0].imagehash;
    if (hash) {
      const files = fs.readdirSync(UPLOAD_DIR);
      const match = files.find(f => f.startsWith(hash));
      if (match) fs.unlinkSync(path.join(UPLOAD_DIR, match));
    }
    await pool.query('DELETE FROM logistics WHERE itemId = ?', [req.params.itemId]);
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
