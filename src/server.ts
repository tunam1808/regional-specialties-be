import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.router";
import adminRoutes from "./routes/admin.router";
import uploadRoutes from "./routes/upload.router";
import feedbackRoutes from "./routes/feedback.router";
import orderRoutes from "./routes/order.router";
import orderDetailRoutes from "./routes/order.detail.router";
import uploadImgproductRouter from "./routes/upload.imgproduct.router";
import { uploadAvatarRouter } from "./routes/upload.avatar.router";

import path from "path";
import fs from "fs"; // Thêm fs để kiểm tra/thêm thư mục
import { testConnection } from "./database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Cấu hình CORS cho các frontend port khác nhau
// app.use(
//   cors({
//     origin: (origin, callback) => {
//       const allowedOrigins = [
//         "http://localhost:5003",
//         "http://localhost:5002",
//         "http://localhost:5000",
//         "http://localhost:5001",
//         "https://regional-specialties-fe.up.railway.app",
//         "https://regional-specialties.vercel.app",
//       ];
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

app.use(
  cors({
    origin: "*", // cho tất cả domain
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware log chỉ API, bỏ qua static files
app.use((req, res, next) => {
  // Nếu request tới static files thì bỏ qua log
  if (
    req.url.startsWith("/uploads") ||
    req.url.startsWith("/public") ||
    req.url.startsWith("/avatars")
  ) {
    return next();
  }

  console.log("👉 Request nhận được:", req.method, req.url);
  next();
});

app.use(
  "/api/auth",
  (req, res, next) => {
    console.log("🔥 Vào được /api/auth:", req.method, req.originalUrl);
    next();
  },
  authRoutes
);

app.use(
  "/api/sanpham",
  (req, res, next) => {
    console.log("🔥 Vào được /api/sanpham:", req.method, req.originalUrl);
    console.log("👉 Headers:", req.headers);
    next();
  },
  productRoutes
);

app.use("/api/orders", orderRoutes);

app.use("/api/order-detail", orderDetailRoutes);

app.use(
  "/api/admin",
  (req, res, next) => {
    console.log("🔥 Vào được /api/admin:", req.method, req.originalUrl);
    next();
  },
  adminRoutes
);

// app.use(
//   "/api/upload",
//   (req, res, next) => {
//     console.log("🔥 Vào được /api/upload:", req.method, req.originalUrl);
//     next();
//   },
//   uploadRoutes
// );

// Cho phép client truy cập ảnh đã upload (tĩnh)

console.log("🧩 uploadImgproductRouter =", uploadImgproductRouter);
app.use(
  "/api/imgproduct",
  (req, res, next) => {
    console.log("🔥 Vào được /api/imgproduct:", req.method, req.originalUrl);
    next();
  },
  uploadImgproductRouter
);

console.log("🧩 uploadAvatarRouter =", uploadAvatarRouter);
app.use(
  "/api/upload",
  (req, res, next) => {
    console.log("🔥 Vào được /api/upload:", req.method, req.originalUrl);
    next();
  },
  uploadAvatarRouter
);
app.use("/avatars", express.static(path.join(__dirname, "../public/avatars")));

app.use(
  "/api/feedback",
  (req, res, next) => {
    console.log("🔥 Vào được /api/feedback:", req.method, req.originalUrl);
    next();
  },
  feedbackRoutes
);

// Cập nhật static serving
const uploadPath = path.join(__dirname, "../upload");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log("Đã tạo thư mục upload tại:", uploadPath); // Debug
}
app.use("/uploads", express.static(uploadPath)); // Trỏ đến upload cùng cấp với src

const avatarPath = path.join(__dirname, "../public");
if (!fs.existsSync(avatarPath)) {
  fs.mkdirSync(avatarPath, { recursive: true });
  console.log("📂 Đã tạo thư mục public:", avatarPath);
}
app.use("/public", express.static(avatarPath)); // Cho phép truy cập ảnh avatar

testConnection();

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
