const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { loadUser, requirePrivileged, isManager } = require('../middleware/auth');

router.use(loadUser);

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scores');

// 成员声部数字 → 乐谱声部名称（scores.section 为字符串，可存逗号分隔多声部）
const SCORE_SECTION_BY_INT = {
  0:'民族管乐声部',1:'弹拨一组',2:'弹拨二组',3:'胡琴声部',4:'提琴声部',5:'西洋木管声部',
  6:'西洋铜管声部',7:'低音声部',8:'钢琴声部',9:'打击声部',10:'无声部'
};
// 合法声部名集合
const SCORE_SECTIONS = Object.values(SCORE_SECTION_BY_INT);

// 解析分谱的声部列表（逗号分隔存储）；总谱强制无声部（修复“既是总谱又有声部”的 bug）
// sections / section 均兼容：数组（多选）、单个字符串、逗号分隔字符串
function resolveSection(isTotal, section, sections) {
  if (parseInt(isTotal || 0) === 1) return '';
  const list = [];
  const collect = (v) => {
    if (Array.isArray(v)) v.forEach(x => { if (x !== undefined && x !== null) list.push(String(x)); });
    else if (v !== undefined && v !== null && v !== '') list.push(String(v));
  };
  collect(sections);
  collect(section);
  const cleaned = list.map(s => s.trim()).filter(Boolean).filter(s => SCORE_SECTIONS.includes(s));
  return [...new Set(cleaned)].join(',');
}

// 声部长能否操作该乐谱：仅本声部 分谱（isTotal=0，且声部列表包含本声部）
function sectionLeaderCanOperate(user, record) {
  if (isManager(user)) return true;
  if (user.job != 1) return false;
  if (record.isTotal == 1) return false;
  const mySection = SCORE_SECTION_BY_INT[user.section] || '';
  const sections = String(record.section || '').split(',').map(s => s.trim()).filter(Boolean);
  return sections.includes(mySection);
}
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer 配置：仅接受 PDF（支持一次多文件上传 files[]）
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 }, // 单个 50MB，一次最多 20 个文件
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

// GET /api/scores — 列表，支持 乐谱名 + 声部 联合搜索（声部用 FIND_IN_SET 匹配多声部）
router.get('/', async (req, res, next) => {
  try {
    const { title, section, isTotal, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM scores WHERE 1=1';
    const params = [];
    if (title) { sql += ' AND title LIKE ?'; params.push(`%${title}%`); }
    if (section !== undefined && section !== '') { sql += ' AND FIND_IN_SET(?, section)'; params.push(section); }
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

// 根据 filehash 定位 PDF 文件路径（兼容 hash.pdf 与历史 hash+任意扩展名）
function locateScoreFile(filehash) {
  const direct = path.join(UPLOAD_DIR, filehash + '.pdf');
  if (fs.existsSync(direct)) return direct;
  const files = fs.readdirSync(UPLOAD_DIR);
  const match = files.find(f => f.startsWith(filehash));
  return match ? path.join(UPLOAD_DIR, match) : null;
}

// GET /api/scores/export — 将搜索到的所有乐谱打包下载为 zip（需在 :scoreId 之前注册）
router.get('/export', async (req, res, next) => {
  try {
    const archiver = require('archiver');
    const { title, section, isTotal } = req.query;
    let sql = 'SELECT * FROM scores WHERE 1=1';
    const params = [];
    if (title) { sql += ' AND title LIKE ?'; params.push(`%${title}%`); }
    if (section !== undefined && section !== '') { sql += ' AND FIND_IN_SET(?, section)'; params.push(section); }
    if (isTotal !== undefined && isTotal !== '') { sql += ' AND isTotal = ?'; params.push(parseInt(isTotal)); }
    sql += ' ORDER BY title';
    const [rows] = await pool.query(sql, params);

    // 过滤出文件真实存在的记录
    const withFiles = [];
    for (const r of rows) {
      const fp = locateScoreFile(r.filehash);
      if (fp) withFiles.push({ ...r, _path: fp });
    }
    if (!withFiles.length) {
      return res.status(404).json({ success: false, message: '没有可打包的乐谱文件' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipName = `scores-${new Date().toISOString().slice(0,10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    archive.on('error', (err) => { res.destroy(err); });
    archive.pipe(res);

    const used = {};
    withFiles.forEach(r => {
      const base = (r.title || '乐谱').replace(/[\\/:*?"<>|]/g, '_').trim() || '乐谱';
      const sec = r.isTotal == 1 ? '' : (r.section || '');
      let name = base + (sec ? '-' + sec.replace(/,/g, '、') : '') + '.pdf';
      if (used[name]) { let i = used[name] + 1; used[name] = i; name = `${base}-${i}${sec ? '-' + sec.replace(/,/g, '、') : ''}.pdf`; }
      else used[name] = 1;
      archive.file(r._path, { name });
    });
    await archive.finalize();
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
    const filePath = locateScoreFile(record.filehash);
    if (!filePath) return res.status(404).json({ success: false, message: '文件不存在' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.title)}.pdf"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) { next(err); }
});

// POST /api/scores/upload — 上传 PDF（支持一次多个文件），每个文件生成一条乐谱记录
// 权限：管理员任意；声部长仅本声部 分谱；普通成员禁止
router.post('/upload', requirePrivileged, (req, res, next) => {
  upload.array('files', 20)(req, res, async (err) => {
    if (err) {
      if (err.message === '仅允许上传 PDF 文件') return res.status(400).json({ success: false, message: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: '单个文件大小不能超过 50MB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, message: '一次最多上传 20 个文件' });
      return next(err);
    }
    try {
      const user = req.user;
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ success: false, message: '请选择至少一个 PDF 文件' });
      const { title, isTotal, section, sections } = req.body;
      if (!title) return res.status(400).json({ success: false, message: 'title 为必填项' });

      // 声部解析：总谱强制无声部；分谱可多声部（逗号分隔存储）
      const secStr = resolveSection(isTotal, section, sections);
      // 声部长：仅本声部 分谱
      if (!isManager(user)) {
        if (parseInt(isTotal || 0) === 1) {
          cleanupFiles(files);
          return res.status(403).json({ success: false, message: '声部长不能上传总谱' });
        }
        const mySection = SCORE_SECTION_BY_INT[user.section] || '';
        const chosen = secStr.split(',').map(s => s.trim()).filter(Boolean);
        if (chosen.length !== 1 || chosen[0] !== mySection) {
          cleanupFiles(files);
          return res.status(403).json({ success: false, message: '声部长只能上传本声部的分谱' });
        }
      }

      // 逐文件入库（哈希去重；同一批多文件标题相同时自动追加序号，避开唯一索引 title+isTotal+section）
      const created = [];
      const errors = [];
      const isTotalVal = isTotal !== undefined ? parseInt(isTotal) : 0;
      const usedTitles = new Set();
      for (const file of files) {
        try {
          const filehash = await computeHash(file.path);
          const [exist] = await pool.query('SELECT scoreId FROM scores WHERE filehash = ?', [filehash]);
          if (exist.length) {
            fs.unlinkSync(file.path);
            errors.push(`${file.originalname}：该文件已存在（哈希重复）`);
            continue;
          }
          // 标题唯一化：与库中记录及批内其他文件避免冲突
          const finalTitle = await uniqueScoreTitle(title, isTotalVal, secStr, usedTitles);
          const newPath = path.join(UPLOAD_DIR, filehash + '.pdf');
          fs.renameSync(file.path, newPath);
          await pool.query(
            'INSERT INTO scores (title, isTotal, section, filehash) VALUES (?, ?, ?, ?)',
            [finalTitle, isTotalVal, secStr, filehash]
          );
          created.push(`${file.originalname}${finalTitle !== title ? `（存为“${finalTitle}”）` : ''}`);
        } catch (fe) {
          if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
          errors.push(`${file.originalname}：${fe.code === 'ER_DUP_ENTRY' ? '相同乐谱已存在' : '保存失败'}`);
        }
      }

      if (!created.length) {
        return res.status(409).json({ success: false, message: errors.join('；') || '上传失败' });
      }
      const msg = `已上传 ${created.length} 份乐谱` + (errors.length ? `，${errors.length} 份失败` : '');
      res.status(201).json({ success: true, message: msg, createdCount: created.length, errors });
    } catch (e) {
      cleanupFiles(req.files || []);
      next(e);
    }
  });
});

function cleanupFiles(files) {
  if (!Array.isArray(files)) return;
  files.forEach(f => { if (f && fs.existsSync(f.path)) { try { fs.unlinkSync(f.path); } catch (e) { /* 忽略 */ } } });
}

// 生成不冲突的标题：若 base 标题 + isTotal + section 已存在于库中或本批已用，则追加 " (n)"
async function uniqueScoreTitle(base, isTotal, section, usedTitles) {
  let candidate = base;
  let n = 2;
  const exists = async (t) => {
    if (usedTitles.has(t)) return true;
    const [r] = await pool.query(
      'SELECT scoreId FROM scores WHERE title = ? AND isTotal = ? AND section = ? LIMIT 1',
      [t, isTotal, section]
    );
    return r.length > 0;
  };
  while (await exists(candidate)) {
    candidate = `${base} (${n++})`;
  }
  usedTitles.add(candidate);
  return candidate;
}

// PUT /api/scores/:scoreId/file — 替换乐谱 PDF 文件
// 权限：管理员任意；声部长仅本声部 分谱；普通成员禁止
router.put('/:scoreId/file', requirePrivileged, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.message === '仅允许上传 PDF 文件') return res.status(400).json({ success: false, message: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: '文件大小不能超过 50MB' });
      return next(err);
    }
    try {
      const user = req.user;
      const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
      if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
      if (!req.file) return res.status(400).json({ success: false, message: '请上传 PDF 文件' });
      if (!sectionLeaderCanOperate(user, rows[0])) {
        return res.status(403).json({ success: false, message: '无权操作该乐谱（仅可操作本声部分谱）' });
      }

      const filehash = await computeHash(req.file.path);
      const oldRecord = rows[0];

      // 删除旧文件
      const oldFilePath = path.join(UPLOAD_DIR, oldRecord.filehash + '.pdf');
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);

      // 用哈希重命名新文件
      const newPath = path.join(UPLOAD_DIR, filehash + '.pdf');
      fs.renameSync(req.file.path, newPath);

      // 更新数据库：filehash + 可选的 title/isTotal/section（isTotal=1 强制无声部，修复“总谱带声部”bug）
      const { title, isTotal, section } = req.body;
      const sets = ['filehash = ?'];
      const values = [filehash];
      if (title !== undefined) { sets.push('title = ?'); values.push(title); }
      if (isTotal !== undefined) { sets.push('isTotal = ?'); values.push(String(parseInt(isTotal) || 0)); }
      if (isTotal !== undefined || section !== undefined) {
        const finalTotal = isTotal !== undefined ? parseInt(isTotal) : oldRecord.isTotal;
        sets.push('section = ?');
        values.push(resolveSection(finalTotal, section, undefined));
      }
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
// 权限：管理员任意；声部长仅本声部 分谱；普通成员禁止
router.put('/:scoreId', requirePrivileged, async (req, res, next) => {
  try {
    const user = req.user;
    const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    if (!sectionLeaderCanOperate(user, rows[0])) {
      return res.status(403).json({ success: false, message: '无权操作该乐谱（仅可操作本声部分谱）' });
    }
    const { title, isTotal, section } = req.body;
    const sets = [];
    const values = [];
    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    // 总谱强制无声部（修复“总谱带声部”bug）：isTotal=1 时声部一律清空
    const finalTotal = isTotal !== undefined ? parseInt(String(req.body.isTotal), 10) || 0 : rows[0].isTotal;
    if (isTotal !== undefined) {
      // mysql2 对混合类型的预编译语句在 UNIQUE 索引校验时会类型报错
      // 所以 isTotal 传字符串让 MySQL 自行转换
      sets.push('isTotal = ?');
      values.push(String(finalTotal));
    }
    if (isTotal !== undefined || section !== undefined) {
      sets.push('section = ?');
      values.push(resolveSection(finalTotal, section, undefined));
    }
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    values.push(req.params.scoreId);
    const sql = `UPDATE scores SET ${sets.join(', ')} WHERE scoreId = ?`;
    const [result] = await pool.query(sql, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/scores/:scoreId — 同时删除文件
// 权限：管理员任意；声部长仅本声部 分谱；普通成员禁止
router.delete('/:scoreId', requirePrivileged, async (req, res, next) => {
  try {
    const user = req.user;
    const [rows] = await pool.query('SELECT * FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该乐谱' });
    const record = rows[0];
    if (!sectionLeaderCanOperate(user, record)) {
      return res.status(403).json({ success: false, message: '无权操作该乐谱（仅可操作本声部分谱）' });
    }
    // 删除文件
    const filePath = path.join(UPLOAD_DIR, record.filehash + '.pdf');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM scores WHERE scoreId = ?', [req.params.scoreId]);
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
