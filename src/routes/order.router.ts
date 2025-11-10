// src/routes/order.router.ts
import express from "express";
import { OrderController } from "../controllers/order.controller";
import { authMiddleware } from "../middlewares/authMiddleware";
import { verifyAdmin } from "../middlewares/verifyAdmin";

const router = express.Router();

router.use(authMiddleware);

// GIỎ HÀNG
router.get("/cart", OrderController.getCart);
router.delete("/cart/product/:MaSP", OrderController.deleteFromCart);

// THANH TOÁN
router.post("/checkout", OrderController.checkout);

// THANH TOÁN TRỰC TIẾP (MUA NGAY)
router.post("/direct", OrderController.checkoutDirectly);

// DANH SÁCH & CHI TIẾT ĐƠN HÀNG
router.get("/", OrderController.getAll); // đơn của chính mình (user hoặc admin)
router.get("/:id", OrderController.getById);

// CẬP NHẬT & XÓA ĐƠN HÀNG
router.put("/:id/status", OrderController.updateStatus);

router.delete("/:id", OrderController.delete);

export default router;
