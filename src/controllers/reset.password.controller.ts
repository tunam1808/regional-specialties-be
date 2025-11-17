import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { db } from "../database";

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, tempPassword, newPassword, confirmPassword } = req.body;

    if (!email || !tempPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin!",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu xác nhận không khớp!",
      });
    }

    const [rows]: any = await db.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Email không tồn tại!",
      });
    }

    const user = rows[0];

    // So sánh mật khẩu tạm thời với password hiện tại
    const isTempPassValid = await bcrypt.compare(tempPassword, user.password);
    if (!isTempPassValid) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tạm thời không hợp lệ!",
      });
    }

    const now = new Date();
    const expire = new Date(user.reset_expire);
    if (expire < now) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tạm thời đã hết hạn!",
      });
    }

    const hashedPass = await bcrypt.hash(newPassword, 10);

    await db.execute(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expire = NULL WHERE id = ?",
      [hashedPass, user.id]
    );

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công!",
    });
  } catch (error) {
    console.error("⚠️ Reset password server error");
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
