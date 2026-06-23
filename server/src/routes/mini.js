const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const njust = require('../services/njust');
const crypto = require('crypto');
const axios = require('axios');
const log = require('../utils/logger');

// ===== 桥接服务配置 =====
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3456';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';

/**
 * 调用桥接服务刷新数据
 * 桥接服务维护一个持久 Edge 浏览器，绕过 bkjw 反爬
 */
async function refreshViaBridge() {
  if (!BRIDGE_TOKEN) {
    throw new Error('桥接服务未配置 (BRIDGE_TOKEN)');
  }
  const res = await axios.post(`${BRIDGE_URL}/refresh`, {}, {
    headers: { 'x-bridge-token': BRIDGE_TOKEN },
    timeout: 60000,
  });
  return res.data;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'njust-schedule-default-key-32chr!';

// 加密密码（简单 AES-256-GCM）
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(text) {
  const [ivHex, tagHex, encHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}

// 鉴权中间件
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.MINI_TOKEN}`) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  next();
}

// ========== 通用 ==========

// 客户端配置（动态下发，更换 ngrok 域名时只需改 .env）
router.get('/config', (req, res) => {
  res.json({
    status: 'ok',
    data: {
      serverUrl: process.env.PUBLIC_URL || 'https://cross-churn-distance.ngrok-free.dev',
      pingInterval: 5000,
      probeCount: 10,
      probeWindow: 5000,
    }
  });
});

// 小程序端健康检查（短平快，用于判断连接状态）
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// ========== 用户/登录相关 ==========

// 绑定教务账号
router.post('/user/bind', auth, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: '学号和密码不能为空' });
  }

  try {
    const password_enc = encrypt(password);
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      db.run('UPDATE users SET password_enc = ? WHERE username = ?', [password_enc, username]);
    } else {
      db.run('INSERT INTO users (username, password_enc) VALUES (?, ?)', [username, password_enc]);
    }
    res.json({ status: 'ok', message: '账号已绑定' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ========== Bridge 凭据接口（Plan A 自动重登用） ==========
// Bridge 通过此接口请求已存储的教务系统凭据
const BRIDGE_CRED_TOKEN = process.env.BRIDGE_CRED_TOKEN || '';

router.get('/bridge-cred', (req, res) => {
  // 用专用 token 鉴权（区别于 MINI_TOKEN）
  const token = req.headers['x-bridge-cred-token'];
  if (!BRIDGE_CRED_TOKEN || token !== BRIDGE_CRED_TOKEN) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  const db = getDB();
  const user = db.prepare('SELECT id, username, password_enc FROM users LIMIT 1').get();
  if (!user) {
    return res.status(404).json({ status: 'error', message: '数据库无凭据' });
  }
  try {
    const password = decrypt(user.password_enc);
    res.json({ status: 'ok', data: { username: user.username, password } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: '解密失败' });
  }
});

// ===== 刷新防抖 =====
let _lastRefreshAt = 0;
const _REFRESH_DEBOUNCE_MS = 30000;

// 手动刷新教务数据（课表+成绩）
router.post('/refresh', auth, async (req, res) => {
  // 服务端防抖——30s 内跳过重复刷新
  const now = Date.now();
  if (now - _lastRefreshAt < _REFRESH_DEBOUNCE_MS) {
    log.info(`[mini] ⏳ 距离上次刷新不足 ${_REFRESH_DEBOUNCE_MS/1000}s，跳过`);
    return res.json({ status: 'ok', source: 'debounced', message: '刷新太频繁，已跳过' });
  }
  _lastRefreshAt = now;

  const db = getDB();
  try {
    // ===== 策略1: 桥接服务（Plan A） =====
    if (BRIDGE_TOKEN) {
      try {
        log.info('[mini] 🅰️ Plan A: 通过桥接服务刷新...');
        const bridgeResult = await refreshViaBridge();
        if (bridgeResult.ok) {
          // 桥接成功→从桥接服务拉取完整数据写入数据库
          log.info('[mini] ✅ Plan A 成功，拉取数据写入本地DB...');
          await writeBridgeDataToDB(db);
          return res.json({ status: 'ok', source: 'bridge', data: bridgeResult });
        }
      } catch (bridgeErr) {
        const msg = bridgeErr.response?.data?.error || bridgeErr.message;
        const needsManual = bridgeErr.response?.data?.needsManual;
        log.warn(`[mini] ⚠️ Plan A 失败: ${msg}`);
        
        // 如果 Bridge 自动重登失败（验证码等），触发 Plan C
        if (needsManual) {
          log.info('[mini] 🅲 Plan A 自动重登失败，触发 Plan C 临时浏览器...');
        } else {
          log.info('[mini] ⚡ Bridge 不可用，触发 Plan C 临时浏览器...');
        }
      }
    }

    // ===== 策略2: Plan C 临时浏览器直连 =====
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) {
      return res.status(400).json({ status: 'error', message: '请先在设置中绑定教务账号' });
    }
    const password = decrypt(user.password_enc);

    try {
      log.info('[mini] 🅲 Plan C: 启动临时浏览器抓取...');
      const browserFallback = require('../services/browser_fallback');
      const result = await browserFallback.fetchWithTempBrowser(user.username, password);

      // 将 Plan C 结果写入 DB
      try { saveScoresToDB(db, result.scores); } catch (e) { log.warn('[mini] PlanC 写成绩失败:', e.message); }
      try { saveScheduleToDB(db, result.schedule); } catch (e) { log.warn('[mini] PlanC 写课表失败:', e.message); }
      try { saveExamsToDB(db, result.exams); } catch (e) { log.warn('[mini] PlanC 写考试失败:', e.message); }

      // 更新最后登录时间
      db.run('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?', [user.id]);

      log.info('[mini] ✅ Plan C 完成');
      return res.json({
        status: 'ok',
        source: 'browser_fallback',
        data: {
          scoresCount: result.scores.length,
          scheduleCount: Object.keys(result.schedule).length,
          examsCount: result.exams.length,
        }
      });
    } catch (planCErr) {
      log.warn(`[mini] ❌ Plan C 也失败: ${planCErr.message}`);
      log.info('[mini] ⚡ Plan C 失败，回退到策略3 直连HTTP...');
    }

    // ===== 策略3: 直接 HTTP 登录（旧方案） =====
    const result = await njust.login(user.username, password);
    
    // 获取课表和成绩和考试
    const courses = await njust.fetchSchedule(result.cookie);
    const scoreResult = await njust.fetchScores(result.cookie);
    const currentSem = await njust.getCurrentSemester(result.cookie);

    // 尝试抓取考试（失败不影响主流程）
    try {
      await njust.fetchExams(result.cookie);
    } catch (examErr) {
      log.warn('[mini] ⚠️ 考试安排抓取失败（可忽略）:', examErr.message);
    }

    // 更新学期
    db.run('UPDATE users SET semester = ?, last_login_at = datetime(\'now\') WHERE id = ?', [currentSem, user.id]);

    log.info('[mini] ✅ 策略3 HTTP 直连完成');
    res.json({
      status: 'ok',
      source: 'direct',
      data: {
        courses_count: courses.length,
        scores_count: scoreResult.scores.length,
        new_scores_count: scoreResult.newScores.length,
        semester: currentSem
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

/**
 * 从 Bridge 拉取全量数据写入本地 DB
 */
async function writeBridgeDataToDB(db) {
  let writeErrors = [];

  try {
    const scoresRes = await axios.get(`${BRIDGE_URL}/scores`, {
      headers: { 'x-bridge-token': BRIDGE_TOKEN }, timeout: 10000
    });
    if (scoresRes.data?.ok && Array.isArray(scoresRes.data.data)) {
      saveScoresToDB(db, scoresRes.data.data);
    }
  } catch (e) { writeErrors.push('scores: ' + e.message); }
  
  try {
    const schedRes = await axios.get(`${BRIDGE_URL}/schedule`, {
      headers: { 'x-bridge-token': BRIDGE_TOKEN }, timeout: 10000
    });
    if (schedRes.data?.ok) {
      saveScheduleToDB(db, schedRes.data.data);
    }
  } catch (e) { writeErrors.push('schedule: ' + e.message); }

  try {
    const examsRes = await axios.get(`${BRIDGE_URL}/exams`, {
      headers: { 'x-bridge-token': BRIDGE_TOKEN }, timeout: 10000
    });
    if (examsRes.data?.ok && Array.isArray(examsRes.data.data)) {
      saveExamsToDB(db, examsRes.data.data);
    }
  } catch (e) { writeErrors.push('exams: ' + e.message); }

  if (writeErrors.length > 0) {
    log.warn('[mini] ⚠️ 部分写入失败:', writeErrors.join('; '));
  }
}

/** 保存成绩到数据库（兼容桥接服务的数据格式） */
function saveScoresToDB(db, scores) {
  if (!scores.length) {
    log.warn('[mini] ⚠️ 成绩数据为空，跳过写入（保留已有数据）');
    return;
  }
  // 表由 schema.sql 自动创建，这里直接用 db.run 插入（避免 prepare+free 循环问题）
  let count = 0;
  for (const s of scores) {
    try {
      db.run(
        `INSERT OR REPLACE INTO scores (semester, course_code, course_name, score, credit, hours, exam_type, attribute, nature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.semester || '', s.courseCode || '', s.courseName || '',
         String(s.score || ''), s.credit || 0, s.hours || 0,
         s.examType || '', s.attribute || '', s.nature || '']
      );
      count++;
    } catch (e) {
      log.warn(`[mini] ⚠️ 跳过成绩写入失败:`, e.message);
    }
  }
  log.info(`[mini] 💾 写入 ${count} 条成绩到数据库`);
}

/** 保存考试安排到数据库 */
function saveExamsToDB(db, exams) {
  if (!exams.length) {
    log.warn('[mini] ⚠️ 考试数据为空，跳过写入（保留已有数据）');
    return;
  }
  // 先清空旧考试（每次全量更新）
  db.run('DELETE FROM exams');
  let count = 0;
  for (const e of exams) {
    try {
      db.run(
        `INSERT INTO exams (course_name, exam_date, start_time, end_time, location, seat_no, exam_type, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.courseName || '', e.examDate || '', e.startTime || '', e.endTime || '',
         e.location || '', e.seatNo || '', e.examType || '期末', e.semester || '']
      );
      count++;
    } catch (err) {
      // 跳过重复项
    }
  }
  log.info(`[mini] 💾 写入 ${count} 条考试安排到数据库`);
}

/** 保存课表到数据库（桥接格式 → courses 表） */
function saveScheduleToDB(db, schedule) {
  if (!schedule || typeof schedule !== 'object') return;
  
  // 统计待插入总数
  let totalEntries = 0;
  for (const [key, entries] of Object.entries(schedule)) {
    if (Array.isArray(entries)) totalEntries += entries.length;
  }
  if (totalEntries === 0) {
    log.warn('[mini] ⚠️ 课表数据为空，跳过写入（保留已有数据）');
    return;
  }

  // 先清空旧课表（每次全量更新）
  db.run('DELETE FROM courses');

  // 节次映射
  const periodMap = {
    '第一大节': { start: 1, end: 3 },
    '第二大节': { start: 4, end: 5 },
    '第三大节': { start: 6, end: 7 },
    '第四大节': { start: 8, end: 9 },
    '晚上': { start: 10, end: 12 },
  };
  const dayMap = {
    '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4,
    '星期五': 5, '星期六': 6, '星期日': 0,
  };

  /**
   * 解析周次字符串 "1-16(周)" → [1,2,3,...,16]
   * 支持: "1-16", "1,3,5", "1-8,10-16", "1-16(周)"
   */
  function parseWeeks(str) {
    const cleaned = (str || '').replace(/\(周\)/g, '').trim();
    if (!cleaned) return [];
    const weeks = new Set();
    const parts = cleaned.split(',');
    for (const part of parts) {
      const m = part.match(/(\d+)-(\d+)/);
      if (m) {
        for (let w = parseInt(m[1]); w <= parseInt(m[2]); w++) weeks.add(w);
      } else {
        const n = parseInt(part);
        if (!isNaN(n)) weeks.add(n);
      }
    }
    return [...weeks].sort((a, b) => a - b);
  }

  let count = 0;
  for (const [key, entries] of Object.entries(schedule)) {
    const [period, dayStr] = key.split('-');
    const periodInfo = periodMap[period];
    const day = dayMap[dayStr];
    if (!periodInfo || day === undefined) continue;

    for (const entry of entries) {
      const weeks = parseWeeks(entry.weeks);
      for (const week of weeks) {
        try {
          db.run(
            `INSERT INTO courses (week, day, name, start_slot, end_slot, start_time, end_time, teacher, location)
             VALUES (?, ?, ?, ?, ?, '', '', '', '')`,
            [week, day, entry.course, periodInfo.start, periodInfo.end]
          );
          count++;
        } catch (e) {
          // 跳过重复项
        }
      }
    }
  }
  
  log.info(`[mini] 💾 写入 ${count} 条课表记录到数据库`);
}

// 获取登录状态
router.get('/user/status', auth, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, username, semester, last_login_at FROM users LIMIT 1').get();
  res.json({ status: 'ok', data: { bound: !!user, user } });
});

// ========== 数据查询 ==========

// 获取课表 - 按周次
router.get('/schedule', auth, (req, res) => {
  const week = parseInt(req.query.week) || 1;
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM courses WHERE week = ? ORDER BY day, start_slot'
  ).all(week);

  // 查询数据库中最大周数（学期总周数）
  const maxWeekRow = db.prepare('SELECT MAX(week) as maxWeek FROM courses').get();
  const maxWeek = maxWeekRow?.maxWeek || 20;

  res.json({ status: 'ok', data: { week, maxWeek, courses: rows } });
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
    'SELECT * FROM exams ORDER BY exam_date ASC, start_time ASC'
  ).all();

  res.json({ status: 'ok', data: { exams: rows } });
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

  db.run(
    `INSERT INTO push_messages (id, type, title, body, payload) VALUES (?, ?, ?, ?, ?)`,
    [id, type, title, body, JSON.stringify(payload || {})]
  );

  res.json({ status: 'ok', messageId: id });
});

module.exports = router;
