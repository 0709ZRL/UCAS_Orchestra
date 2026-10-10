// ===== 乐谱文件夹 =====
// 新增的独立路由（挂载在 /api/score-folders），不改动任何既有接口，
// 因此小程序端完全不受影响。
//
// 权限：与乐谱的“修改权限”一致 —— 管理员任意；声部长仅本声部分谱（sectionLeaderCanOperate）。
//       浏览文件夹列表是公开的。

const express = require('express');
const pool = require('../db');
const router = express.Router();
const { loadUser, requirePrivileged } = require('../middleware/auth');
const { sectionLeaderCanOperate } = require('../lib/scoreSections');

router.use(loadUser);

// 文件夹名清洗：去首尾空白，限制长度
function cleanName(name) {
  const n = String(name === undefined || name === null ? '' : name).replace(/\s+/g, ' ').trim();
  return n.slice(0, 200);
}

// GET /api/score-folders — 文件夹列表（含每个文件夹的乐谱数 + 未分类数量）
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.folderId, f.name, f.createdAt, f.updatedAt,
              (SELECT COUNT(*) FROM scores s WHERE s.folderId = f.folderId) AS scoreCount
       FROM score_folders f
       ORDER BY f.name`
    );
    const [[{ uncategorized }]] = await pool.query(
      'SELECT COUNT(*) AS uncategorized FROM scores WHERE folderId IS NULL'
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM scores');
    res.json({ success: true, data: rows, uncategorized, total });
  } catch (err) { next(err); }
});

// POST /api/score-folders — 新建文件夹
router.post('/', requirePrivileged, async (req, res, next) => {
  try {
    const name = cleanName(req.body && req.body.name);
    if (!name) return res.status(400).json({ success: false, message: '文件夹名不能为空' });
    const [dup] = await pool.query('SELECT folderId FROM score_folders WHERE name = ?', [name]);
    if (dup.length) return res.status(409).json({ success: false, message: '已存在同名文件夹' });
    const [r] = await pool.query(
      'INSERT INTO score_folders (name, createdBy) VALUES (?, ?)',
      [name, req.user ? req.user.personalId : null]
    );
    res.status(201).json({ success: true, message: '文件夹已创建', data: { folderId: r.insertId, name } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '已存在同名文件夹' });
    next(err);
  }
});

// PUT /api/score-folders/move — 把乐谱移入/移出文件夹
// body: { scoreIds: [1,2,3], folderId: 5 | null }   （folderId 为 null 表示移出到“未分类”）
// 注意：必须定义在 PUT /:folderId 之前
router.put('/move', requirePrivileged, async (req, res, next) => {
  try {
    const body = req.body || {};
    const rawIds = Array.isArray(body.scoreIds) ? body.scoreIds : [];
    const ids = [...new Set(rawIds.map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ success: false, message: '请先勾选要移动的乐谱' });

    let folderId = null;
    if (body.folderId !== undefined && body.folderId !== null && body.folderId !== '' && body.folderId !== 0 && body.folderId !== '0') {
      folderId = parseInt(body.folderId, 10);
      if (!Number.isInteger(folderId) || folderId <= 0) {
        return res.status(400).json({ success: false, message: 'folderId 参数无效' });
      }
      const [f] = await pool.query('SELECT folderId FROM score_folders WHERE folderId = ?', [folderId]);
      if (!f.length) return res.status(404).json({ success: false, message: '文件夹不存在' });
    }

    const ph = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT scoreId, title, isTotal, section FROM scores WHERE scoreId IN (${ph})`, ids
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到要移动的乐谱' });

    // 权限：管理员任意；声部长仅本声部分谱
    const denied = rows.filter(r => !sectionLeaderCanOperate(req.user, r));
    if (denied.length) {
      return res.status(403).json({
        success: false,
        message: `以下乐谱你没有操作权限：${denied.map(r => r.title).slice(0, 3).join('、')}${denied.length > 3 ? ` 等 ${denied.length} 份` : ''}`
      });
    }

    const found = rows.map(r => r.scoreId);
    await pool.query(
      `UPDATE scores SET folderId = ? WHERE scoreId IN (${found.map(() => '?').join(',')})`,
      [folderId, ...found]
    );
    res.json({
      success: true,
      message: folderId === null
        ? `已将 ${found.length} 份乐谱移出文件夹`
        : `已将 ${found.length} 份乐谱移入文件夹`,
      moved: found.length
    });
  } catch (err) { next(err); }
});

// PUT /api/score-folders/:folderId — 重命名文件夹
router.put('/:folderId', requirePrivileged, async (req, res, next) => {
  try {
    const id = parseInt(req.params.folderId, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'folderId 无效' });
    const name = cleanName(req.body && req.body.name);
    if (!name) return res.status(400).json({ success: false, message: '文件夹名不能为空' });

    const [rows] = await pool.query('SELECT folderId FROM score_folders WHERE folderId = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '文件夹不存在' });

    const [dup] = await pool.query('SELECT folderId FROM score_folders WHERE name = ? AND folderId <> ?', [name, id]);
    if (dup.length) return res.status(409).json({ success: false, message: '已存在同名文件夹' });

    await pool.query('UPDATE score_folders SET name = ? WHERE folderId = ?', [name, id]);
    res.json({ success: true, message: '文件夹已重命名', data: { folderId: id, name } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '已存在同名文件夹' });
    next(err);
  }
});

// DELETE /api/score-folders/:folderId — 删除文件夹
// 只删文件夹本身，里面的乐谱由外键 ON DELETE SET NULL 变为“未分类”，不会被删除
router.delete('/:folderId', requirePrivileged, async (req, res, next) => {
  try {
    const id = parseInt(req.params.folderId, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'folderId 无效' });
    const [rows] = await pool.query('SELECT folderId, name FROM score_folders WHERE folderId = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '文件夹不存在' });

    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM scores WHERE folderId = ?', [id]);
    await pool.query('DELETE FROM score_folders WHERE folderId = ?', [id]);
    res.json({
      success: true,
      message: cnt ? `文件夹已删除，其中 ${cnt} 份乐谱已移回“未分类”` : '文件夹已删除'
    });
  } catch (err) { next(err); }
});

module.exports = router;
