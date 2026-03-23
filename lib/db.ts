import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.replace(/\?sslmode=require$/, "") ?? "";
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export default pool;
