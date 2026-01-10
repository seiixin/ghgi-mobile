// backend/src/utils/db.js
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const pool = mysql.createPool({
  host: env.db.host,
  port: Number(env.db.port || 3306),
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // helps avoid hanging forever
  connectTimeout: 10000,
});

const db = {
  async query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return { rows };
  },
  pool,
};

export default db;
export { pool };
