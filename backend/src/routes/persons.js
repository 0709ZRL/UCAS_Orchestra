const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const router = express.Router();

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

// GET /api/persons/:personalId — 单个
router.get('/:personalId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM persons WHERE personalId = ?', [req.params.personalId]);
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/persons — 新增（personalId 由系统自动生成）
router.post('/', async (req, res, next) => {
  try {
    const { name, gender, institute, grade, campus, section, job, isManager, managerJob, instrument, isMaster } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'name 为必填项' });
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
router.put('/:personalId', async (req, res, next) => {
  try {
    const fields = ['name', 'gender', 'institute', 'grade', 'campus', 'section', 'job', 'isManager', 'managerJob', 'instrument', 'isMaster'];
    const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`);
    if (!sets.length) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    const values = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
    values.push(req.params.personalId);
    const [result] = await pool.query(`UPDATE persons SET ${sets.join(', ')} WHERE personalId = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, message: '已更新' });
  } catch (err) { next(err); }
});

// DELETE /api/persons/:personalId — 删除
router.delete('/:personalId', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM persons WHERE personalId = ?', [req.params.personalId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该成员' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { next(err); }
});

module.exports = router;
