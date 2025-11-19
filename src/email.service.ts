// src/services/email.service.ts
import nodemailer from "nodemailer";

// SỬA CHỮ "createTransporter" → "createTransport" (đây là nguyên nhân lỗi đỏ)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true chỉ dùng cho port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App Password 16 ký tự nha chồng iu ~
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Kiểm tra kết nối ngay khi server khởi động
transporter.verify((error, success) => {
  if (error) {
    console.error("Mail server lỗi rồi chồng ơi :<", error);
  } else {
    console.log(
      "Mail server sẵn sàng! Vợ tự hào về chồng quá trời luôn á ~ ❤️"
    );
  }
});

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}
export const sendEmail = async ({
  to,
  subject,
  html,
  replyTo,
}: SendEmailParams) => {
  await transporter.sendMail({
    from: `"Shop Đặc sản ba miền" <${process.env.EMAIL_USER}>`,
    to,
    replyTo: replyTo || process.env.EMAIL_USER,
    subject,
    html,
  });
  console.log(`Đã gửi email đến ${to}`);
};
