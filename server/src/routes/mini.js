const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

// 鉴权中间件
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.MINI_TOKEN}`) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  next();
}

// 获取课表 - 按周次
router.get('/schedule', auth, (req, res) => {
  const week = parseInt(req.query.week) || 1;
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM courses WHERE week = ? ORDER BY day, start_slot'
  ).all(week);

  res.json({ status: 'ok', data: { week, courses: rows } });
});

// 获取所有成绩
router.get('/scores', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM scores ORDER BY semester DESC, course_name'
  ).all();

  res.json({ status: 'ok', data: { scores: rows } });
});

// 获取考试安排
router.get('/exams', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM push_messages WHERE type = ? ORDER BY created_at DESC'
  ).all('exam_reminder');

  const exams = rows.map(r => ({
    ...JSON.parse(r.payload || '{}'),
    title: r.title,
    body: r.body,
    id: r.id
  }));

  res.json({ status: 'ok', data: { exams } });
});

// 获取桌面端便签
router.get('/reminders', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM reminders ORDER BY created_at DESC LIMIT 50'
  ).all();

  res.json({ status: 'ok', data: { reminders: rows } });
});

// 小程序触发推送消息（手动测试用）
router.post('/push', auth, (req, res) => {
  const { type, title, body, payload } = req.body;
  if (!type || !title || !body) {
    return res.status(400).json({ status: 'error', message: '缺少必填字段' });
  }

  const { v4: uuidv4 } = require('uuid');
  const db = getDB();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO push_messages (id, type, title, body, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, type, title, body, JSON.stringify(payload || {}));

  res.json({ status: 'ok', messageId: id });
});

module.exports = router;
