// ===== 角色权限中间件 =====
// 角色定义：
//   isManager=1  管理人员：全部权限
//   job=1        声部长：本声部相关增删改权限
//   其他         普通成员：只读
const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';

// 从请求中提取 token：优先 Authorization: Bearer <token>（小程序无法带 Cookie），回退 Cookie token
function getTokenFromReq(req) {
  const auth = req.headers?.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  return req.cookies?.token || null;
}

// 解析 JWT（不抛错）
function decodeToken(req) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

// 载入当前用户完整信息到 req.user（不强制登录，未登录时为 null）
async function loadUser(req, _res, next) {
  const decoded = decodeToken(req);
  if (!decoded) { req.user = null; return next(); }
  try {
    const [rows] = await pool.query(
      'SELECT personalId, name, section, job, isManager, managerJob FROM persons WHERE personalId = ?',
      [decoded.personalId]
    );
    req.user = rows.length ? rows[0] : null;
  } catch (e) {
    req.user = null;
  }
  next();
}

// 强制登录
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '请先登录' });
  next();
}

// 仅管理人员
function requireManager(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '请先登录' });
  if (req.user.isManager != 1) return res.status(403).json({ success: false, message: '仅管理人员可执行此操作' });
  next();
}

// 管理员或声部长
function requirePrivileged(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '请先登录' });
  if (req.user.isManager != 1 && req.user.job != 1) {
    return res.status(403).json({ success: false, message: '仅管理员或声部长可执行此操作' });
  }
  next();
}

// 快捷判断
function isManager(user) { return !!user && user.isManager == 1; }
function isSectionLeader(user) { return !!user && user.job == 1; }
// 学生指挥：managerJob = 6
function isConductor(user) { return !!user && user.managerJob == 6; }

// 仅学生指挥
function requireConductor(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '请先登录' });
  if (req.user.managerJob != 6) {
    return res.status(403).json({ success: false, message: '仅学生指挥可执行此操作' });
  }
  next();
}

module.exports = { loadUser, requireAuth, requireManager, requirePrivileged, requireConductor, isManager, isSectionLeader, isConductor, decodeToken, getTokenFromReq };
