const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/rooms — 琴房列表（支持 campus 过滤）
router.get('/', async (req, res, next) => {
  try {
    const { campus } = req.query;
    let sql = 'SELECT * FROM rooms';
    const params = [];
    if (campus) { sql += ' WHERE campus = ?'; params.push(campus); }
    sql += ' ORDER BY roomId';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/rooms — 新增琴房
router.post('/', async (req, res, next) => {
  try {
    const { roomId, campus, name, description } = req.body;
    if (!roomId || !campus || !name) {
      return res.status(400).json({ success: false, message: 'roomId、campus、name 为必填项' });
    }
    await pool.query(
      'INSERT INTO rooms (roomId, campus, name, description) VALUES (?, ?, ?, ?)',
      [roomId, campus, name, description || null]
    );
    res.status(201).json({ success: true, message: '琴房已创建', roomId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '琴房ID已存在' });
    next(err);
  }
});

module.exports = router;
