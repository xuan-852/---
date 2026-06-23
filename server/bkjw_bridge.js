/**
 * BKJW 持久化浏览器桥接服务
 * 
 * ===== 作用 =====
 * 持久运行一个 Edge 浏览器，保持教务系统登录会话，
 * 通过 HTTP API 提供成绩和课表数据（JSON）。
 * 
 * ===== 特性 =====
 * - Edge 浏览器启动时最小化到任务栏
 * - 首次需要手动登录一次，之后 session 自动恢复
 * - 不写数据库，只提供 JSON（防止 sql.js 文件锁冲突）
 * - 会话过期时自动尝试重登（Plan A）
 * - 每 30 分钟检查一次登录状态
 * 
 * ===== 启动方式 =====
 *   node bkjw_bridge.js
 * 
 * ===== API =====
 *   GET  /status     → { browserConnected, isLoggedIn, pageUrl }
 *   POST /refresh    → 刷新成绩+课表，返回 JSON
 *   POST /relogin    → 强制触发自动重登
 *   GET  /scores     → 返回最新成绩数组
 *   GET  /schedule   → 返回最新课表对象
 *   POST /goto       → 导航到指定 URL { url: "..." }
 * 
 * ===== 安全 =====
 *   Token 在控制台输出，所有请求需携带 x-bridge-token 头
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { chromium } = require('playwright');
const express = require('express');
const path = require('path');
const fs = require('fs');
const log = require('./src/utils/logger');

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

// ===== 自动重登配置 =====
const MAIN_SERVER = process.env.BRIDGE_MAIN_URL || 'http://localhost:3000';
const BRIDGE_CRED_TOKEN = process.env.BRIDGE_CRED_TOKEN || '';  // 用于向主服务器请求凭据
const EHALL_URL = 'http://ehall.njust.edu.cn';
const BKJW_BASE = 'http://bkjw.njust.edu.cn/njlgdx';
let loginAttemptState = { busy: false, lastAttempt: 0 };
const LOGIN_COOLDOWN_MS = 60000;  // 重登冷却 60s

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

app.post('/eval', checkAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '缺少 code' });
  try {
    const result = await page.evaluate(code);
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
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
    // 如果未登录，先尝试自动重登
    if (!isLoggedIn) {
      log.info('[bridge] ⚡ 检测到未登录，尝试自动重登...');
      const relogged = await autoRelogin();
      if (!relogged) {
        return res.status(401).json({
          ok: false,
          error: '❌ 自动重登失败（可能需验证码），请手动登录 http://ehall.njust.edu.cn',
          needsManual: true,
        });
      }
    }
    const result = await refreshData();
    res.json({ ok: true, ...result });
  } catch (e) {
    const needsManual = e.message && e.message.includes('自动重登失败');
    res.status(500).json({ ok: false, error: e.message, needsManual });
  }
});

// 强制触发自动重登（Plan A 手动入口）
app.post('/relogin', checkAuth, async (req, res) => {
  try {
    const ok = await autoRelogin();
    res.json({ ok, isLoggedIn, message: ok ? '✅ 自动重登成功' : '❌ 自动重登失败' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== 浏览器管理 =====

let _browserCrashed = false;  // 崩溃标记——防止不断重启循环

async function startBrowser() {
  log.info('[bridge] 🚀 启动 Edge 持久化浏览器...');
  log.info(`[bridge]    用户数据: ${USER_DATA_DIR}`);

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

    // 监听新标签页（eHall2 可能在新标签打开教务系统）
    context.on('page', async (newPage) => {
      log.info(`[bridge] 📄 新标签页: ${newPage.url()}`);
      newPage.on('load', () => {
        const url = newPage.url();
        log.info(`[bridge] 📄 标签页加载: ${url}`);
        if (url.includes('bkjw.njust.edu.cn')) {
          log.info('[bridge] 🎯 切换到教务系统标签页');
          page = newPage;
        }
      });
      // 新标签页也可能还没开始导航，等待一下
      try {
        await newPage.waitForURL('**bkjw.njust.edu.cn**', { timeout: 5000 });
        log.info('[bridge] 🎯 新标签页导航到 BKJW');
        page = newPage;
      } catch (_) { /* 不是 BKJW 标签页 */ }
    });

    // 监听浏览器崩溃——自动恢复
    context.on('crash', () => {
      log.error('[bridge] 💥 浏览器进程崩溃！');
      _browserCrashed = true;
      isLoggedIn = false;
      scheduleBrowserRestart();
    });

    // 监听页面崩溃
    page.on('crash', () => {
      log.error('[bridge] 💥 页面崩溃！');
      _browserCrashed = true;
      isLoggedIn = false;
      scheduleBrowserRestart();
    });

    // 监听 context 关闭——自动恢复
    context.on('close', () => {
      if (!_browserCrashed) {
        log.warn('[bridge] 🔒 浏览器 context 被关闭，自动重启...');
        _browserCrashed = true;
        isLoggedIn = false;
        scheduleBrowserRestart();
      }
    });

    _browserCrashed = false;
    log.info('[bridge] ✅ 浏览器已就绪');
    return true;
  } catch (e) {
    log.error('[bridge] ❌ 浏览器启动失败:', e.message);
    log.warn('[bridge] 提示: 如果报错 channel msedge not found，运行:');
    log.warn('[bridge]   npx playwright install msedge');
    return false;
  }
}

/** 浏览器崩溃后自动重启（带冷却） */
let _restartTimer = null;
function scheduleBrowserRestart() {
  if (_restartTimer) return;  // 已有重启计划
  const delay = 10000;  // 10s 后重启
  log.info(`[bridge] 🔄 ${delay/1000}s 后自动重启浏览器...`);
  _restartTimer = setTimeout(async () => {
    _restartTimer = null;
    try {
      context = null;
      page = null;
      const ok = await startBrowser();
      if (ok) {
        log.info('[bridge] ✅ 浏览器已重启');
        // 尝试恢复登录
        const logged = await checkLogin();
        isLoggedIn = logged;
        if (!logged && BRIDGE_CRED_TOKEN) {
          log.info('[bridge] 🔑 重启后未登录，自动重登...');
          await autoRelogin();
        }
      } else {
        log.error('[bridge] ❌ 浏览器重启失败，30s 后重试');
        _restartTimer = setTimeout(() => { _restartTimer = null; scheduleBrowserRestart(); }, 30000);
      }
    } catch (e) {
      log.error('[bridge] ❌ 浏览器重启异常:', e.message);
      _restartTimer = setTimeout(() => { _restartTimer = null; scheduleBrowserRestart(); }, 30000);
    }
  }, delay);
}

async function checkLogin() {
  if (!page) return false;
  try {
    // 先看当前页面是否已经是 BKJW 且已登录
    let curUrl = page.url();
    if (curUrl.includes('bkjw.njust.edu.cn') || curUrl.includes('202.119.81')) {
      const body = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (!body.includes('登录个人中心') && body.length > 100) {
        isLoggedIn = true;
        return true;
      }
    }
    // 导航到成绩页检查
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

// ===== Plan A: 自动重登 =====

/**
 * 从主服务器获取加密存储的教务凭据
 */
async function fetchCredentials() {
  if (!BRIDGE_CRED_TOKEN) {
    throw new Error('BRIDGE_CRED_TOKEN 未配置，无法自动重登');
  }
  const axios = require('axios');
  const res = await axios.get(`${MAIN_SERVER}/api/bridge-cred`, {
    headers: { 'x-bridge-cred-token': BRIDGE_CRED_TOKEN },
    timeout: 10000,
  });
  if (res.data?.status !== 'ok' || !res.data?.data) {
    throw new Error('主服务器无可用凭据: ' + (res.data?.message || 'unknown'));
  }
  return res.data.data;  // { username, password }
}

/**
 * 自动重登 eHall2 SPA → IDS → BKJW
 * 
 * 流程:
 *   1. 获取凭据（从主服务器）
 *   2. 导航到 eHall2 SPA（Vue.js 门户）
 *   3. 若未登录 → IDS 填表
 *   4. 关闭弹窗遮挡
 *   5. 在 iframe 中找到「教务系统（师生端）」并点击
 *   6. eHall2 将主窗口导航到 BKJW（或打开新标签页）
 *   7. 验证登录
 * 
 * 注意: BKJW 的 CAS 直连 SSO 有服务器端问题（ticket 不处理），
 *       必须通过 eHall2 门户的 SPA 应用入口才能正确触发 SSO。
 *       这是 Plan C 已验证成功的路径。
 */
async function autoRelogin() {
  // 冷却检查——防止频繁触发
  const now = Date.now();
  if (loginAttemptState.busy) {
    log.warn('[bridge] ⏳ 自动重登正在进行中，跳过');
    return false;
  }
  if (now - loginAttemptState.lastAttempt < LOGIN_COOLDOWN_MS) {
    log.warn(`[bridge] ⏳ 距上次重登不足 ${LOGIN_COOLDOWN_MS/1000}s，跳过`);
    return false;
  }
  if (!page) return false;

  loginAttemptState.busy = true;
  loginAttemptState.lastAttempt = now;

  log.info('[bridge] 🔑 Plan A: 开始自动重登（eHall2 SPA 路径）...');

  try {
    // Step 1: 获取凭据
    const cred = await fetchCredentials();
    log.info(`[bridge]   凭据获取成功: ${cred.username}`);
    log.info(`[bridge]   密码长度: ${cred.password.length}`);

    // Step 2: 清除老的 BKJW cookie（强制获取新 session）
    log.info('[bridge]   清除 BKJW cookie...');
    await context.clearCookies({ domain: '.bkjw.njust.edu.cn' });

    // Step 3: 导航到 eHall2 SPA
    log.info('[bridge]   导航到 eHall2 SPA...');
    await page.goto('https://ehall2.njust.edu.cn/index.html', {
      waitUntil: 'domcontentloaded', timeout: 15000,
    });
    await page.waitForTimeout(3000);
    log.info(`[bridge]   eHall2: ${page.url()}`);

    // Step 4: 检查是否已登录 eHall
    let pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (page.url().includes('ids.njust.edu.cn') &&
        (pageText.includes('统一身份认证') || pageText.includes('密码'))) {
      log.info('[bridge]   检测到 IDS 登录页，填写凭据提交...');
      await autoFillIDS(cred.username, cred.password);

      // 等待 IDS 认证完成，重定向回 eHall2
      log.info('[bridge]   ⏳ 等待 IDS 认证完成...');
      await page.waitForTimeout(5000);

      // 检查是否要求验证码
      pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (page.url().includes('ids.njust.edu.cn')) {
        const hasCaptcha = await page.evaluate(() => {
          return !!document.querySelector('#captcha, .captcha-img, img[src*="captcha"]');
        });
        if (hasCaptcha) {
          log.warn('[bridge]   ⚠️ IDS 需要验证码，自动重登失败');
          isLoggedIn = false;
          return false;
        }
        log.warn('[bridge]   ⚠️ IDS 认证未完成（仍在 IDS 页面），重登失败');
        isLoggedIn = false;
        return false;
      }
    }

    // 现在应该在 eHall2 上了
    if (!page.url().includes('ehall2.njust.edu.cn')) {
      log.info('[bridge]   确保在 eHall2 SPA...');
      await page.goto('https://ehall2.njust.edu.cn/index.html', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      });
      await page.waitForTimeout(2000);
    }

    // Step 5: 关闭弹窗遮挡（如果存在）
    log.info('[bridge]   关闭弹窗遮挡...');
    await page.evaluate(() => {
      document.querySelectorAll('.we-dialog__wrapper, .v-modal, .el-dialog__wrapper').forEach(d => d.remove());
    });

    // Step 6: 导航到搜索页面，确保显示服务列表
    log.info('[bridge]   导航到 eHall2 搜索页...');
    await page.goto('https://ehall2.njust.edu.cn/index.html#/searchPage', {
      waitUntil: 'domcontentloaded', timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Step 7: 在 iframe 中找到并点击「教务系统（师生端）」
    log.info('[bridge]   在 iframe 中查找「教务系统（师生端）」...');
    await page.evaluate(() => {
      // 再次关闭弹窗
      document.querySelectorAll('.we-dialog__wrapper, .v-modal, .el-dialog__wrapper').forEach(d => d.remove());
    });

    const clickResult = await page.evaluate(() => {
      const f = document.getElementById('template-container');
      if (!f) throw new Error('找不到 template-container iframe');
      const doc = f.contentDocument || f.contentWindow.document;
      if (!doc) throw new Error('无法访问 iframe 内容');

      // 遍历所有可见元素，找教务系统（师生端）
      const all = doc.querySelectorAll('*');
      for (const el of all) {
        const text = (el.textContent || '').trim();
        if (text === '教务系统（师生端）' && el.offsetWidth > 0 && el.offsetHeight > 0) {
          el.click();
          return '已点击';
        }
      }
      throw new Error('找不到「教务系统（师生端）」元素');
    });
    log.info(`[bridge]   点击结果: ${clickResult}`);

    // Step 8: 等待 BKJW 页面加载
    // 点击后，eHall2 SPA 会将当前页面导航到 BKJW，或打开新标签页
    log.info('[bridge]   ⏳ 等待 BKJW 页面（最长 30s）...');
    let bkjwFound = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const curUrl = page.url();
      if (curUrl.includes('bkjw.njust.edu.cn')) {
        log.info(`[bridge]   📄 主页面已到 BKJW: ${curUrl}`);
        bkjwFound = true;
        break;
      }
      // 检查是否打开新标签页
      const allP = context.pages();
      for (const p of allP) {
        const u = p.url();
        if (u.includes('bkjw.njust.edu.cn') && p !== page) {
          log.info(`[bridge]   🎯 新标签页已到 BKJW: ${u}`);
          page = p;
          bkjwFound = true;
          break;
        }
      }
      if (bkjwFound) break;
      if (i % 5 === 4) {
        log.info(`[bridge]   ⏳ ${i+1}s: ${curUrl.substring(0, 80)}`);
      }
    }

    if (!bkjwFound) {
      log.warn('[bridge]   ⚠️ 超时未到 BKJW，尝试检查当前页...');
    }

    // Step 9: 验证 BKJW 登录状态
    await page.waitForTimeout(2000);
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const currentUrl = page.url();
    const onBkjw = currentUrl.includes('bkjw.njust.edu.cn') || currentUrl.includes('202.119.81');
    const notOnLoginPage = !bodyText.includes('登录个人中心');

    if (onBkjw && notOnLoginPage) {
      isLoggedIn = true;
      log.info(`[bridge]   ✅ BKJW 登录成功: ${currentUrl}`);
    } else {
      isLoggedIn = false;
      log.warn(`[bridge]   ❌ BKJW 登录验证失败: ${currentUrl.substring(0, 120)}`);
    }

    // 登录成功后导航到成绩页验证 JSESSIONID 有效性
    if (isLoggedIn) {
      log.info('[bridge]   📍 验证成绩页访问...');
      await page.goto('http://bkjw.njust.edu.cn/njlgdx/kscj/cjcx_list', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      }).catch(() => {});
      await page.waitForTimeout(2000);
      const afterNav = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (afterNav.includes('登录个人中心')) {
        log.warn('[bridge]   ⚠️ 成绩页仍显示本地登录，JSESSIONID 无效');
        isLoggedIn = false;
      } else {
        log.info('[bridge]   ✅ 成绩页访问正常');
      }
    }

    return isLoggedIn;

  } catch (e) {
    log.error(`[bridge] ❌ 自动重登失败: ${e.message}`);
    return false;
  } finally {
    loginAttemptState.busy = false;
  }
}

/**
 * 填写 IDS 统一认证登录表单
 */
async function autoFillIDS(username, password) {
  // 等待表单加载
  await page.waitForSelector('#pwdFromId, form[action*="login"], #loginForm, .login-form', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 检查是否有验证码
  const hasCaptcha = await page.evaluate(() => {
    return !!document.querySelector('#captcha, .captcha-img, .captcha, img[src*="captcha"]');
  });
  if (hasCaptcha) {
    log.warn('[bridge]   ⚠️ IDS 需要验证码，自动填表可能失败！');
  }

  // 填写用户名
  const usernameInput = await page.$('#username, input[name="username"], input[type="text"]');
  if (!usernameInput) throw new Error('找不到用户名输入框');
  await usernameInput.fill('');
  await usernameInput.fill(username);

  // 填写密码
  const passwordInput = await page.$('#password, input[name="password"], input[type="password"]');
  if (!passwordInput) throw new Error('找不到密码输入框');
  await passwordInput.fill('');
  await passwordInput.fill(password);

  await page.waitForTimeout(500);

  // 提交
  const submitBtn = await page.$('#submitBtn, button[type="submit"], .login-btn, input[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // 回车提交
    await page.keyboard.press('Enter');
  }

  // 等待跳转 — 等待页面离开 IDS 域名（CAS 重定向到 BKJW）
  log.info('[bridge]   ⏳ 等待 IDS 重定向（最长 20s）...');
  try {
    await page.waitForFunction(
      () => !window.location.href.includes('ids.njust.edu.cn'),
      { timeout: 20000, polling: 500 }
    );
    log.info(`[bridge]   登录后 URL: ${page.url()}`);
    log.info('[bridge]   ✅ IDS 登录成功，已跳离 IDS');
  } catch (e) {
    // 超时 — 仍然在 IDS
    const errText = await page.evaluate(() => {
      const tip = document.querySelector('#showErrorTip, .error-tip, #msg, .authError');
      return tip ? tip.textContent : '';
    });
    if (errText) {
      log.warn(`[bridge]   ⚠️ IDS 登录失败: ${errText}`);
      throw new Error(`IDS 登录失败: ${errText}`);
    }
    log.warn('[bridge]   ⚠️ IDS 登录后仍停在登录页（可能验证码错误）');
    throw new Error('IDS 登录超时，可能需要验证码');
  }
}

// ===== 数据抓取 =====

let _refreshing = false;          // 刷新锁——防重叠
const _REFRESH_COOLDOWN_MS = 10000; // 冷却期 10s

async function refreshData() {
  if (_refreshing) {
    log.warn('[bridge] ⏳ 已有刷新进行中，跳过重叠请求');
    return { scoresCount: cachedData.scores.length, scheduleCount: Object.keys(cachedData.schedule).length, examsCount: cachedData.exams.length, source: 'cached' };
  }
  _refreshing = true;

  if (!isLoggedIn) {
    const ok = await checkLogin();
    if (!ok) {
      // 尝试自动重登
      log.info('[bridge] ⚡ checkLogin 失败，尝试 Plan A 自动重登...');
      const relogged = await autoRelogin();
      if (!relogged) {
        _refreshing = false;
        throw new Error('❌ 未登录教务系统。自动重登失败，请在 Edge 浏览器中手动登录:\n   http://ehall.njust.edu.cn');
      }
    }
  }

  log.info('[bridge] 🔄 刷新数据...');

  try {
    const scores = await fetchScores();
    const schedule = await fetchSchedule();
    const exams = await fetchExams();

    cachedData = { scores, schedule, exams, fetchedAt: new Date().toISOString() };

    log.info(`[bridge] ✅ 完成: ${scores.length} 条成绩, ${Object.keys(schedule).length} 项课表, ${exams.length} 门考试`);
    return { scoresCount: scores.length, scheduleCount: Object.keys(schedule).length, examsCount: exams.length };
  } finally {
    // 冷却期——防止密集请求仍能交替越过锁
    setTimeout(() => { _refreshing = false; }, _REFRESH_COOLDOWN_MS);
  }
}

async function fetchExams() {
  log.info('[bridge]   📝 抓取考试安排...');
  
  // Step 1: Navigate to the query page first
  await page.goto('http://bkjw.njust.edu.cn/njlgdx/xsks/xsksap_query?Ves632DSdyV=NEW_XSD_KSBM', {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(2000);
  
  // Step 2: Click the query button (default semester is already current one)
  const btnExists = await page.evaluate(() => {
    const btn = document.querySelector('#btn_query');
    if (btn) { btn.click(); return true; }
    return false;
  });
  
  if (!btnExists) {
    log.warn('[bridge]   ⚠️ 未找到查询按钮，尝试直接访问列表页...');
    await page.goto('http://bkjw.njust.edu.cn/njlgdx/xsks/xsksap_list', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
  }
  
  // Step 3: Wait for results page to load
  await page.waitForTimeout(3000);

  // Step 4: Extract exam data from the table
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
      // 列: 序号 | 考试场次 | 课程编号 | 课程名称 | 考试时间 | 考场 | 座位号
      if (c.length >= 7) {
        const timeStr = c[4]?.innerText?.trim() || '';
        // 解析 "2026-06-22 13:30~15:30"
        let examDate = '', startTime = '', endTime = '';
        const timeMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})~(\d{2}:\d{2})/);
        if (timeMatch) {
          examDate = timeMatch[1];
          startTime = timeMatch[2];
          endTime = timeMatch[3];
        } else {
          examDate = timeStr; // fallback: whole string as date
        }
        data.push({
          courseName: c[3]?.innerText?.trim() || '',
          examDate: examDate,
          startTime: startTime,
          endTime: endTime,
          location: c[5]?.innerText?.trim() || '',
          seatNo: c[6]?.innerText?.trim() || '',
          examType: c[1]?.innerText?.trim() || '',  // 考试场次
          semester: '2025-2026-2',
        });
      }
    });
    return data;
  });
}

async function fetchScores() {
  log.info('[bridge]   📊 抓取成绩...');
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
  log.info('[bridge]   📅 抓取课表...');
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

/** 进程级崩溃保护——捕获未处理异常，防止进程退出 */
function installCrashGuard() {
  process.on('uncaughtException', (err) => {
    log.error(`[bridge] 💥 未捕获异常: ${err.message}`);
    log.error(err.stack);
    // 尝试重启浏览器
    if (context) {
      try { context.close().catch(() => {}); } catch(_) {}
      context = null;
      page = null;
    }
    scheduleBrowserRestart();
  });

  process.on('unhandledRejection', (reason) => {
    log.error(`[bridge] 💥 未处理 Promise 拒绝: ${reason?.message || reason}`);
    // 不主动退出，仅记录
  });
}

/** 进程级看门狗——浏览器崩溃后 5 分钟未恢复，退出进程（PM2 会自动重启） */
let _restartWatchdog = null;
function kickWatchdog() {
  if (_restartWatchdog) return;
  _restartWatchdog = setInterval(() => {
    if (_browserCrashed && !context) {
      log.error('[bridge] 💀 浏览器崩溃后 5 分钟未恢复，退出进程');
      process.exit(1);
    }
  }, 5 * 60 * 1000);
}

async function main() {
  log.info('╔══════════════════════════════════════════════╗');
  log.info('║   BKJW 持久化浏览器桥接服务 v1              ║');
  log.info('╚══════════════════════════════════════════════╝');
  log.info(`  Token: ${AUTH_TOKEN}`);
  log.info(`  API:   http://localhost:${PORT}`);

  installCrashGuard();
  kickWatchdog();

  app.listen(PORT);

  await startBridge();
}

/** Bridge 主逻辑——拆出以便崩溃后重启能重入 */
async function startBridge() {
  const started = await startBrowser();
  if (!started) {
    log.warn('[bridge] ⏳ 浏览器启动失败，10s 后重试...');
    setTimeout(startBridge, 10000);
    return;
  }

  const loggedIn = await checkLogin();
  if (loggedIn) {
    log.info('[bridge] ✅ 已登录，自动抓取数据...');
    try { await refreshData(); } catch (e) { log.warn('[bridge] ⚠️', e.message); }
  } else if (BRIDGE_CRED_TOKEN) {
    log.warn('[bridge] ⚡ 未登录，尝试 Plan A 自动重登...');
    const relogged = await autoRelogin();
    if (relogged) {
      log.info('[bridge] ✅ 自动重登成功，抓取数据...');
      try { await refreshData(); } catch (e) { log.warn('[bridge] ⚠️', e.message); }
    } else {
      log.warn('  ⚠️  自动重登失败，请手动登录 Edge 窗口:');
      log.warn('     1. 打开 https://ehall2.njust.edu.cn');
      log.warn('     2. SSO 登录 → 点击「教务系统（师生端）」');
      log.warn('     3. 确保看到成绩页面');
      log.warn(`     4. curl -X POST http://localhost:${PORT}/refresh -H "x-bridge-token: ${AUTH_TOKEN}"`);
    }
  } else {
    log.warn('  ⚠️  请手动登录 Edge 窗口:');
    log.warn('     1. 打开 https://ehall2.njust.edu.cn');
    log.warn('     2. SSO 登录 → 点击「教务系统（师生端）」');
    log.warn('     3. 确保看到成绩页面');
    log.warn(`     4. curl -X POST http://localhost:${PORT}/refresh -H "x-bridge-token: ${AUTH_TOKEN}"`);
  }

  // 心跳（每 5 分钟检查页面存活，页面死了自动切换）
  setInterval(async () => {
    try {
      if (!page && context) {
        const pages = context.pages();
        page = pages.length > 0 ? pages[0] : await context.newPage();
        return;
      }
      if (!page) return;
      const url = await page.evaluate(() => window.location.href).catch(() => null);
      if (!url) {
        const pages = context.pages();
        if (pages.length > 0) {
          page = pages[0];
        } else if (context) {
          page = await context.newPage();
        }
      }
    } catch (e) { /* ignore */ }
  }, 5 * 60 * 1000);

  // 登录保鲜（每 15 分钟检查一次登录状态，如掉线自动重登）
  setInterval(async () => {
    if (!page) return;
    try {
      const ok = await checkLogin();
      if (!ok && BRIDGE_CRED_TOKEN) {
        log.warn('[bridge] 🔄 登录会话已过期，自动尝试重登...');
        await autoRelogin();
      }
    } catch (e) {
      log.warn('[bridge] ⚠️ 登录保鲜检查失败:', e.message);
    }
  }, 15 * 60 * 1000);
}

main().catch(e => {
  log.error(`[bridge] 💥 main() 异常: ${e.message}`);
  log.error(e.stack);
  // 不死心，10s 后尝试重启
  setTimeout(startBridge, 10000);
});
