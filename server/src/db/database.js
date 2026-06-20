const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const log = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'njust.db');

let db;

/**
 * sql.js 包装器 — 提供类似 better-sqlite3 的 API
 */
function wrapDB(sqlDb) {
  return {
    /** 执行 SELECT 返回所有行 */
    prepare(sql) {
      const stmt = sqlDb.prepare(sql);
      return {
        all(...params) {
          if (params.length > 0) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        get(...params) {
          if (params.length > 0) stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : null;
          stmt.free();
          return row;
        },
        run(...params) {
          if (params.length > 0) stmt.bind(params);
          stmt.step();
          stmt.free();
          return { changes: sqlDb.getRowsModified() };
        }
      };
    },
    /** 执行无参数 SQL（建表等） */
    exec(sql) { sqlDb.exec(sql); },
    /** 执行 INSERT/UPDATE（参数化） */
    run(sql, params = []) {
      sqlDb.run(sql, params);
      return { lastInsertRowid: 0, changes: sqlDb.getRowsModified() };
    }
  };
}

async function initDB() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // 如果已有数据库文件则加载
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  // 启用 WAL 模式（sql.js 在内存中运行，仅做标记）
  sqlDb.run('PRAGMA journal_mode=WAL');

  // 执行建表
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  sqlDb.exec(schema);

  db = wrapDB(sqlDb);

  // 定期保存到磁盘（每 30 秒）
  setInterval(() => {
    try {
      const data = sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      log.error('[DB] 保存失败:', e.message);
    }
  }, 30000);

  // 进程退出时保存
  process.on('exit', () => {
    try {
      const data = sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) { /* ignore */ }
  });

  log.info('[DB] 数据库初始化完成:', DB_PATH);
  return db;
}

function getDB() {
  if (!db) throw new Error('数据库未初始化，请先调用 initDB()');
  return db;
}

module.exports = { initDB, getDB };
