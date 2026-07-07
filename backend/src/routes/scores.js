const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scores');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer 配置：仅接受 PDF
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('仅允许上传 PDF 文件'));
    cb(null, true);
  }
});

// 计算文件 SHA256 哈希
function computeHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// GET /api/scores
router.get('/', async (req, res, next) => {
  try {
    const { title, section, isTotal, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM scores WHERE 1=1';
    const params = [];
    if (title) { sql += ' AND title LIKE ?'; params.push(`%${title}%`); }
    if (section !== undefined && section !== '') { sql += ' AND section = ?'; params.push(section); }
    if (isTotal !== undefined && isTotal !== '') { sql += ' AND isTotal = ?'; params.push(parseInt(isTotal)); }

    const [countRows] = await pool.query(sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params);
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ' ORDER BY title LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/scores/:scoreId
router.get('/:scoreId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/scores/:scoreId/file — 返回 PDF 文件
router.get('/:scoreId/file', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    const record = rows[0];
    // 尝试多个可能的扩展名
    let filePath = path.join(UPLOAD_DIR, record.filehash + '.pdf');
    if (!fs.existsSync(filePath)) {
      // 也可能是原始文件名存储，遍历查找
      const files = fs.readdirSync(UPLOAD_DIR);
      const match = files.find(f => f.startsWith(record.filehash));
      if (match) filePath = path.join(UPLOAD_DIR, match);
      else return res.status(404).json({ success: false, message: '文件不存在' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.title)}.pdf"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) { next(err); }
});

// POST /api/scores/upload — 上传 PDF + 自动计算哈希
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.message === '仅允许上传 PDF 文件') return res.status(400).json({ success: false, message: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: '文件大小不能超过 50MB' });
      return next(err);
    }
    try {
      if (!req.file) return res.status(400).json({ success: false, message: '请上传 PDF 文件' });
      const { title, isTotal, section } = req.body;
      if (!title) return res.status(400).json({ success: false, message: 'title 为必填项' });

      const filehash = await computeHash(req.file.path);

      // 检查哈希是否已存在
      const [exist] = await pool.query('SELECT scoreId FROM scores WHERE filehash = ?', [filehash]);
      if (exist.length) {
        fs.unlinkSync(req.file.path); // 删除重复文件
        return res.status(409).json({ success: false, message: '该文件已存在（哈希重复）' });
      }

      // 用哈希重命名文件
      const newPath = path.join(UPLOAD_DIR, filehash + '.pdf');
      fs.renameSync(req.file.path, newPath);

      await pool.query(
        'INSERT INTO scores (title, isTotal, section, filehash) VALUES (?, ?, ?, ?)',
        [title, isTotal !== undefined ? parseInt(isTotal) : 0, section || '', filehash]
      );
      res.status(201).json({ success: true, message: '乐谱已上传' });
    } catch (e) {
      // 清理临时文件
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '相同乐谱名称+类型+声部已存在' });
      next(e);
    }
  });
});

// PUT /api/scores/:scoreId/file — 替换乐谱 PDF 文件
router.put('/:scoreId/file', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.message === '仅允许上传 PDF 文件') return res.status(400).json({ success: false, message: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: '文件大小不能超过 50MB' });
      return next(err);
    }
    try {
      const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
      if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
      if (!req.file) return res.status(400).json({ success: false, message: '请上传 PDF 文件' });

      const filehash = await computeHash(req.file.path);
      const oldRecord = rows[0];

      // 删除旧文件
      const oldFilePath = path.join(UPLOAD_DIR, oldRecord.filehash + '.pdf');
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);

      // 用哈希重命名新文件
      const newPath = path.join(UPLOAD_DIR, filehash + '.pdf');
      fs.renameSync(req.file.path, newPath);

      // 更新数据库：filehash + 可选的 title/isTotal/section
      const { title, isTotal, section } = req.body;
      const sets = ['filehash = ?'];
      const values = [filehash];
      if (title !== undefined) { sets.push('title = ?'); values.push(title); }
      if (isTotal !== undefined) { sets.push('isTotal = ?'); values.push(parseInt(isTotal)); }
      if (section !== undefined) { sets.push('section = ?'); values.push(section); }
      values.push(req.params.scoreId);

      await pool.query(`UPDATE scores SET ${sets.join(', ')} WHERE scoreId = ?`, values);
      res.json({ success: true, message: '乐谱文件已更新' });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(e);
    }
  });
});

// PUT /api/scores/:scoreId — 更新元信息（不更新文件）
router.put('/:scoreId', async (req, res, next) => {
  try {
    const updFields = ['title', 'isTotal', 'section'];
    const sets = [];
    const values = [];
    updFields.forEach(f => {
      if (req.body[f] === undefined) return;
      sets.push(`${f} = ?`);
      if (f === 'isTotal') {
        // mysql2 对混合类型的预编译语句在 UNIQUE 索引校验时会类型报错
        // 所以 isTotal 传字符串让 MySQL 自行转换
        values.push(String(parseInt(String(req.body[f]), 10) || 0));
      } else {
        values.push(req.body[f]);
      }
    });
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    values.push(req.params.scoreId);
    const sql = `UPDATE scores SET ${sets.join(', ')} WHERE scoreId = ?`;
    const [result] = await pool.query(sql, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/scores/:scoreId — 同时删除文件
router.delete('/:scoreId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    const record = rows[0];
    // 删除文件
    const filePath = path.join(UPLOAD_DIR, record.filehash + '.pdf');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
