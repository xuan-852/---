const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'njust.db');

let db;

function initDB() {
  // 确保 data 目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // 执行建表
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  console.log('[DB] 数据库初始化完成:', DB_PATH);
  return db;
}

function getDB() {
  if (!db) throw new Error('数据库未初始化，请先调用 initDB()');
  return db;
}

module.exports = { initDB, getDB };
