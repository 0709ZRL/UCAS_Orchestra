const express = require('express');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';
const COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

// multer – 头像（仅图片）
const avatarUpload = multer({
  dest: AVATAR_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.mimetype))
      return cb(new Error('仅允许上传图片'));
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

// 生成 personalId
function generatePersonalId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `P${ts}${rand}`;
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { account, password, name, gender, institute, grade, campus, section,
            job, isManager, managerJob, instrument, isMaster } = req.body;
    if (!account || !password || !name) {
      return res.status(400).json({ success: false, message: '账号、密码、姓名为必填项' });
    }
    // 检查账号重复
    const [dup] = await pool.query('SELECT personalId FROM persons WHERE account = ?', [account]);
    if (dup.length) return res.status(409).json({ success: false, message: '该账号已被注册' });

    const hashed = await bcrypt.hash(password, 10);
    const personalId = generatePersonalId();

    await pool.query(
      `INSERT INTO persons (personalId, account, password, name, gender, institute, grade,
        campus, section, job, isManager, managerJob, instrument, isMaster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [personalId, account, hashed, name,
       gender !== undefined ? (gender ? 1 : 0) : 0,
       institute || null, grade || null,
       campus !== undefined ? parseInt(campus) : 0,
       section !== undefined ? parseInt(section) : 0,
       job !== undefined ? parseInt(job) : 0,
       isManager !== undefined ? (isManager ? 1 : 0) : 0,
       managerJob !== undefined ? parseInt(managerJob) : 0,
       instrument || null,
       isMaster !== undefined ? (isMaster ? 1 : 0) : 0]
    );

    // 签发 token
    const token = jwt.sign({ personalId, account, name }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.cookie('userName', name, { ...COOKIE_OPTIONS, httpOnly: false });
    res.status(201).json({ success: true, message: '注册成功', personalId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该账号已被注册' });
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) {
      return res.status(400).json({ success: false, message: '账号和密码为必填项' });
    }
    const [rows] = await pool.query('SELECT * FROM persons WHERE account = ?', [account]);
    if (!rows.length) return res.status(401).json({ success: false, message: '账号或密码错误' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ success: false, message: '账号或密码错误' });

    const token = jwt.sign(
      { personalId: user.personalId, account: user.account, name: user.name },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.cookie('token', token, COOKIE_OPTIONS);
    res.cookie('userName', user.name, { ...COOKIE_OPTIONS, httpOnly: false });
    res.json({ success: true, message: '登录成功', name: user.name });
  } catch (err) { next(err); }
});

// GET /api/auth/me — 获取当前登录用户
router.get('/me', (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ success: false, message: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, data: { personalId: decoded.personalId, account: decoded.account, name: decoded.name } });
  } catch (err) {
    res.clearCookie('token'); res.clearCookie('userName');
    return res.json({ success: false, message: '登录已过期' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.clearCookie('userName');
  res.json({ success: true, message: '已退出' });
});

// POST /api/auth/avatar — 上传头像（含裁剪数据）
router.post('/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || '上传失败' });
    try {
      const token = req.cookies?.token;
      if (!token) return res.status(401).json({ success: false, message: '未登录' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' });

      const filehash = await computeHash(req.file.path);
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const newPath = path.join(AVATAR_DIR, `${filehash}${ext}`);
      if (!fs.existsSync(newPath)) fs.renameSync(req.file.path, newPath);
      else fs.unlinkSync(req.file.path);

      // 删除旧头像
      const [old] = await pool.query('SELECT avatarhash FROM persons WHERE personalId = ?', [decoded.personalId]);
      if (old[0]?.avatarhash) {
        const files = fs.readdirSync(AVATAR_DIR);
        const match = files.find(f => f.startsWith(old[0].avatarhash));
        if (match) fs.unlinkSync(path.join(AVATAR_DIR, match));
      }

      await pool.query('UPDATE persons SET avatarhash = ? WHERE personalId = ?', [filehash, decoded.personalId]);
      res.json({ success: true, message: '头像已更新', avatarhash: filehash });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(e);
    }
  });
});

// GET /api/auth/avatar — 获取当前用户头像
router.get('/avatar', async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ success: false, message: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query('SELECT avatarhash FROM persons WHERE personalId = ?', [decoded.personalId]);
    const hash = rows[0]?.avatarhash;
    if (!hash) return res.status(404).json({ success: false, message: '无头像' });
    const files = fs.readdirSync(AVATAR_DIR);
    const match = files.find(f => f.startsWith(hash));
    if (!match) return res.status(404).json({ success: false, message: '文件不存在' });
    const mimeMap = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp' };
    res.setHeader('Content-Type', mimeMap[path.extname(match)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(path.join(AVATAR_DIR, match)).pipe(res);
  } catch (err) { next(err); }
});

// PUT /api/auth/profile — 修改个人信息（不含密码）
router.put('/profile', async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ success: false, message: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const fields = ['name','gender','institute','grade','campus','section','job','isManager','managerJob','instrument','isMaster'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => {
      if (['gender','isManager','isMaster'].includes(f)) return req.body[f] ? 1 : 0;
      if (['campus','section','job','managerJob'].includes(f)) return parseInt(req.body[f]) || 0;
      return req.body[f] || null;
    });
    values.push(decoded.personalId);
    await pool.query(`UPDATE persons SET ${sets.join(', ')} WHERE personalId = ?`, values);
    if (req.body.name) res.cookie('userName', req.body.name, { ...COOKIE_OPTIONS, httpOnly: false });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

module.exports = router;
