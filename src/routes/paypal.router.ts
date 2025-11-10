// src/routes/paypal.routes.ts
import express from "express";
import {
  createPayment,
  paypalSuccess,
  paypalCancel,
  paypalWebhook,
  checkOrderStatus,
} from "../controllers/paypal.controller"; // Đổi tên file controller nếu cần
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

// Áp dụng auth cho tất cả route (trừ webhook và return/cancel từ PayPal)

// ==================== TẠO THANH TOÁN PAYPAL ====================
router.post("/create", authMiddleware, createPayment);

// ==================== KIỂM TRA TRẠNG THÁI ĐƠN HÀNG ====================
router.get("/status", authMiddleware, checkOrderStatus);

// ==================== RETURN URL TỪ PAYPAL (không cần auth) ====================
// PayPal redirect user về đây sau khi login/thanh toán → không có JWT
router.get("/success", paypalSuccess);
router.get("/cancel", paypalCancel);

// ==================== WEBHOOK TỪ PAYPAL (không cần auth) ====================
// PayPal gọi server-to-server → không có token → phải bỏ auth + raw body
router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // quan trọng: để verify signature sau (nếu cần)
  paypalWebhook
);

// Optional: Route test nhanh (dev only)
if (process.env.NODE_ENV === "development") {
  router.get("/test", (req, res) => {
    res.json({ message: "PayPal route đang chạy ngon! 🚀" });
  });
}

export default router;
