import { Request, Response } from "express";
import { sendEmail } from "../email.service";

export const sendEmailController = async (req: Request, res: Response) => {
  try {
    const { to, subject, message, userEmail } = req.body;

    // Kiểm tra dữ liệu bắt buộc
    if (!to || !subject || !message || !userEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu dữ liệu!" });
    }

    // Gửi email, replyTo = email người gửi form
    await sendEmail({
      to,
      subject,
      html: message,
      replyTo: userEmail,
    });

    return res.json({ success: true, message: "Gửi email thành công!" });
  } catch (error: any) {
    console.error("Email error:", error);
    return res.status(500).json({
      success: false,
      message: "Gửi email thất bại!",
      error: error.message,
    });
  }
};
