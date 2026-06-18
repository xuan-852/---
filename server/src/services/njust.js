const axios = require('axios');

/**
 * 南理工教务系统对接
 * 
 * 当前为预留接口，后续实现：
 * 1. 统一身份认证登录 (CAS)
 * 2. 获取课表数据
 * 3. 获取成绩数据
 * 
 * 教务系统地址: https://jwxt.njust.edu.cn
 * 统一认证: https://cas.njust.edu.cn
 */

const BASE_URL = 'https://jwxt.njust.edu.cn';

/**
 * 登录教务系统
 * @param {string} username 学号
 * @param {string} password 密码
 * @returns {Promise<string>} Cookie
 */
async function login(username, password) {
  // TODO: 实现南理工 CAS 统一身份认证登录流程
  // 1. 获取登录页面 → 提取 execution 等参数
  // 2. POST 提交用户名/密码
  // 3. 获取 Cookie / Session
  throw new Error('未实现: 教务系统登录');
}

/**
 * 获取课表
 * @param {string} cookie 登录后的 Cookie
 * @param {number} week 周次
 * @returns {Promise<Array>} 课程列表
 */
async function fetchSchedule(cookie, week) {
  // TODO: 获取课表数据并解析
  throw new Error('未实现: 课表抓取');
}

/**
 * 获取成绩
 * @param {string} cookie 登录后的 Cookie
 * @returns {Promise<Array>} 成绩列表
 */
async function fetchScores(cookie) {
  // TODO: 获取成绩数据并解析
  throw new Error('未实现: 成绩抓取');
}

/**
 * 解析课表 HTML → 结构化数据
 */
function parseScheduleHTML(html) {
  // TODO: 用 cheerio 解析课表表格
  throw new Error('未实现: HTML 解析');
}

module.exports = { login, fetchSchedule, fetchScores };
