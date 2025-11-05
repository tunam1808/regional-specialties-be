import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../database";
import { User } from "../model/user.model";
import dotenv from "dotenv";
import crypto from "crypto"; // Làm chức năng quên mật khẩu
import nodemailer from "nodemailer"; // // Làm chức năng quên mật khẩu

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "defaultsecret";

// Hàm sinh ID ngẫu nhiên 5 số
const generateId = async (): Promise<string> => {
  let id: string;
  let exists = true;

  do {
    id = Math.floor(10000 + Math.random() * 90000).toString(); // Random 5 số
    const [rows] = await db.query("SELECT id FROM users WHERE id = ?", [id]);
    exists = (rows as any[]).length > 0;
  } while (exists);

  return id;
};

// Lấy thông tin profile
export const getProfile = async (req: any, res: Response) => {
  try {
    const userId = String(req.user?.id); // ép về string

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Không tìm thấy token hoặc userId" });
    }

    const [rows] = await db.query(
      `SELECT 
     u.id,
     u.fullname,
     u.username,
     u.email,
     u.role,
     u.avatar,
     u.created_at,
     u.updated_at,
     k.MaKH,
     k.HoTen,
     k.SoDienThoai,
     k.TinhThanh,
     k.PhuongXa,
     k.DiaChiChiTiet AS DiaChi,
     k.DiaChiDayDu,
     k.NgayDangKy
   FROM users u
   LEFT JOIN khachhang k ON u.id = k.user_id 
   WHERE u.id = ?`,
      [userId]
    );

    // Sử dụng 'LEFT JOIN' thay vì JOIN để hiện những thông tin bảng users có mà bảng 'KhachHang' không có. Nếu dùng mỗi JOIN thì nó sẽ hiện chưa đăng nhập và không hiển thị thông tin tài khoản

    const user = (rows as any[])[0];

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    res.json(user);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Lỗi khi lấy thông tin", error: error.message });
  }
};

// Cập nhật thông tin khách hàng (auto INSERT nếu thiếu KhachHang)
export const updateUser = async (req: Request, res: Response) => {
  let connection: any = null;
  try {
    const userId = Number(req.params.id);
    const { SoDienThoai, DiaChiChiTiet, TinhThanh, PhuongXa } = req.body;

    // Kiểm tra user tồn tại
    const [userRows] = await db.query(
      "SELECT fullname FROM users WHERE id = ?",
      [userId]
    );
    if ((userRows as any[]).length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản người dùng" });
    }
    const fullname = (userRows as any[])[0].fullname;

    // Kiểm tra khách hàng đã có trong bảng chưa
    const [khRows] = await db.query(
      "SELECT 1 FROM khachhang WHERE user_id = ?",
      [userId]
    );

    connection = await db.getConnection();
    await connection.beginTransaction();

    if ((khRows as any[]).length === 0) {
      // ✅ Nếu chưa có → thêm mới
      await connection.query(
        `INSERT INTO khachhang 
        (MaKH, HoTen, SoDienThoai, user_id, NgayDangKy, TinhThanh, PhuongXa, DiaChiChiTiet)
        VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          userId,
          fullname,
          SoDienThoai,
          userId,
          TinhThanh,
          PhuongXa,
          DiaChiChiTiet,
        ]
      );
    } else {
      // ✅ Nếu đã có → cập nhật thông tin
      await connection.query(
        `UPDATE khachhang 
         SET SoDienThoai = ?, 
             TinhThanh = ?, 
            
             PhuongXa = ?, 
             DiaChiChiTiet = ?
         WHERE user_id = ?`,
        [SoDienThoai, TinhThanh, PhuongXa, DiaChiChiTiet, userId]
      );
    }

    await connection.commit();
    res.json({
      message: "Cập nhật thông tin thành công",
      data: {
        user_id: userId,
        SoDienThoai,
        TinhThanh,

        PhuongXa,
        DiaChiChiTiet,
        DiaChiDayDu: `${DiaChiChiTiet}, ${PhuongXa}, ${TinhThanh}`,
      },
    });
  } catch (error: any) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error("Lỗi updateUser:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi cập nhật thông tin", error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

// Đăng ký
export const register = async (req: Request, res: Response) => {
  let connection: any = null;
  try {
    const { fullname, username, password, email } = req.body;

    if (!fullname || !username || !password || !email) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }

    const [existing] = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if ((existing as any[]).length > 0) {
      return res
        .status(400)
        .json({ message: "Tài khoản hoặc email đã tồn tại" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = await generateId();

    // Sử dụng transaction để đảm bảo cả hai INSERT thành công
    connection = await db.getConnection();
    await connection.beginTransaction();

    await connection.query(
      "INSERT INTO users (id, fullname, username, password, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [id, fullname, username, hashedPassword, email]
    );

    await connection.query(
      "INSERT INTO khachhang (MaKH, HoTen, user_id, NgayDangKy) VALUES (?, ?, ?, NOW())",
      [id, fullname, id]
    );

    await connection.commit();

    res.status(201).json({ message: "Đăng ký thành công", userId: id });
  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Lỗi register:", error); // Log để debug
    res.status(500).json({ message: "Lỗi khi đăng ký", error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Đăng nhập
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    const user = (rows as any[])[0] as User;

    if (!user) {
      return res
        .status(400)
        .json({ message: "Tài khoản hoặc mật khẩu không đúng" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Tài khoản hoặc mật khẩu không đúng" });
    }

    const token = jwt.sign(
      { id: String(user.id), username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "10h" }
    );

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Lỗi khi đăng nhập", error: error.message });
  }
};

// Đăng xuất
export const logout = async (_req: Request, res: Response) => {
  try {
    res.json({ message: "Đăng xuất thành công" });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Lỗi khi đăng xuất", error: error.message });
  }
};

// ở đăng ký và đăng nhập thì chỉ cần req vì nó được dùng ở đoạn req.body
// ở đăng xuất thì nó không hề được dùng nên phải thay bằng _req để bỏ qua tránh việc xảy ra lỗi 404 not found
