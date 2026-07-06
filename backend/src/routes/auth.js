const express = require('express');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';
const COOKIE_OPTIONS = {
  httpOnly: false,  // 前端 JS 可读（方便判断登录状态）
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 天
};

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

module.exports = router;
