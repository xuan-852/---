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

module.exports = router;
