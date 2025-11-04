// 📁 src/routes/order.router.ts
import express from "express";
import { OrderController } from "../controllers/order.controller";
import { authMiddleware } from "../middlewares/authMiddleware"; // ← BẮT BUỘC

const router = express.Router();

// TẤT CẢ ROUTE ĐỀU YÊU CẦU ĐĂNG NHẬP
router.use(authMiddleware);

// XEM ĐƠN HÀNG (của mình)
router.get("/", OrderController.getAll);
router.get("/:id", OrderController.getById);

// GIỎ HÀNG
router.get("/cart", OrderController.getCart);
router.delete("/cart/product/:MaSP", OrderController.deleteFromCart);

// THANH TOÁN
router.post("/checkout", OrderController.checkout);

// CẬP NHẬT / XÓA (chỉ chủ đơn – đã kiểm tra trong controller)
router.put("/:id/status", OrderController.updateStatus);
router.delete("/:id", OrderController.delete);

export default router;
