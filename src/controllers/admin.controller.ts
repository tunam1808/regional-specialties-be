import { db } from "../database";
import type { ResultSetHeader } from "mysql2";
import bcrypt from "bcrypt";
import type { Request, Response } from "express";

// 🟢 Lấy danh sách tài khoản
export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id, 
        u.fullname, 
        u.username, 
        u.email, 
        u.avatar, 
        u.role, 
        u.created_at,
        kh.HoTen, 
        kh.SoDienThoai, 
        kh.TinhThanh, 
        
        kh.PhuongXa, 
        kh.DiaChiChiTiet, 
        kh.DiaChiDayDu
      FROM users u
      LEFT JOIN khachhang kh ON u.id = kh.MaKH
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách", error: err });
  }
};

// 🟢 Thêm tài khoản mới
export const createUser = async (req: Request, res: Response) => {
  try {
    const {
      username,
      password,
      email,
      role,
      fullname,
      SoDienThoai,
      TinhThanh,

      PhuongXa,
      DiaChiChiTiet,
      avatar,
    } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "username và password là bắt buộc" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const safeFullname = fullname || username;

    // Tạo user
    const [userResult] = await db.execute<ResultSetHeader>(
      `INSERT INTO users (fullname, username, password, email, role, avatar) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        safeFullname,
        username,
        hashedPassword,
        email,
        role || "user",
        avatar ?? null,
      ]
    );

    const userId = userResult.insertId;

    // ✅ Ghép địa chỉ đầy đủ (từ tên, không từ mã)
    const DiaChiDayDu = [DiaChiChiTiet, PhuongXa, TinhThanh]
      .filter(Boolean)
      .join(", ");

    // Tạo bản ghi KhachHang
    await db.execute<ResultSetHeader>(
      `INSERT INTO khachhang 
   (MaKH, HoTen, SoDienThoai, TinhThanh,  PhuongXa, DiaChiChiTiet, user_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        safeFullname,
        SoDienThoai ?? null,
        TinhThanh ?? null,

        PhuongXa ?? null,
        DiaChiChiTiet ?? null,
        userId,
      ]
    );

    // Lấy lại user vừa tạo
    const [rows] = await db.query(
      `
      SELECT 
        u.id, u.fullname, u.username, u.email, u.avatar, u.role, u.created_at,
        kh.HoTen, kh.SoDienThoai, kh.TinhThanh, kh.PhuongXa, 
        kh.DiaChiChiTiet, kh.DiaChiDayDu
      FROM users u
      LEFT JOIN khachhang kh ON u.id = kh.MaKH
      WHERE u.id = ?`,
      [userId]
    );

    res
      .status(201)
      .json({ message: "Tạo tài khoản thành công", user: (rows as any)[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi tạo tài khoản", error: err });
  }
};

// 🟢 Cập nhật tài khoản
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      username,
      email,
      role,
      fullname,
      SoDienThoai,
      TinhThanh,

      PhuongXa,
      DiaChiChiTiet,
      avatar,
    } = req.body;

    // Lấy thông tin cũ
    const [oldRows] = await db.query(
      `
      SELECT 
        u.fullname, u.username, u.email, u.role, u.avatar,
        kh.SoDienThoai, kh.TinhThanh, kh.PhuongXa, 
        kh.DiaChiChiTiet, kh.DiaChiDayDu
      FROM users u
      LEFT JOIN khachhang kh ON u.id = kh.MaKH
      WHERE u.id = ?`,
      [id]
    );

    const oldUser = Array.isArray(oldRows) ? (oldRows as any)[0] : null;
    if (!oldUser)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });

    // Gộp giá trị mới/cũ
    const safeData = {
      fullname: fullname ?? oldUser.fullname,
      username: username ?? oldUser.username,
      email: email ?? oldUser.email,
      role: role ?? oldUser.role,
      avatar: avatar ?? oldUser.avatar,
      SoDienThoai: SoDienThoai ?? oldUser.SoDienThoai,
      TinhThanh: TinhThanh ?? oldUser.TinhThanh,

      PhuongXa: PhuongXa ?? oldUser.PhuongXa,
      DiaChiChiTiet: DiaChiChiTiet ?? oldUser.DiaChiChiTiet,
    };

    // ✅ Tạo địa chỉ đầy đủ mới
    const DiaChiDayDu = [
      safeData.DiaChiChiTiet,
      safeData.PhuongXa,

      safeData.TinhThanh,
    ]
      .filter(Boolean)
      .join(", ");

    // Cập nhật bảng users
    await db.execute<ResultSetHeader>(
      `UPDATE users 
       SET username = ?, email = ?, role = ?, avatar = ?, fullname = ?
       WHERE id = ?`,
      [
        safeData.username,
        safeData.email,
        safeData.role,
        safeData.avatar,
        safeData.fullname,
        id,
      ]
    );

    // Cập nhật bảng KhachHang (🟢 lưu tên tỉnh/huyện/xã)
    await db.execute<ResultSetHeader>(
      `UPDATE khachhang 
   SET HoTen = ?, SoDienThoai = ?, TinhThanh = ?,  PhuongXa = ?, 
       DiaChiChiTiet = ?
   WHERE MaKH = ?`,
      [
        safeData.fullname,
        safeData.SoDienThoai,
        safeData.TinhThanh,

        safeData.PhuongXa,
        safeData.DiaChiChiTiet,
        id,
      ]
    );

    // Lấy lại user sau cập nhật
    const [rows] = await db.query(
      `
      SELECT 
        u.id, u.fullname, u.username, u.email, u.avatar, u.role, u.created_at,
        kh.HoTen, kh.SoDienThoai, kh.TinhThanh,  kh.PhuongXa, 
        kh.DiaChiChiTiet, kh.DiaChiDayDu
      FROM users u
      LEFT JOIN khachhang kh ON u.id = kh.MaKH
      WHERE u.id = ?`,
      [id]
    );

    res.json({ message: "Cập nhật thành công", user: (rows as any)[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi cập nhật", error: err });
  }
};

// 🟢 Xóa tài khoản
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.execute<ResultSetHeader>(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ message: "Xóa tài khoản thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi xóa", error: err });
  }
};
