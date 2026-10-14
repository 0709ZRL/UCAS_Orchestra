const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'orchestra',
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function ensureAttendanceSchema() {
  try {
    // ── 保险 1：移除 attendance.eventId 上的外键 ──────────────────────────
    // eventId 是**多态软引用**：既可能是 `ARTICLE_<articleId>`（现在的报名/打卡都走文章），
    // 也可能是历史 `events.eventId`。一旦给它加上 → events(eventId) 的外键，
    // **所有报名与打卡写入都会报 1452 外键错误**（2026-10-14 线上事故）。
    // 这里每次启动都主动检查并删除，确保不会被重新加回来而再次瘫痪。
    const [fkRows] = await pool.query(
      `SELECT rc.constraint_name AS fkName
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_schema = rc.constraint_schema
          AND kcu.constraint_name = rc.constraint_name
        WHERE rc.constraint_schema = DATABASE()
          AND rc.table_name = 'attendance'
          AND kcu.column_name = 'eventId'`
    );
    for (const fk of fkRows) {
      // information_schema 各列的返回大小写不固定，兼容多种写法
      const fkName = fk.fkName || fk.FKNAME || fk.CONSTRAINT_NAME || fk.constraint_name;
      if (!fkName) continue;
      try {
        console.warn(`[attendance] 检测到 eventId 外键 ${fkName}（会阻断报名/打卡），自动移除`);
        await pool.query('ALTER TABLE attendance DROP FOREIGN KEY `' + fkName + '`');
        console.warn(`[attendance] 已移除 ${fkName}，报名/打卡恢复正常`);
      } catch (dropErr) {
        console.error(`[attendance] 移除外键 ${fkName} 失败：${dropErr.message}`);
      }
    }

    const [indexes] = await pool.query(
      "SHOW INDEX FROM attendance WHERE Key_name IN ('UNQ_Attendance_Personal_Event', 'UNQ_Attendance_Personal_Event_Method')"
    );

    const hasLegacyUnique = indexes.some((row) => row.Key_name === 'UNQ_Attendance_Personal_Event');
    const hasMethodUnique = indexes.some((row) => row.Key_name === 'UNQ_Attendance_Personal_Event_Method');

    if (hasLegacyUnique && !hasMethodUnique) {
      const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const backupName = `attendance_backup_${stamp}`;
      await pool.query(`CREATE TABLE IF NOT EXISTS ${backupName} LIKE attendance`);
      await pool.query(`INSERT INTO ${backupName} SELECT * FROM attendance`);
      await pool.query('ALTER TABLE attendance DROP INDEX UNQ_Attendance_Personal_Event');
      await pool.query(
        'ALTER TABLE attendance ADD UNIQUE KEY UNQ_Attendance_Personal_Event_Method (personalId, eventId, method)'
      );
    } else if (!hasLegacyUnique && !hasMethodUnique) {
      await pool.query(
        'ALTER TABLE attendance ADD UNIQUE KEY UNQ_Attendance_Personal_Event_Method (personalId, eventId, method)'
      );
    }

    await pool.query(`
      INSERT INTO attendance (personalId, eventId, title, method)
      SELECT a.personalId, a.eventId, COALESCE(a.title, e.title, ar.title), 0
      FROM attendance a
      LEFT JOIN events e ON a.eventId = e.eventId
      LEFT JOIN articles ar ON a.eventId = CONCAT('ARTICLE_', ar.articleId)
      WHERE a.method = 1
        AND NOT EXISTS (
          SELECT 1 FROM attendance b
          WHERE b.personalId = a.personalId
            AND b.eventId = a.eventId
            AND b.method = 0
        )
    `);
  } catch (error) {
    console.error('Attendance schema migration failed:', error.message);
    throw error;
  }
}

module.exports = pool;
module.exports.ensureAttendanceSchema = ensureAttendanceSchema;
