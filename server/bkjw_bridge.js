/**
 * BKJW 持久化浏览器桥接服务
 * 
 * ===== 作用 =====
 * 持久运行一个 Edge 浏览器，保持教务系统登录会话，
 * 通过 HTTP API 提供成绩和课表数据（JSON）。
 * 
 * ===== 特点 =====
 * - Edge 浏览器启动时最小化到任务栏
 * - 首次需要手动登录一次，之后 session 自动恢复
 * - 不写数据库，只提供 JSON（防止 sql.js 文件锁冲突）
 * - 每 30 分钟检查一次登录状态
 * 
 * ===== 启动方式 =====
 *   node bkjw_bridge.js
 * 
 * ===== API =====
 *   GET  /status     → { browserConnected, isLoggedIn, pageUrl }
 *   POST /refresh    → 刷新成绩+课表，返回 JSON
 *   GET  /scores     → 返回最新成绩数组
 *   GET  /schedule   → 返回最新课表对象
 *   POST /goto       → 导航到指定 URL { url: "..." }
 * 
 * ===== 安全 =====
 *   Token 在控制台输出，所有请求需携带 x-bridge-token 头
 */

const { chromium } = require('playwright');
const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = 3456;
const TOKEN_FILE = path.join(__dirname, 'bridge.token');

// 读取或生成持久化 Token（重启不丢失）
function getToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }
  } catch (e) { /* ignore */ }
  const token = 'bkjw-bridge-' + require('crypto').randomBytes(6).toString('hex');
  try { fs.writeFileSync(TOKEN_FILE, token, 'utf8'); } catch (e) { /* ignore */ }
  return token;
}

const AUTH_TOKEN = getToken();
const USER_DATA_DIR = path.join(__dirname, '..', '.bkjw-profile');

// ===== 状态 =====
let context = null;
let page = null;
let isLoggedIn = false;
let cachedData = { scores: [], schedule: {}, exams: [], fetchedAt: null };

// ===== Express API =====
const app = express();
app.use(express.json());

function checkAuth(req, res, next) {
  const token = req.headers['x-bridge-token'];
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: '未授权' });
  next();
}

app.get('/status', checkAuth, async (req, res) => {
  let url = null;
  try { if (page) url = page.url(); } catch (e) {}
  res.json({
    ok: true,
    browserConnected: !!context,
    isLoggedIn,
    pageUrl: url,
    scoresCount: cachedData.scores.length,
    examsCount: cachedData.exams.length,
    fetchedAt: cachedData.fetchedAt,
  });
});

app.get('/scores', checkAuth, (req, res) => {
  res.json({ ok: true, data: cachedData.scores });
});

app.get('/schedule', checkAuth, (req, res) => {
  res.json({ ok: true, data: cachedData.schedule });
});

app.get('/exams', checkAuth, (req, res) => {
  res.json({ ok: true, data: cachedData.exams });
});

app.post('/goto', checkAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '缺少 url' });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    res.json({ ok: true, url: page.url() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/refresh', checkAuth, async (req, res) => {
  try {
    const result = await refreshData();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== 浏览器管理 =====

async function startBrowser() {
  console.log('[bridge] 🚀 启动 Edge 持久化浏览器...');
  console.log(`[bridge]    用户数据: ${USER_DATA_DIR}`);

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  try {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      channel: 'msedge',
      headless: false,
      viewport: null,
      locale: 'zh-CN',
      args: [
        '--start-minimized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    // 监听新标签页（eHall2 在新标签打开教务系统）
    context.on('page', async (newPage) => {
      console.log(`[bridge] 📄 新标签页: ${newPage.url()}`);
      newPage.on('load', () => {
        const url = newPage.url();
        console.log(`[bridge] 📄 标签页加载: ${url}`);
        if (url.includes('bkjw.njust.edu.cn')) {
          console.log('[bridge] 🎯 切换到教务系统标签页');
          page = newPage;
        }
      });
    });

    console.log('[bridge] ✅ 浏览器已就绪');
    return true;
  } catch (e) {
    console.error('[bridge] ❌ 浏览器启动失败:', e.message);
    console.log('[bridge] 提示: 如果报错 channel msedge not found，运行:');
    console.log('[bridge]   npx playwright install msedge');
    return false;
  }
}

async function checkLogin() {
  if (!page) return false;
  try {
    await page.goto('http://bkjw.njust.edu.cn/njlgdx/kscj/cjcx_list', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await page.waitForTimeout(2000);
    const body = await page.evaluate(() => document.body.innerText);
    isLoggedIn = !body.includes('登录个人中心');
    return isLoggedIn;
  } catch (e) {
    return false;
  }
}

// ===== 数据抓取 =====

async function refreshData() {
  if (!isLoggedIn) {
    const ok = await checkLogin();
    if (!ok) throw new Error('❌ 未登录教务系统。请在 Edge 浏览器中完成登录:\n   http://ehall.njust.edu.cn');
  }

  console.log('[bridge] 🔄 刷新数据...');

  const scores = await fetchScores();
  const schedule = await fetchSchedule();
  const exams = await fetchExams();

  cachedData = { scores, schedule, exams, fetchedAt: new Date().toISOString() };

  console.log(`[bridge] ✅ 完成: ${scores.length} 条成绩, ${Object.keys(schedule).length} 项课表, ${exams.length} 门考试`);
  return { scoresCount: scores.length, scheduleCount: Object.keys(schedule).length, examsCount: exams.length };
}

async function fetchExams() {
  console.log('[bridge]   📝 抓取考试安排...');
  await page.goto('http://bkjw.njust.edu.cn/njlgdx/kscj/ksap_list', {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let et = null;
    for (const t of tables) {
      const rows = t.querySelectorAll('tr');
      if (rows.length > 2 && rows[0]?.innerText.includes('课程') && rows[0]?.innerText.includes('考试')) {
        et = t; break;
      }
    }
    if (!et) return [];
    const data = [];
    et.querySelectorAll('tr').forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll('td');
      if (c.length >= 6) {
        data.push({
          courseName: c[0]?.innerText?.trim() || '',
          examDate: c[1]?.innerText?.trim() || '',
          startTime: c[2]?.innerText?.trim() || '',
          endTime: c[3]?.innerText?.trim() || '',
          location: c[4]?.innerText?.trim() || '',
          seatNo: c[5]?.innerText?.trim() || '',
        });
      }
    });
    return data;
  });
}

async function fetchScores() {
  console.log('[bridge]   📊 抓取成绩...');
  await page.goto('http://bkjw.njust.edu.cn/njlgdx/kscj/cjcx_list', {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let dt = null;
    for (const t of tables) {
      const r = t.querySelectorAll('tr');
      if (r.length > 3 && r[0]?.querySelectorAll('td,th').length >= 10) { dt = t; break; }
    }
    if (!dt) return [];
    const data = [];
    dt.querySelectorAll('tr').forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll('td');
      if (c.length >= 11) data.push({
        semester: c[1].innerText.trim(),
        courseCode: c[2].innerText.trim(),
        courseName: c[3].innerText.trim(),
        score: c[4].innerText.trim(),
        credit: parseFloat(c[6].innerText.trim()) || 0,
        hours: parseInt(c[7].innerText.trim()) || 0,
        examType: c[8].innerText.trim() || '',
        attribute: c[9].innerText.trim(),
        nature: c[10].innerText.trim(),
      });
    });
    return data;
  });
}

async function fetchSchedule() {
  console.log('[bridge]   📅 抓取课表...');
  await page.goto('http://bkjw.njust.edu.cn/njlgdx/xskb/xskb_list.do', {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let st = null;
    for (const t of tables) {
      if (t.innerText.includes('星期一') && t.innerText.includes('星期日')) { st = t; break; }
    }
    if (!st) return {};
    const rows = st.querySelectorAll('tr');
    const days = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
    const ps = ['第一大节','第二大节','第三大节','第四大节'];
    const data = {};
    rows.forEach((row, ri) => {
      if (ri === 0) return;
      const cells = row.querySelectorAll('td');
      const p = ps[ri - 1] || `第${ri}大节`;
      cells.forEach((cell, ci) => {
        const d = days[ci]; if (!d) return;
        const t = cell.innerText.trim();
        if (!t || t === '----------------------') return;
        const parts = t.split('----------------------').map(s => s.trim()).filter(Boolean);
        const entries = parts.map(part => {
          const m = part.match(/^(.+?)\s+(\d+(?:[-,]\d+)*\(周\))$/);
          return m ? { course: m[1].trim(), weeks: m[2] } : { course: part, weeks: '' };
        });
        if (entries.length) data[`${p}-${d}`] = entries;
      });
    });
    return data;
  });
}

// ===== 主循环 =====

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   BKJW 持久化浏览器桥接服务 v1              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Token: ${AUTH_TOKEN}`);
  console.log(`  API:   http://localhost:${PORT}`);
  console.log('');

  app.listen(PORT);

  const started = await startBrowser();
  if (!started) { process.exit(1); }

  const loggedIn = await checkLogin();
  if (loggedIn) {
    console.log('[bridge] ✅ 已登录，自动抓取数据...');
    try { await refreshData(); } catch (e) { console.log('[bridge] ⚠️', e.message); }
  } else {
    console.log('');
    console.log('  ⚠️  请在打开的 Edge 窗口中完成登录:');
    console.log('     1. 打开 http://ehall.njust.edu.cn');
    console.log('     2. SSO 登录 → 点击教务系统（师生端）');
    console.log('     3. 确保看到成绩页面');
    console.log(`     4. curl -X POST http://localhost:${PORT}/refresh -H "x-bridge-token: ${AUTH_TOKEN}"`);
    console.log('');
  }

  // 心跳（每 10 分钟检查页面存活）
  setInterval(async () => {
    if (!page) return;
    try {
      const url = await page.evaluate(() => window.location.href).catch(() => null);
      if (!url) {
        const pages = context.pages();
        page = pages.length > 0 ? pages[0] : await context.newPage();
      }
    } catch (e) { /* ignore */ }
  }, 10 * 60 * 1000);
}

main().catch(e => { console.error(e); process.exit(1); });
