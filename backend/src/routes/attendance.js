const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();
const { loadUser, isManager, isSectionLeader, getTokenFromReq } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'orchestra_secret_key_2026';

// 载入当前用户（req.user），供权限判断
router.use(loadUser);

// GET /api/attendance
router.get('/', async (req, res, next) => {
  try {
    const { personalId, eventId, page = 1, limit = 100 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (personalId) { where += ' AND a.personalId = ?'; params.push(personalId); }
    if (eventId) {
      // 支持纯数字（自动转 ARTICLE_ 前缀）或完整 eventId
      if (/^\d+$/.test(eventId)) {
        where += ' AND a.eventId = ?'; params.push('ARTICLE_' + eventId);
      } else {
        where += ' AND a.eventId = ?'; params.push(eventId);
      }
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`, params
    );
    const total = countRows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sql = `SELECT a.*, p.name AS personName, p.section AS personSection,
                 COALESCE(e.title, ar.title) AS eventTitle,
                 CASE WHEN a.eventId LIKE 'ARTICLE_%' THEN REPLACE(a.eventId, 'ARTICLE_', '') ELSE a.eventId END AS displayEventId
                 FROM attendance a
                 LEFT JOIN persons p ON a.personalId = p.personalId
                 LEFT JOIN events e ON a.eventId = e.eventId
                 LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
                 ${where}
                 ORDER BY a.attendanceId DESC LIMIT ? OFFSET ?`;
    const allParams = [...params, parseInt(limit), offset];

    const [rows] = await pool.query(sql, allParams);
    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// POST /api/attendance/lookup — 根据姓名/活动名查找匹配
router.post('/lookup', async (req, res, next) => {
  try {
    const { personName, eventTitle } = req.body;
    const result = { person: null, event: null, personOptions: [], eventOptions: [] };

    if (personName) {
      const [persons] = await pool.query(
        'SELECT personalId, name, section, campus FROM persons WHERE name LIKE ?',
        [`%${personName}%`]
      );
      if (persons.length === 1) result.person = persons[0];
      else result.personOptions = persons;
    }
    if (eventTitle) {
      const [events] = await pool.query(
        'SELECT eventId, title, year, month, date, startTime FROM events WHERE title LIKE ?',
        [`%${eventTitle}%`]
      );
      if (events.length === 1) result.event = events[0];
      else result.eventOptions = events;
    }
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// POST /api/attendance — 签到（需传入已确认的 personalId 和 eventId）
// 权限：管理员可新增任意签到；声部长只能新增本声部成员的签到；普通成员禁止
router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    if (!isManager(user) && !isSectionLeader(user)) {
      return res.status(403).json({ success: false, message: '普通成员不能新增签到' });
    }
    const { personalId, eventId, title, method } = req.body;
    if (!personalId || !eventId) {
      return res.status(400).json({ success: false, message: 'personalId 和 eventId 为必填项' });
    }
    // 声部长只能新增本声部成员的签到
    if (!isManager(user)) {
      const [p] = await pool.query('SELECT section FROM persons WHERE personalId = ?', [personalId]);
      if (!p.length) return res.status(400).json({ success: false, message: 'personalId 不存在' });
      if (p[0].section !== user.section) {
        return res.status(403).json({ success: false, message: '声部长只能新增本声部成员的签到' });
      }
    }
    await pool.query(
      'INSERT INTO attendance (personalId, eventId, title, method) VALUES (?, ?, ?, ?)',
      [personalId, eventId, title || null, method !== undefined ? (method ? 1 : 0) : 0]
    );
    res.status(201).json({ success: true, message: '签到成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: '该成员已签到此活动' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'personalId 或 eventId 不存在' });
    next(err);
  }
});

// DELETE /api/attendance/:attendanceId
// 权限：管理员可删除任意签到；声部长只能删除本声部成员的签到；普通成员禁止
router.delete('/:attendanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '请先登录' });
    if (!isManager(user) && !isSectionLeader(user)) {
      return res.status(403).json({ success: false, message: '普通成员不能删除签到' });
    }
    if (!isManager(user)) {
      const [rows] = await pool.query(
        `SELECT p.section FROM attendance a JOIN persons p ON a.personalId = p.personalId WHERE a.attendanceId = ?`,
        [req.params.attendanceId]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: '未找到该签到记录' });
      if (rows[0].section !== user.section) {
        return res.status(403).json({ success: false, message: '声部长只能删除本声部成员的签到' });
      }
    }
    const [result] = await pool.query('DELETE FROM attendance WHERE attendanceId = ?', [req.params.attendanceId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '未找到该签到记录' });
    res.json({ success: true, message: '已删除签到记录' });
  } catch (err) { next(err); }
});

// ===== 出勤数据大屏 =====
const SECTION_NAMES = { 0:'民族管乐',1:'弹拨一组',2:'弹拨二组',3:'胡琴',4:'提琴',5:'西洋木管',6:'西洋铜管',7:'低音',8:'钢琴',9:'打击',10:'无声部' };

// 各声部总人数（百分比分母）
async function getSectionTotals() {
  const [rows] = await pool.query('SELECT section, COUNT(*) AS total FROM persons GROUP BY section');
  const map = {};
  rows.forEach(r => map[r.section] = r.total);
  return map;
}

// 成员列表：按次数降序（连续名次：并列同名次后下一个名次不跳号），导出用
function rankMembers(list) {
  list.sort((a, b) => b.count - a.count || a.section - b.section || String(a.name).localeCompare(String(b.name), 'zh'));
  let prevCount = null, prevRank = 0;
  return list.map((m, i) => {
    if (m.count !== prevCount) prevRank += 1;
    prevCount = m.count;
    return { rank: prevRank, personalId: m.personalId, name: m.name, section: SECTION_NAMES[m.section] || ('声部' + m.section), count: m.count };
  });
}

// 核心统计计算（活动详情 / 时间段汇总共用）
async function computeDashboard({ type = 'signup', activityId, dateFrom, dateTo }) {
  const method = type === 'checkin' ? 1 : 0;
  const secTotal = await getSectionTotals();

  // 活动详情
  if (activityId) {
    let act = null;
    if (String(activityId).startsWith('ARTICLE_')) {
      const id = String(activityId).replace('ARTICLE_', '');
      const [rows] = await pool.query('SELECT articleId, title, startTime, endTime FROM articles WHERE articleId = ?', [id]);
      if (rows.length) act = { id: activityId, title: rows[0].title, startTime: rows[0].startTime, endTime: rows[0].endTime };
    } else {
      const [rows] = await pool.query('SELECT eventId AS id, title, startTime, endTime FROM events WHERE eventId = ?', [activityId]);
      if (rows.length) act = { id: activityId, title: rows[0].title, startTime: rows[0].startTime, endTime: rows[0].endTime };
    }
    if (!act) return null;

    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM attendance WHERE eventId = ? AND method = ?', [activityId, method]);
    const total = totalRows[0].total;

    const [secRows] = await pool.query(
      `SELECT p.section, COUNT(*) AS cnt FROM attendance a
       JOIN persons p ON a.personalId = p.personalId
       WHERE a.eventId = ? AND a.method = ? GROUP BY p.section`, [activityId, method]
    );
    const sections = secRows.map(r => {
      const name = SECTION_NAMES[r.section] || ('声部' + r.section);
      const totalMembers = secTotal[r.section] || 0;
      return { name, count: r.cnt, totalMembers, pct: totalMembers ? Math.round(r.cnt / totalMembers * 100) : 0 };
    }).sort((a, b) => b.count - a.count);

    // 成员级明细（导出用）：全体成员，参与=1 / 未参与=0，按次数降序
    const [partRows] = await pool.query('SELECT personalId FROM attendance WHERE eventId = ? AND method = ?', [activityId, method]);
    const partSet = new Set(partRows.map(r => r.personalId));
    const [personRows] = await pool.query('SELECT personalId, name, section FROM persons');
    const members = rankMembers(personRows.map(p => ({
      personalId: p.personalId, name: p.name, section: p.section, count: partSet.has(p.personalId) ? 1 : 0
    })));

    return { scope: 'activity', activity: act, total, sections, members };
  }

  // 时间段汇总
  const from = dateFrom || '1970-01-01';
  const to = dateTo || '2999-12-31';
  const [actCnt] = await pool.query("SELECT COUNT(*) AS c FROM articles WHERE type IN (0,1) AND startTime IS NOT NULL AND DATE(startTime) >= ? AND DATE(startTime) <= ?", [from, to]);
  const [evCnt] = await pool.query("SELECT COUNT(*) AS c FROM events WHERE startTime IS NOT NULL AND DATE(startTime) >= ? AND DATE(startTime) <= ?", [from, to]);
  const activityCount = actCnt[0].c + evCnt[0].c;

  const [rows] = await pool.query(
    `SELECT a.personalId, p.name AS personName, p.section,
            COALESCE(ar.startTime, e.startTime) AS actTime
     FROM attendance a
     JOIN persons p ON a.personalId = p.personalId
     LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
     LEFT JOIN events e ON a.eventId = e.eventId
     WHERE a.method = ?`, [method]
  );
  const fromD = new Date(from + 'T00:00:00');
  const toD = new Date(to + 'T23:59:59');
  const filtered = rows.filter(r => {
    if (!r.actTime) return false;
    const t = new Date(r.actTime);
    return t >= fromD && t <= toD;
  });

  const totalTimes = filtered.length;
  const avgPerActivity = activityCount ? Math.round(totalTimes / activityCount * 10) / 10 : 0;

  const secTimes = {};
  const personMap = {};
  filtered.forEach(r => {
    const s = r.section;
    secTimes[s] = (secTimes[s] || 0) + 1;
    if (!personMap[r.personalId]) personMap[r.personalId] = { personalId: r.personalId, name: r.personName || r.personalId, section: s, count: 0 };
    personMap[r.personalId].count++;
  });
  const sections = Object.keys(secTimes).map(s => {
    const name = SECTION_NAMES[s] || ('声部' + s);
    const totalMembers = secTotal[s] || 0;
    const times = secTimes[s];
    return {
      name, times,
      avg: activityCount ? Math.round(times / activityCount * 10) / 10 : 0,
      totalMembers,
      pct: (totalMembers && activityCount) ? Math.round(times / (totalMembers * activityCount) * 100) : 0
    };
  }).sort((a, b) => b.times - a.times);

  // Top N（并列同名次，界面展示用：仅参与成员，前20）
  const topList = Object.values(personMap).sort((a, b) => b.count - a.count).slice(0, 20);
  const top = rankMembers(topList);

  // 成员级明细（导出用）：全体成员含未参与（0次），按次数降序
  const [personRows] = await pool.query('SELECT personalId, name, section FROM persons');
  const members = rankMembers(personRows.map(p => ({
    personalId: p.personalId, name: p.name, section: p.section, count: personMap[p.personalId] ? personMap[p.personalId].count : 0
  })));

  return { scope: 'range', dateFrom: from, dateTo: to, activityCount, totalTimes, avgPerActivity, sections, top, members };
}

// GET /api/attendance/activities — 活动列表（按时间倒序）
router.get('/activities', async (req, res, next) => {
  try {
    const [articles] = await pool.query(
      "SELECT articleId AS id, title, startTime, endTime FROM articles WHERE type IN (0,1) ORDER BY startTime DESC"
    );
    const [events] = await pool.query(
      'SELECT eventId AS id, title, startTime, endTime FROM events ORDER BY startTime DESC'
    );
    const list = [
      ...articles.map(a => ({ id: 'ARTICLE_' + a.id, title: a.title, startTime: a.startTime, endTime: a.endTime })),
      ...events.map(e => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime }))
    ].filter(a => a.startTime)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    res.json({ success: true, data: list.slice(0, 100) });
  } catch (err) { next(err); }
});

// GET /api/attendance/dashboard?type=signup|checkin&activityId=&dateFrom=&dateTo=
router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await computeDashboard(req.query);
    if (data === null) return res.status(404).json({ success: false, message: '活动不存在' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/attendance/section-detail?section=&activityId=&dateFrom=&dateTo=
// 管理员/声部长查看声部下所有成员的报名/出勤情况（管理员可看全部声部，声部长仅限本声部）
router.get('/section-detail', async (req, res, next) => {
  try {
    // 鉴权（支持 Bearer token 或 Cookie）
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ success: false, message: '未登录' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch (e) { return res.status(401).json({ success: false, message: '登录已过期' }); }
    const [meRows] = await pool.query('SELECT personalId, section, job, isManager FROM persons WHERE personalId = ?', [decoded.personalId]);
    if (!meRows.length) return res.status(401).json({ success: false, message: '用户不存在' });
    const me = meRows[0];
    if (me.isManager !== 1 && me.job !== 1) {
      return res.status(403).json({ success: false, message: '仅管理员或声部长可查看' });
    }

    // 声部：管理员可指定任意声部；声部长固定为本声部
    let section = req.query.section !== undefined && req.query.section !== '' ? parseInt(req.query.section) : me.section;
    if (isNaN(section)) section = me.section;
    if (me.isManager !== 1 && me.job === 1 && section !== me.section) {
      return res.status(403).json({ success: false, message: '声部长只能查看本声部数据' });
    }

    const sectionName = SECTION_NAMES[section] || ('声部' + section);
    const [memberRows] = await pool.query('SELECT personalId, name FROM persons WHERE section = ? ORDER BY name', [section]);
    const [totalRows] = await pool.query('SELECT COUNT(*) AS c FROM persons WHERE section = ?', [section]);
    const totalMembers = totalRows[0].c;
    const ids = memberRows.map(m => m.personalId);

    const { activityId, dateFrom, dateTo } = req.query;
    let mode = 'range';
    let members = [];

    if (activityId) {
      // 活动模式：每人报名/出勤 是否
      mode = 'activity';
      const signupSet = new Set(), checkinSet = new Set();
      if (ids.length) {
        const [rows] = await pool.query(
          'SELECT personalId, method FROM attendance WHERE eventId = ? AND personalId IN (?)',
          [activityId, ids]
        );
        rows.forEach(r => { (r.method === 1 ? checkinSet : signupSet).add(r.personalId); });
      }
      members = memberRows.map(m => ({
        personalId: m.personalId, name: m.name,
        signup: signupSet.has(m.personalId) ? 1 : 0,
        checkin: checkinSet.has(m.personalId) ? 1 : 0
      }));
    } else {
      // 时间段模式：每人报名/出勤次数
      const signupMap = new Map(), checkinMap = new Map();
      if (ids.length) {
        const [rows] = await pool.query(
          `SELECT a.personalId, a.method, COALESCE(ar.startTime, e.startTime) AS actTime
           FROM attendance a
           LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
           LEFT JOIN events e ON a.eventId = e.eventId
           WHERE a.personalId IN (?)`, [ids]
        );
        const fromD = new Date((dateFrom || '1970-01-01') + 'T00:00:00');
        const toD = new Date((dateTo || '2999-12-31') + 'T23:59:59');
        rows.forEach(r => {
          if (!r.actTime) return;
          const t = new Date(r.actTime);
          if (t < fromD || t > toD) return;
          if (r.method === 1) checkinMap.set(r.personalId, (checkinMap.get(r.personalId) || 0) + 1);
          else signupMap.set(r.personalId, (signupMap.get(r.personalId) || 0) + 1);
        });
      }
      members = memberRows.map(m => ({
        personalId: m.personalId, name: m.name,
        signup: signupMap.get(m.personalId) || 0,
        checkin: checkinMap.get(m.personalId) || 0
      }));
    }

    // 按 报名+出勤 合计降序，连续名次（并列后不跳号）
    members.sort((a, b) => (b.signup + b.checkin) - (a.signup + a.checkin) || String(a.name).localeCompare(String(b.name), 'zh'));
    let prevTotal = null, prevRank = 0;
    members.forEach((m, i) => {
      const total = m.signup + m.checkin;
      if (total !== prevTotal) prevRank += 1;
      prevTotal = total;
      m.rank = prevRank;
    });

    res.json({ success: true, data: { section, sectionName, totalMembers, mode, members } });
  } catch (err) { next(err); }
});

// GET /api/attendance/export?type=&activityId=&dateFrom=&dateTo=
// 导出当前统计为 .xlsx（活动详情/时间段→全体成员报名/出勤情况，按次数降序）
router.get('/export', async (req, res, next) => {
  try {
    const XLSX = require('xlsx');
    const { type = 'signup', activityId, dateFrom, dateTo } = req.query;
    const d = await computeDashboard({ type, activityId, dateFrom, dateTo });
    if (!d) return res.status(404).json({ success: false, message: '活动不存在' });

    const list = d.members || [];
    const title = d.scope === 'activity'
      ? `【${type === 'checkin' ? '出勤' : '报名'}统计】${d.activity.title}`
      : `【${type === 'checkin' ? '出勤' : '报名'}统计】${d.dateFrom} ~ ${d.dateTo}`;
    const rows = list.map(p => ({
      '排名': p.rank, '姓名': p.name, '用户ID': p.personalId, '声部': p.section, '次数': p.count
    }));
    if (!rows.length) return res.json({ success: true, message: '无数据可导出', empty: true });

    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(12, String(k).length * 2 + 6) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, '统计');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fname = encodeURIComponent(`${title}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
    res.send(buf);
  } catch (err) { next(err); }
});

module.exports = router;
