const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// 鉴权中间件
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.DESKTOP_TOKEN}`) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  next();
}

// 桌面端轮询 - 拉取新消息
router.get('/poll', auth, (req, res) => {
  const lastId = req.query.lastId || '';
  const db = getDB();

  let rows;
  if (lastId) {
    rows = db.prepare(
      `SELECT * FROM push_messages WHERE id > ? AND delivered = 0 ORDER BY created_at ASC`
    ).all(lastId);
  } else {
    rows = db.prepare(
      `SELECT * FROM push_messages WHERE delivered = 0 ORDER BY created_at ASC LIMIT 50`
    ).all();
  }

  // 标记为已推送
  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE push_messages SET delivered = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  res.json({
    status: rows.length > 0 ? 'ok' : 'no_new',
    data: rows,
    lastId: rows.length > 0 ? rows[rows.length - 1].id : lastId
  });
});

// 桌面端心跳
router.post('/heartbeat', auth, (req, res) => {
  // 简单记录，后续可存到数据库做在线状态
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 桌面端同步便签
router.post('/reminder/sync', auth, (req, res) => {
  const { reminders } = req.body;
  if (!Array.isArray(reminders)) {
    return res.status(400).json({ status: 'error', message: 'reminders 必须是数组' });
  }

  const db = getDB();
  const upsert = db.prepare(`
    INSERT INTO reminders (id, text, remind_at, done, source, synced_at)
    VALUES (?, ?, ?, ?, 'desktop', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      text = excluded.text,
      remind_at = excluded.remind_at,
      done = excluded.done,
      synced_at = datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const r of reminders) {
      upsert.run(r.id, r.text, r.remindAt || null, r.done ? 1 : 0);
    }
  });
  tx();

  res.json({ status: 'ok', count: reminders.length });
});

// 桌面端查询考试安排
router.get('/exams', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM exams ORDER BY exam_date, start_time'
  ).all();

  res.json({ status: 'ok', data: { exams: rows } });
});

// ===== AI 数据查询接口（供符玄桌面端使用） =====

// 查询全部成绩
router.get('/scores', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM scores ORDER BY semester DESC, course_name'
  ).all();

  res.json({ status: 'ok', data: { scores: rows } });
});

// 查询课表（按周次，默认当前周）
router.get('/schedule', auth, (req, res) => {
  const week = parseInt(req.query.week) || 0;
  const db = getDB();

  let rows;
  if (week > 0) {
    rows = db.prepare(
      'SELECT * FROM courses WHERE week = ? ORDER BY day, start_slot'
    ).all(week);
  } else {
    // 不指定周次则返回全部课表（供 AI 查看整体安排）
    rows = db.prepare(
      'SELECT * FROM courses ORDER BY week, day, start_slot'
    ).all();
  }

  const maxWeekRow = db.prepare('SELECT MAX(week) as maxWeek FROM courses').get();
  const maxWeek = maxWeekRow?.maxWeek || 20;

  res.json({ status: 'ok', data: { week: week || 'all', maxWeek, courses: rows } });
});

// 查询用户绑定状态
router.get('/user/status', auth, (req, res) => {
  const db = getDB();
  const user = db.prepare(
    'SELECT id, username, semester, last_login_at FROM users LIMIT 1'
  ).get();

  if (!user) {
    return res.json({ status: 'ok', data: { bound: false } });
  }

  // 查询总成绩数
  const scoreCount = db.prepare('SELECT COUNT(*) as cnt FROM scores').get();
  // 查询总考试数
  const examCount = db.prepare('SELECT COUNT(*) as cnt FROM exams').get();
  // 查询课表总周数
  const maxWeekRow = db.prepare('SELECT MAX(week) as maxWeek FROM courses').get();

  res.json({
    status: 'ok',
    data: {
      bound: true,
      username: user.username,
      semester: user.semester,
      lastLoginAt: user.last_login_at,
      stats: {
        scoresCount: scoreCount?.cnt || 0,
        examsCount: examCount?.cnt || 0,
        scheduleWeeks: maxWeekRow?.maxWeek || 0
      }
    }
  });
});

module.exports = router;
