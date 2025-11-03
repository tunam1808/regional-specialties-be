import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();
dotenv.config();
console.log("🔍 Database config:");
console.log({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASS: process.env.DB_PASS ? "**** (đã có)" : "(rỗng)",
  DB_NAME: process.env.DB_NAME,
});

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Hàm test kết nối DB
export const testConnection = async () => {
  try {
    const conn = await db.getConnection();
    console.log("Kết nối MySQL thành công!");
    conn.release();
  } catch (error) {
    console.error("Lỗi kết nối MySQL:", error);
  }
};
