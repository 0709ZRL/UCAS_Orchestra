const express = require('express');
const pool = require('../db');
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';

// 营业时间
const OPEN_TIME = '07:00:00';
const CLOSE_TIME = '22:30:00';
const MAX_PARTICIPANTS = 6;

function getUser(req) {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

// 判断用户是否为管理员（isManager=1）
async function isAdminUser(personalId) {
  try {
    const [rows] = await pool.query('SELECT isManager FROM persons WHERE personalId = ?', [personalId]);
    return rows.length > 0 && rows[0].isManager == 1;
  } catch (e) {
    return false;
  }
}

// 将 "HH:MM" / "HH:MM:SS" 归一化为 "HH:MM:SS"
function normalizeTime(t) {
  if (!t) return null;
  const parts = String(t).split(':');
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
  return String(t);
}

function isValidTimeRange(start, end) {
  if (!start || !end) return false;
  if (start < OPEN_TIME || end > CLOSE_TIME) return false;
  if (end <= start) return false;
  return true;
}

// 校验日期格式 YYYY-MM-DD 且为合法日期（本地时区安全，避免 toISOString 跨天问题）
function isValidDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const dt = new Date(y, m - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day;
}

// 将 DATE 列（可能是 Date 对象或字符串）转为 YYYY-MM-DD（本地时区安全）
function toDateStr(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return String(d).slice(0, 10);
}

// 解析 participants（mysql2 可能已解析为数组，也可能是字符串）
function parseParticipants(p) {
  if (Array.isArray(p)) return p;
  if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return []; } }
  return [];
}

// GET /api/reservations?roomId=&dateFrom=&dateTo=
// 返回指定琴房、日期范围内的预约（含参与人姓名）
router.get('/', async (req, res, next) => {
  try {
    const { roomId, dateFrom, dateTo } = req.query;
    if (!roomId) return res.status(400).json({ success: false, message: '缺少 roomId' });
    const params = [];
    let where = 'WHERE r.roomId = ?';
    params.push(roomId);
    if (dateFrom) { where += ' AND r.date >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND r.date <= ?'; params.push(dateTo); }
    const [rows] = await pool.query(
      `SELECT r.id, r.roomId, r.bookerId, DATE_FORMAT(r.date, '%Y-%m-%d') AS date,
              TIME_FORMAT(r.startTime, '%H:%i') AS startTime, TIME_FORMAT(r.endTime, '%H:%i') AS endTime,
              r.participants, r.createdAt, p.name AS bookerName
       FROM reservations r
       LEFT JOIN persons p ON r.bookerId = p.personalId
       ${where}
       ORDER BY r.date, r.startTime`, params
    );
    // 解析 participants JSON 并附带姓名
    const data = rows.map(r => ({ ...r, participants: parseParticipants(r.participants) }));

    // 批量查询所有参与人姓名
    const allIds = [...new Set(data.flatMap(r => r.participants))];
    const nameMap = {};
    if (allIds.length) {
      const ph = allIds.map(() => '?').join(',');
      const [ps] = await pool.query(`SELECT personalId, name FROM persons WHERE personalId IN (${ph})`, allIds);
      ps.forEach(p => nameMap[p.personalId] = p.name);
    }
    data.forEach(r => {
      r.participants = r.participants.map(pid => ({ personalId: pid, name: nameMap[pid] || pid }));
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/reservations — 创建预约
router.post('/', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });

    const { roomId, date, startTime, endTime, participants } = req.body;
    if (!roomId || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: '参数不完整：roomId、date、startTime、endTime 必填' });
    }

    // 1. 日期校验
    if (!isValidDate(date)) return res.status(400).json({ success: false, message: '日期格式不正确' });

    // 2. 时间校验（07:00-22:30，结束>开始，不跨天）
    const st = normalizeTime(startTime);
    const et = normalizeTime(endTime);
    if (!isValidTimeRange(st, et)) {
      return res.status(400).json({ success: false, message: '时间必须在 07:00 ~ 22:30 之间，且结束时间必须晚于开始时间' });
    }

    // 3. 琴房存在性
    const [roomRows] = await conn.query('SELECT roomId FROM rooms WHERE roomId = ?', [roomId]);
    if (!roomRows.length) return res.status(404).json({ success: false, message: '琴房不存在' });

    // 4. 参与者校验（≤6 人，含主预约人）
    let plist = Array.isArray(participants) ? participants : [];
    // 去重、去空
    plist = [...new Set(plist.filter(p => p && typeof p === 'string'))];
    if (!plist.includes(user.personalId)) plist.unshift(user.personalId);
    if (plist.length > MAX_PARTICIPANTS) {
      return res.status(400).json({ success: false, message: `每笔预约最多 ${MAX_PARTICIPANTS} 人（含主预约人）` });
    }
    if (plist.length) {
      const placeholders = plist.map(() => '?').join(',');
      const [persons] = await conn.query(
        `SELECT personalId FROM persons WHERE personalId IN (${placeholders})`, plist
      );
      const found = new Set(persons.map(p => p.personalId));
      const missing = plist.filter(p => !found.has(p));
      if (missing.length) {
        return res.status(400).json({ success: false, message: `以下人员不存在：${missing.join(', ')}` });
      }
    }

    // 5. 管理员可无视预约时间冲突（覆盖预约）
    const admin = await isAdminUser(user.personalId);

    await conn.beginTransaction();
    if (!admin) {
      // 普通用户：冲突检测（事务 + 行锁）
      // 锁定该琴房该日期的记录，防止并发插入
      const [conflicts] = await conn.query(
        `SELECT id FROM reservations WHERE roomId = ? AND date = ? AND startTime < ? AND endTime > ?
         FOR UPDATE`,
        [roomId, date, et, st]
      );
      if (conflicts.length) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: '该时间段已被占用，请选择其他时间' });
      }
    }

    await conn.query(
      'INSERT INTO reservations (roomId, bookerId, date, startTime, endTime, participants) VALUES (?, ?, ?, ?, ?, ?)',
      [roomId, user.personalId, date, st, et, JSON.stringify(plist)]
    );
    await conn.commit();
    res.status(201).json({ success: true, message: admin ? '预约成功（管理员覆盖预约）' : '预约成功' });
  } catch (err) {
    try { await conn.rollback(); } catch (e) {}
    next(err);
  } finally {
    conn.release();
  }
});

// GET /api/reservations/:id — 详情
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.roomId, r.bookerId, DATE_FORMAT(r.date, '%Y-%m-%d') AS date,
              TIME_FORMAT(r.startTime, '%H:%i') AS startTime, TIME_FORMAT(r.endTime, '%H:%i') AS endTime,
              r.participants, r.createdAt, p.name AS bookerName
       FROM reservations r
       LEFT JOIN persons p ON r.bookerId = p.personalId
       WHERE r.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该预约' });
    const participants = parseParticipants(rows[0].participants);
    // 附上参与人姓名
    let participantsWithName = participants.map(pid => ({ personalId: pid, name: pid }));
    if (participants.length) {
      const ph = participants.map(() => '?').join(',');
      const [ps] = await pool.query(`SELECT personalId, name FROM persons WHERE personalId IN (${ph})`, participants);
      const nameMap = {};
      ps.forEach(p => nameMap[p.personalId] = p.name);
      participantsWithName = participants.map(pid => ({ personalId: pid, name: nameMap[pid] || pid }));
    }
    res.json({ success: true, data: { ...rows[0], participants: participantsWithName } });
  } catch (err) { next(err); }
});

// PUT /api/reservations/:id — 修改预约（权限 + 服务器时间规则）
router.put('/:id', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });

    const [rows] = await conn.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS dateStr, TIME_FORMAT(startTime, '%H:%i') AS startStr, TIME_FORMAT(endTime, '%H:%i') AS endStr
       FROM reservations WHERE id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该预约' });
    const resv = rows[0];
    const resvDate = resv.dateStr || toDateStr(resv.date);

    const admin = await isAdminUser(user.personalId);

    // 权限：管理员可修改任何预约；否则仅主预约人可修改
    if (!admin && resv.bookerId !== user.personalId) {
      return res.status(403).json({ success: false, message: '仅主预约人可修改该预约' });
    }

    const now = new Date();
    // 预约结束的本地时间（服务器时区）
    const resvStart = resv.startStr || resv.startTime;
    const resvEnd = resv.endStr || resv.endTime;
    const endLocal = new Date(`${resvDate}T${resvEnd}`);
    const startLocal = new Date(`${resvDate}T${resvStart}`);

    const { startTime, endTime, participants } = req.body;

    let newStart = normalizeTime(startTime || resv.startTime);
    let newEnd = normalizeTime(endTime || resv.endTime);

    if (!admin) {
      // 普通用户：遵循服务器时间修改规则
      if (now >= endLocal) {
        return res.status(400).json({ success: false, message: '该预约已结束，无法修改' });
      }
      // 进行中（开始时间 ≤ 当前 < 结束时间）：仅允许修改结束时间
      if (now >= startLocal && now < endLocal) {
        if (startTime && normalizeTime(startTime) !== normalizeTime(resvStart)) {
          return res.status(400).json({ success: false, message: '预约已在进行中，仅可修改结束时间' });
        }
        if (endTime) {
          newEnd = normalizeTime(endTime);
          // 新的结束时间必须 ≥ 当前时间
          const newEndDate = new Date(`${resvDate}T${newEnd}`);
          if (newEndDate <= now) {
            return res.status(400).json({ success: false, message: '结束时间必须晚于当前时间' });
          }
        }
      } else {
        // 未开始：可修改起止时间
        if (startTime && normalizeTime(startTime) !== normalizeTime(resvStart)) newStart = normalizeTime(startTime);
        if (endTime) newEnd = normalizeTime(endTime);
      }
    }

    // 时间范围校验（不跨天、07:00-22:30、结束>开始）
    if (!isValidTimeRange(newStart, newEnd)) {
      return res.status(400).json({ success: false, message: '时间必须在 07:00 ~ 22:30 之间，且结束时间必须晚于开始时间' });
    }

    // 参与者校验（可选更新）
    let plist = null;
    if (participants !== undefined) {
      plist = Array.isArray(participants) ? participants : [];
      plist = [...new Set(plist.filter(p => p && typeof p === 'string'))];
      if (!plist.includes(user.personalId)) plist.unshift(user.personalId);
      if (plist.length > MAX_PARTICIPANTS) {
        return res.status(400).json({ success: false, message: `每笔预约最多 ${MAX_PARTICIPANTS} 人（含主预约人）` });
      }
      if (plist.length) {
        const ph = plist.map(() => '?').join(',');
        const [persons] = await conn.query(`SELECT personalId FROM persons WHERE personalId IN (${ph})`, plist);
        const found = new Set(persons.map(p => p.personalId));
        const missing = plist.filter(p => !found.has(p));
        if (missing.length) return res.status(400).json({ success: false, message: `以下人员不存在：${missing.join(', ')}` });
      }
    }

    await conn.beginTransaction();
    if (!admin) {
      // 普通用户：冲突检测（排除自身）
      const [conflicts] = await conn.query(
        `SELECT id FROM reservations WHERE roomId = ? AND date = ? AND id != ? AND startTime < ? AND endTime > ?
         FOR UPDATE`,
        [resv.roomId, resvDate, resv.id, newEnd, newStart]
      );
      if (conflicts.length) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: '该时间段已被占用，请选择其他时间' });
      }
    }

    // 无论是否更新参与者，都保证写入合法 JSON
    const finalParticipants = plist || parseParticipants(resv.participants);
    await conn.query(
      'UPDATE reservations SET startTime = ?, endTime = ?, participants = ? WHERE id = ?',
      [newStart, newEnd, JSON.stringify(finalParticipants), resv.id]
    );
    await conn.commit();
    res.json({ success: true, message: '预约已更新' });
  } catch (err) {
    try { await conn.rollback(); } catch (e) {}
    next(err);
  } finally {
    conn.release();
  }
});

// DELETE /api/reservations/:id — 取消预约
router.delete('/:id', async (req, res, next) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });

    const [rows] = await pool.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS dateStr, TIME_FORMAT(startTime, '%H:%i') AS startStr, TIME_FORMAT(endTime, '%H:%i') AS endStr
       FROM reservations WHERE id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '未找到该预约' });
    const resv = rows[0];
    const resvDate = resv.dateStr || toDateStr(resv.date);

    const admin = await isAdminUser(user.personalId);

    // 权限：管理员可取消任何预约；否则仅主预约人可取消
    if (!admin && resv.bookerId !== user.personalId) {
      return res.status(403).json({ success: false, message: '仅主预约人可取消该预约' });
    }

    const now = new Date();
    const endLocal = new Date(`${resvDate}T${resv.endStr || resv.endTime || '22:30'}`);

    if (!admin) {
      // 普通用户：预约未结束（含进行中）均可取消；已结束则不可
      if (now >= endLocal) {
        return res.status(400).json({ success: false, message: '该预约已结束，无法取消' });
      }
    }

    await pool.query('DELETE FROM reservations WHERE id = ?', [resv.id]);
    res.json({ success: true, message: '预约已取消' });
  } catch (err) { next(err); }
});

module.exports = router;
