// 📁 src/controllers/order.controller.ts
import { Response } from "express";
import { db } from "../database";
import { AuthRequest } from "../middlewares/authMiddleware";

export const OrderController = {
  // Lấy danh sách đơn hàng CỦA CHÍNH MÌNH
  async getAll(req: AuthRequest, res: Response) {
    try {
      const user_id = req.user?.id;
      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const [rows]: any = await db.query(
        "SELECT * FROM DonHang WHERE user_id = ? ORDER BY NgayDat DESC",
        [user_id]
      );
      res.json(rows);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Lỗi khi lấy danh sách đơn hàng", error: err });
    }
  },

  // Lấy đơn hàng theo ID – CHỈ CHỦ ĐƠN
  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const [rows]: any = await db.query(
        "SELECT * FROM DonHang WHERE MaDonHang = ? AND user_id = ?",
        [id, user_id]
      );
      if (!rows.length)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy đơn hàng", error: err });
    }
  },

  // Thanh toán giỏ hàng: tạo đơn hàng thực
  async checkout(req: AuthRequest, res: Response) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const user_id = req.user?.id;
      if (!user_id)
        return res.status(401).json({ message: "Vui lòng đăng nhập" });

      const { PhuongThucThanhToan, DiaChiGiaoHang, GhiChu } = req.body;
      if (!PhuongThucThanhToan || !DiaChiGiaoHang)
        return res.status(400).json({ message: "Thiếu thông tin thanh toán" });

      const tempOrderId = `CART_${user_id}`;

      const [cartItems]: any = await connection.query(
        `SELECT ctdh.*, sp.SoLuongTon 
         FROM ChiTietDonHang ctdh
         JOIN SanPham sp ON ctdh.MaSP = sp.MaSP
         WHERE ctdh.MaDonHang = ? FOR UPDATE`,
        [tempOrderId]
      );

      if (!cartItems.length)
        return res.status(400).json({ message: "Giỏ hàng trống" });

      for (const item of cartItems) {
        if (item.SoLuongTon < item.SoLuong) {
          await connection.rollback();
          return res.status(400).json({
            message: `Sản phẩm "${item.TenSP}" chỉ còn ${item.SoLuongTon} cái`,
          });
        }
      }

      const [khach]: any = await connection.query(
        `SELECT MaKH FROM KhachHang WHERE user_id = ?`,
        [user_id]
      );
      if (!khach.length) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Chưa có thông tin khách hàng" });
      }
      const MaKH = khach[0].MaKH;

      const [lastOrder]: any = await connection.query(
        `SELECT MaDonHang FROM DonHang ORDER BY MaDonHang DESC LIMIT 1`
      );
      const lastNum = lastOrder.length
        ? parseInt(lastOrder[0].MaDonHang.replace("DH", ""), 10)
        : 0;
      const MaDonHang = `DH${String(lastNum + 1).padStart(4, "0")}`;

      const TongTien = cartItems.reduce(
        (sum: number, item: any) => sum + item.SoLuong * item.GiaBanTaiThoiDiem,
        0
      );

      await connection.query(
        `INSERT INTO DonHang 
         (MaDonHang, MaKH, user_id, TongTien, TrangThai, PhuongThucThanhToan, DiaChiGiaoHang, GhiChu, NgayDat)
         VALUES (?, ?, ?, ?, 'Chờ xác nhận', ?, ?, ?, NOW())`,
        [
          MaDonHang,
          MaKH,
          user_id,
          TongTien,
          PhuongThucThanhToan,
          DiaChiGiaoHang,
          GhiChu || null,
        ]
      );

      await connection.query(
        `UPDATE ChiTietDonHang SET MaDonHang = ? WHERE MaDonHang = ?`,
        [MaDonHang, tempOrderId]
      );

      for (const item of cartItems) {
        await connection.query(
          `UPDATE SanPham SET SoLuongTon = SoLuongTon - ? WHERE MaSP = ?`,
          [item.SoLuong, item.MaSP]
        );
      }

      await connection.commit();
      res.status(201).json({ message: "Thanh toán thành công!", MaDonHang });
    } catch (err) {
      await connection.rollback();
      console.error("Lỗi checkout:", err);
      res.status(500).json({ message: "Lỗi khi thanh toán", error: err });
    } finally {
      connection.release();
    }
  },

  // Cập nhật trạng thái – CHỈ CHỦ ĐƠN
  async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      const { TrangThai } = req.body;

      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });
      if (!TrangThai)
        return res.status(400).json({ message: "Thiếu trạng thái" });

      const [result]: any = await db.query(
        "UPDATE DonHang SET TrangThai = ? WHERE MaDonHang = ? AND user_id = ?",
        [TrangThai, id, user_id]
      );

      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ message: "Không tìm thấy đơn hàng hoặc bạn không có quyền" });

      res.json({ message: "Cập nhật trạng thái thành công" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật", error: err });
    }
  },

  // Xóa đơn hàng – CHỈ CHỦ ĐƠN
  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const [result]: any = await db.query(
        "DELETE FROM DonHang WHERE MaDonHang = ? AND user_id = ?",
        [id, user_id]
      );

      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ message: "Không tìm thấy đơn hàng hoặc bạn không có quyền" });

      res.json({ message: "Xóa đơn hàng thành công" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xóa", error: err });
    }
  },

  // Lấy giỏ hàng
  async getCart(req: AuthRequest, res: Response) {
    try {
      const user_id = req.user?.id;
      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const tempOrderId = `CART_${user_id}`;
      const [rows]: any = await db.query(
        `SELECT ctdh.*, sp.TenSP, sp.HinhAnh, (ctdh.SoLuong * ctdh.GiaBanTaiThoiDiem) AS ThanhTien
         FROM ChiTietDonHang ctdh
         JOIN SanPham sp ON ctdh.MaSP = sp.MaSP
         WHERE ctdh.MaDonHang = ?`,
        [tempOrderId]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy giỏ hàng", error: err });
    }
  },

  // Xóa sản phẩm trong giỏ
  async deleteFromCart(req: AuthRequest, res: Response) {
    try {
      const user_id = req.user?.id;
      const { MaSP } = req.params;
      if (!user_id || !MaSP)
        return res.status(400).json({ message: "Thiếu thông tin" });

      const tempOrderId = `CART_${user_id}`;
      const [result]: any = await db.query(
        `DELETE FROM ChiTietDonHang WHERE MaDonHang = ? AND MaSP = ?`,
        [tempOrderId, MaSP]
      );

      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      res.json({ message: "Xóa sản phẩm thành công!" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xóa", error: err });
    }
  },
};
