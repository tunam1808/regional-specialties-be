// routes/location.router.ts
import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// Đường dẫn đến file db.json
const DATA_PATH = path.join(__dirname, "../../data/db.json");
console.log("DATA_PATH =", DATA_PATH);
console.log("File tồn tại?", fs.existsSync(DATA_PATH));

let db: any = {};

// === 1. LOAD DB.JSON KHI SERVER KHỞI ĐỘNG ===
try {
  const file = fs.readFileSync(DATA_PATH, "utf-8");
  db = JSON.parse(file);
  console.log("✅ [BACKEND] DB JSON loaded successfully!");
  console.log(`📊 [BACKEND] Tổng tỉnh: ${db.province?.length || 0}`);
  console.log(`📊 [BACKEND] Tổng phường/xã: ${db.commune?.length || 0}`);
} catch (err: any) {
  console.error("❌ [BACKEND] Lỗi đọc db.json:", err.message);
  db = { province: [], commune: [] }; // ← Đảm bảo không crash
}

// === 2. GET /provinces → TRẢ MẢNG TRỰC TIẾP ===
router.get("/provinces", (req, res) => {
  console.log("🌟 [BACKEND] GET /api/location/provinces");

  // ✅ Luôn trả mảng, dù db.province là gì
  const provinces = Array.isArray(db.province) ? db.province : [];

  if (provinces.length === 0) {
    console.warn("⚠️ [BACKEND] db.json không có tỉnh nào!");
  } else {
    console.log(`✅ [BACKEND] Trả về ${provinces.length} tỉnh/thành`);
  }

  // ← CHỈ TRẢ MẢNG, KHÔNG TRẢ OBJECT
  res.json(provinces);
});

// === 3. GET /wards/:provinceId → TRẢ MẢNG TRỰC TIẾP ===
router.get("/wards/:provinceId", (req, res) => {
  const { provinceId } = req.params;
  console.log(`🌟 [BACKEND] GET /wards/${provinceId}`);

  // ✅ Lọc và trả mảng
  const wards = Array.isArray(db.commune)
    ? db.commune.filter((c: any) => c.idProvince === provinceId)
    : [];

  if (wards.length === 0) {
    console.warn(
      `⚠️ [BACKEND] Không tìm thấy phường/xã cho tỉnh: ${provinceId}`
    );
  } else {
    console.log(`✅ [BACKEND] Trả về ${wards.length} phường/xã`);
  }

  // ← CHỈ TRẢ MẢNG
  res.json(wards);
});

export default router;
