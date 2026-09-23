const express = require('express');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getTokenFromReq } = require('../middleware/auth');
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

// ===== 注册公共逻辑 =====
// 公开注册仅允许的职位：0=普通成员、1=声部长
// 2=琴房负责人、3=发展成员 不允许通过公开注册自助获取（发展成员走 /register-dev）
const PUBLIC_JOB_VALUES = [0, 1];
// 发展成员固定值为 3
const DEV_MEMBER_JOB = 3;

async function checkAccountNameFree(account, name) {
  const [dup] = await pool.query('SELECT personalId FROM persons WHERE account = ?', [account]);
  if (dup.length) return '该账号已被注册';
  const [dupName] = await pool.query('SELECT personalId FROM persons WHERE name = ? AND account <> \'\'', [name]);
  if (dupName.length) return '该姓名已存在账号，请勿重复创建';
  return null;
}

// 统一插入人员记录
async function insertPerson(o) {
  const hashed = await bcrypt.hash(o.password, 10);
  const personalId = generatePersonalId();
  await pool.query(
    `INSERT INTO persons (personalId, account, password, name, gender, institute, grade,
      campus, section, job, isManager, managerJob, instrument, isMaster, isOrchestraMember)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [personalId, o.account, hashed, o.name,
     o.gender ? 1 : 0, o.institute || null, o.grade || null,
     parseInt(o.campus) || 0, parseInt(o.section) || 0, parseInt(o.job) || 0,
     o.isManager ? 1 : 0, parseInt(o.managerJob) || 0,
     o.instrument || null, o.isMaster ? 1 : 0,
     o.isOrchestraMember === 0 ? 0 : 1]
  );
  return personalId;
}

// 签发 token 并写 Cookie；token 同时返回给调用方（供小程序等外部程序保存）
function issueToken(res, personalId, account, name) {
  const token = jwt.sign({ personalId, account, name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.cookie('userName', name, { ...COOKIE_OPTIONS, httpOnly: false });
  return token;
}

// POST /api/auth/register — 普通注册（职位仅限 普通成员/声部长）
router.post('/register', async (req, res, next) => {
  try {
    const { account, password, name, gender, institute, grade, campus, section,
            job, isManager, managerJob, instrument, isMaster } = req.body;
    if (!account || !password || !name) {
      return res.status(400).json({ success: false, message: '账号、密码、姓名为必填项' });
    }
    const dupErr = await checkAccountNameFree(account, name);
    if (dupErr) return res.status(409).json({ success: false, message: dupErr });

    // 职位白名单：禁止自助注册为 琴房负责人(2) / 发展成员(3)
    let jobVal = parseInt(job) || 0;
    if (!PUBLIC_JOB_VALUES.includes(jobVal)) jobVal = 0;

    const personalId = await insertPerson({
      account, password, name, gender, institute, grade, campus, section,
      job: jobVal, isManager, managerJob, instrument, isMaster
    });

    const token = issueToken(res, personalId, account, name);
    res.status(201).json({ success: true, message: '注册成功', personalId, name, token });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该账号已被注册' });
    next(err);
  }
});

// POST /api/auth/register-dev — 发展成员注册（仅能注册为发展成员 job=3）
router.post('/register-dev', async (req, res, next) => {
  try {
    const { account, password, name, gender, institute, grade, campus, section, instrument } = req.body;
    if (!account || !password || !name) {
      return res.status(400).json({ success: false, message: '账号、密码、姓名为必填项' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: '密码长度不能少于 6 位' });
    }
    const dupErr = await checkAccountNameFree(account, name);
    if (dupErr) return res.status(409).json({ success: false, message: dupErr });

    // 强制：职位=发展成员、非管理人员、非首席、非乐团成员
    const personalId = await insertPerson({
      account, password, name, gender, institute, grade, campus,
      section: section !== undefined ? section : 10, // 默认无声部
      job: DEV_MEMBER_JOB,
      isManager: 0,
      managerJob: 0,
      instrument,
      isMaster: 0,
      isOrchestraMember: 0
    });

    const token = issueToken(res, personalId, account, name);
    res.status(201).json({ success: true, message: '注册成功', personalId, name, token });
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
    // token 同时放入响应体，便于小程序等外部程序直接保存（无需解析 Set-Cookie）
    res.json({ success: true, message: '登录成功', name: user.name, token });
  } catch (err) { next(err); }
});

// GET /api/auth/me — 获取当前登录用户的完整个人信息（不含密码）
// 支持 Cookie 与 Authorization: Bearer（小程序无法带 Cookie）
router.get('/me', async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.json({ success: false, message: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query(
      `SELECT personalId, account, name, gender, institute, grade, campus, section, job,
              isManager, managerJob, instrument, isMaster, avatarhash, isOrchestraMember
       FROM persons WHERE personalId = ?`,
      [decoded.personalId]
    );
    if (!rows.length) return res.json({ success: false, message: '用户不存在' });
    res.json({ success: true, data: rows[0] });
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

// POST /api/auth/forgot — 忘记密码：通过 账号+真实姓名 校验后重置密码
router.post('/forgot', async (req, res, next) => {
  try {
    const { account, name, newPassword } = req.body;
    if (!account || !name || !newPassword) {
      return res.status(400).json({ success: false, message: '账号、姓名、新密码为必填项' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: '新密码长度不能少于 6 位' });
    }
    const [rows] = await pool.query('SELECT personalId, name FROM persons WHERE account = ?', [account]);
    if (!rows.length) return res.status(404).json({ success: false, message: '账号不存在' });
    if (rows[0].name !== name) {
      return res.status(400).json({ success: false, message: '账号与姓名不匹配，无法重置' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE persons SET password = ? WHERE personalId = ?', [hashed, rows[0].personalId]);
    res.json({ success: true, message: '密码已重置，请使用新密码登录' });
  } catch (err) { next(err); }
});

// PUT /api/auth/password — 登录状态下修改密码（需验证原密码）
router.put('/password', async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ success: false, message: '未登录' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch (e) { return res.status(401).json({ success: false, message: '登录已过期' }); }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '原密码和新密码为必填项' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: '新密码长度不能少于 6 位' });
    }
    const [rows] = await pool.query('SELECT password FROM persons WHERE personalId = ?', [decoded.personalId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该账号' });
    const ok = await bcrypt.compare(String(oldPassword), rows[0].password);
    if (!ok) return res.status(400).json({ success: false, message: '原密码错误' });

    const hashed = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE persons SET password = ? WHERE personalId = ?', [hashed, decoded.personalId]);
    res.json({ success: true, message: '密码修改成功' });
  } catch (err) { next(err); }
});

// POST /api/auth/avatar — 上传头像（含裁剪数据）
router.post('/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || '上传失败' });
    try {
      // 兼容 Cookie 与 Authorization: Bearer（小程序）
      const token = getTokenFromReq(req);
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
    // 兼容 Cookie 与 Authorization: Bearer（小程序）
    const token = getTokenFromReq(req);
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
    // 兼容 Cookie 与 Authorization: Bearer（小程序）
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ success: false, message: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    // 角色类字段（职位/管理人员/管理职责/声部首席）仅管理员可通过本接口修改，
    // 其余用户一律忽略，避免发展成员等自行提权
    const [meRows] = await pool.query('SELECT isManager FROM persons WHERE personalId = ?', [decoded.personalId]);
    const isManagerUser = meRows.length > 0 && meRows[0].isManager == 1;
    const SELF_ROLE_FIELDS = ['job', 'isManager', 'managerJob', 'isMaster'];
    const baseFields = ['name','gender','institute','grade','campus','section','job','isManager','managerJob','instrument','isMaster'];
    const fields = isManagerUser ? baseFields : baseFields.filter(f => !SELF_ROLE_FIELDS.includes(f));
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    // 职位变更时联动 isOrchestraMember（发展成员=0，正式成员=1）
    if (isManagerUser && req.body.job !== undefined) {
      sets.push('isOrchestraMember = ?');
      fields.push('isOrchestraMember');
      req.body.isOrchestraMember = parseInt(req.body.job) === 3 ? 0 : 1;
    }
    const values = fields.filter(f => req.body[f] !== undefined).map(f => {
      if (['gender','isManager','isMaster'].includes(f)) return req.body[f] ? 1 : 0;
      if (['campus','section','job','managerJob','isOrchestraMember'].includes(f)) return parseInt(req.body[f]) || 0;
      let v = req.body[f];
      if (Array.isArray(v)) v = v.join(';'); // instrument 等可能以数组提交（小程序徽章多选）
      return v || null;
    });
    values.push(decoded.personalId);
    await pool.query(`UPDATE persons SET ${sets.join(', ')} WHERE personalId = ?`, values);
    if (req.body.name) res.cookie('userName', req.body.name, { ...COOKIE_OPTIONS, httpOnly: false });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

module.exports = router;
