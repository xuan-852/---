/**
 * 结构化日志模块（基于 winston）
 *
 * 提供三种输出：
 *   1. 控制台 — 开发友好，带颜色
 *   2. 文件 all.log — 完整日志（轮转 14 天）
 *   3. 文件 error.log — 仅 error 级别（轮转 30 天）
 *
 * 替代 console.log / console.error，用法：
 *   const log = require('../utils/logger');
 *   log.info('启动成功');
 *   log.error('连接失败:', err);
 *   log.warn('配置缺失');
 *   log.debug('调试信息');
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

// 确保 logs 目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 自定义格式：时间戳 + 级别 + 消息（无 JSON 嵌套）
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const { timestamp, level, message, stack, ...rest } = info;
    const label = rest.label ? ` [${rest.label}]` : '';
    let msg = `${timestamp} [${level.toUpperCase()}]${label} ${message}`;
    if (stack) msg += `\n${stack}`;
    return { ...rest, message: msg };
  })(),
  winston.format.printf((info) => info.message),
);

// 控制台输出带颜色
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const { timestamp, level, message, stack, ...rest } = info;
    const label = rest.label ? ` [${rest.label}]` : '';
    let msg = `${timestamp} [${level}]${label} ${message}`;
    if (stack) msg += `\n${stack}`;
    return { ...rest, message: msg };
  })(),
  winston.format.printf((info) => info.message),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // 全量日志（最高保留 14 天）
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'all.log'),
      maxFiles: 14,
      maxsize: 10 * 1024 * 1024, // 10MB
      format: logFormat,
    }),
    // 仅 error 日志（保留 30 天）
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxFiles: 30,
      maxsize: 10 * 1024 * 1024,
      format: logFormat,
    }),
  ],
});

// 兼容 PM2 的 log_date_format 时间戳（PM2 的 stdout 行也有时间戳，两者不冲突）
// PM2 日志文件 → PM2 添加时间戳
// winston 日志文件 → winston 自带时间戳

module.exports = logger;
