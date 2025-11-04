// 📁 src/routes/order-detail.router.ts
import express from "express";
import { OrderDetailController } from "../controllers/order.detail.controller";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

// 🟢 Tất cả route đều yêu cầu đăng nhập
router.use(authMiddleware);

// Thêm vào giỏ
router.post("/add", OrderDetailController.addToCart);

// Lấy giỏ hàng của chính mình
router.get("/me", OrderDetailController.getCart);

// Xóa sản phẩm
router.delete("/product/:MaSP", OrderDetailController.deleteFromCart);

export default router;
