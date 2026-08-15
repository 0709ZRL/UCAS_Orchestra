const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { loadUser, isManager: isManagerUser, isSectionLeader } = require('../middleware/auth');

// 载入当前用户（req.user），供权限判断
router.use(loadUser);

const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');

// 声部长的声部映射（persons.section 数字 → 名称）
const SECTION_NAMES = { 0:'民族管乐',1:'弹拨一组',2:'弹拨二组',3:'胡琴',4:'提琴',5:'西洋木管',6:'西洋铜管',7:'低音',8:'钢琴',9:'打击',10:'无声部' };

function saveAvatar(base64Str, personalId) {
  if (!base64Str || !base64Str.startsWith('data:image/')) return null;
  const matches = base64Str.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!matches) return null;
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `${personalId}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), data);
  return filename;
}

// 生成唯一 personalId: P + 14位时间戳 + 4位随机数
function generatePersonalId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomInt(1000, 9999);
  return `P${ts}${rand}`;
}

// GET /api/persons — 列表（支持分页 & 搜索）
router.get('/', async (req, res, next) => {
  try {
    const { name, section, campus, isManager, isMaster, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM persons WHERE 1=1';
    const params = [];

    if (name) { sql += ' AND name LIKE ?'; params.push(`%${name}%`); }
    if (section !== undefined && section !== '') { sql += ' AND section = ?'; params.push(parseInt(section)); }
    if (campus !== undefined && campus !== '') { sql += ' AND campus = ?'; params.push(parseInt(campus)); }
    if (isManager !== undefined && isManager !== '') { sql += ' AND isManager = ?'; params.push(parseInt(isManager)); }
    if (isMaster !== undefined && isMaster !== '') { sql += ' AND isMaster = ?'; params.push(parseInt(isMaster)); }

    const [countRows] = await pool.query(
      sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params
    );
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ' ORDER BY personalId LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/persons/stats — 成员统计（数据大屏）
// 必须定义在 /:personalId 之前，避免 'stats' 被当作 personalId
router.get('/stats', async (req, res, next) => {
  try {
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM persons');
    const total = totalRows[0].total;

    const [genderRows] = await pool.query('SELECT gender, COUNT(*) AS cnt FROM persons GROUP BY gender');
    const gender = { male: 0, female: 0 };
    genderRows.forEach(r => { if (r.gender == 1) gender.male = r.cnt; else gender.female = r.cnt; });

    const SECTION_NAMES = { 0:'民族管乐',1:'弹拨一组',2:'弹拨二组',3:'胡琴',4:'提琴',5:'西洋木管',6:'西洋铜管',7:'低音',8:'钢琴',9:'打击',10:'无声部' };
    const [sectionRows] = await pool.query('SELECT section, COUNT(*) AS cnt FROM persons GROUP BY section');
    const sections = sectionRows
      .map(r => ({ key: r.section, name: SECTION_NAMES[r.section] || ('声部' + r.section), count: r.cnt }))
      .sort((a, b) => b.count - a.count);

    const CAMPUS_NAMES = { 0:'中关村校区',1:'玉泉路校区',3:'雁栖湖校区',4:'京内其他',5:'京外其他' };
    const [campusRows] = await pool.query('SELECT campus, COUNT(*) AS cnt FROM persons GROUP BY campus');
    const campuses = campusRows
      .map(r => ({ key: r.campus, name: CAMPUS_NAMES[r.campus] || ('校区' + r.campus), count: r.cnt }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, data: { total, gender, sections, campuses } });
  } catch (err) { next(err); }
});

// GET /api/persons/search?q=姓名或personId — 琴房预约参与者搜索
// 必须定义在 /:personalId 之前，避免 'search' 被当作 personalId
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ success: true, data: [] });
    const keyword = q.trim();
    let rows;
    if (/^[P][0-9A-Z]+$/i.test(keyword)) {
      // 精确 personId 匹配
      [rows] = await pool.query(
        'SELECT personalId, name, isOrchestraMember FROM persons WHERE personalId = ?',
        [keyword]
      );
    } else {
      // 姓名模糊搜索
      [rows] = await pool.query(
        'SELECT personalId, name, isOrchestraMember FROM persons WHERE name LIKE ? LIMIT 10',
        [`%${keyword}%`]
      );
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/persons/:personalId/avatar — 按 personalId 获取头像（公开，无需登录；供外部程序/小程序展示任意用户头像）
router.get('/:personalId/avatar', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT avatarhash FROM persons WHERE personalId = ?', [req.params.personalId]);
    const hash = rows[0]?.avatarhash;
    if (!hash) return res.status(404).json({ success: false, message: '该用户无头像' });
    const files = fs.readdirSync(AVATAR_DIR);
    const match = files.find(f => f.startsWith(hash));
    if (!match) return res.status(404).json({ success: false, message: '头像文件不存在' });
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[path.extname(match).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(path.join(AVATAR_DIR, match)).pipe(res);
  } catch (err) { next(err); }
});

// GET /api/persons/:personalId — 单个
router.get('/:personalId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM persons WHERE personalId = ?', [req.params.personalId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/persons — 新增（personalId 由系统自动生成）
// 权限：管理员可新增任意成员；声部长只能新增本声部成员；普通成员禁止
router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    if (!isManagerUser(user) && !isSectionLeader(user)) {
      return res.status(403).json({ success: false, message: '普通成员不能新增成员' });
    }
    const { name, gender, institute, grade, campus, section, job, isManager, managerJob, instrument, isMaster } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'name 为必填项' });
    }
    // 声部长只能新增本声部成员
    if (!isManagerUser(user) && parseInt(section !== undefined ? section : 0) !== user.section) {
      return res.status(403).json({ success: false, message: '声部长只能新增本声部成员' });
    }
    const personalId = generatePersonalId();
    await pool.query(
      `INSERT INTO persons (personalId, name, gender, institute, grade, campus, section, job, isManager, managerJob, instrument, isMaster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        personalId, name,
        gender !== undefined ? (gender ? 1 : 0) : 0,
        institute || null, grade || null,
        campus !== undefined ? parseInt(campus) : 0,
        section !== undefined ? parseInt(section) : 0,
        job !== undefined ? parseInt(job) : 0,
        isManager !== undefined ? (isManager ? 1 : 0) : 0,
        managerJob !== undefined ? parseInt(managerJob) : 0,
        instrument || null,
        isMaster !== undefined ? (isMaster ? 1 : 0) : 0
      ]
    );
    res.status(201).json({ success: true, message: '成员已添加', personalId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/persons/:personalId — 更新
// 权限：管理员可编辑任意成员；声部长只能编辑本声部成员；普通成员禁止
router.put('/:personalId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    if (!isManagerUser(user) && !isSectionLeader(user)) {
      return res.status(403).json({ success: false, message: '普通成员不能编辑成员' });
    }
    // 声部长：目标成员必须属于本声部
    if (!isManagerUser(user)) {
      const [target] = await pool.query('SELECT section FROM persons WHERE personalId = ?', [req.params.personalId]);
      if (!target.length) return res.status(404).json({ success: false, message: '未找到该成员' });
      if (target[0].section !== user.section) {
        return res.status(403).json({ success: false, message: '声部长只能编辑本声部成员' });
      }
      // 声部长不允许把成员改到其他声部
      if (req.body.section !== undefined && parseInt(req.body.section) !== user.section) {
        return res.status(403).json({ success: false, message: '声部长不能将成员调至其他声部' });
      }
    }
    const fields = ['name', 'gender', 'institute', 'grade', 'campus', 'section', 'job', 'isManager', 'managerJob', 'instrument', 'isMaster'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    // 处理头像
    if (req.body.avatar) {
      const avatarFile = saveAvatar(req.body.avatar, req.params.personalId);
      if (avatarFile) {
        sets.push('avatar = ?');
        req.body._avatar = avatarFile;
      }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
    if (req.body._avatar) values.push(req.body._avatar);
    values.push(req.params.personalId);
    const [result] = await pool.query(`UPDATE persons SET ${sets.join(', ')} WHERE personalId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/persons/:personalId — 删除
// 权限：管理员可删除任意成员；声部长只能删除本声部成员；普通成员禁止
router.delete('/:personalId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    if (!isManagerUser(user) && !isSectionLeader(user)) {
      return res.status(403).json({ success: false, message: '普通成员不能删除成员' });
    }
    if (!isManagerUser(user)) {
      const [target] = await pool.query('SELECT section FROM persons WHERE personalId = ?', [req.params.personalId]);
      if (!target.length) return res.status(404).json({ success: false, message: '未找到该成员' });
      if (target[0].section !== user.section) {
        return res.status(403).json({ success: false, message: '声部长只能删除本声部成员' });
      }
    }
    const [result] = await pool.query('DELETE FROM persons WHERE personalId = ?', [req.params.personalId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
