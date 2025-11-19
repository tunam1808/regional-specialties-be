import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../database";
import { sendEmail } from "../email.service";

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email không được để trống!" });
    }

    // 1. Kiểm tra email tồn tại
    const [rows]: any = await db.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Email không tồn tại!" });
    }

    const user = rows[0];
    if (!user.id) {
      return res
        .status(400)
        .json({ success: false, message: "Người dùng không hợp lệ!" });
    }

    // 2. Tạo mật khẩu mới ngẫu nhiên (8 ký tự hex)
    const newPassword = crypto.randomBytes(4).toString("hex");
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3. Tạo token xác thực
    const token = crypto.randomBytes(16).toString("hex");
    const tokenHash = await bcrypt.hash(token, 10);
    const expireDate = new Date(Date.now() + 15 * 60 * 1000); // 15 phút từ bây giờ

    // 4. Cập nhật DB
    await db.execute(
      "UPDATE users SET password = ?, reset_token = ?, reset_expire = ? WHERE id = ?",
      [hashedPassword, tokenHash, expireDate, user.id]
    );

    // 5. Gửi email trực tiếp mật khẩu mới
    await sendEmail({
      to: email,
      subject: "Mật khẩu mới của bạn",
      html: `Mật khẩu mới của bạn là: <strong>${newPassword.toUpperCase()}</strong><br><br>
         Token xác thực: <code>${token}</code><br><br>
         Hãy đăng nhập ngay và đổi mật khẩu!<br>
         <a href="https://dacsanbamien.shop/login">Đăng nhập tại đây</a>`,
      replyTo: email,
    });

    return res.json({
      success: true,
      message: "Mật khẩu mới đã được gửi vào email của bạn!",
    });
  } catch (error) {
    console.error("Forgot password error:", error); // Chỉ log server
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
