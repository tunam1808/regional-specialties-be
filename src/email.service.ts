import nodemailer from "nodemailer";

export const sendEmail = async (
  to: string,
  subject: string,
  message: string,
  replyTo?: string // thêm tùy chọn replyTo
) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "mtn.dacsanbamien@gmail.com", // email gửi thực tế
      pass: "pecgevyxkqrflcds", // app password
    },
  });

  await transporter.sendMail({
    from: `"MTN Shop" <mtn.dacsanbamien@gmail.com>`, // tên hiển thị shop
    to,
    subject,
    html: message, // gửi HTML
    replyTo: replyTo || to, // nếu có replyTo thì dùng, không thì trả về chính to
  });

  return true;
};
