// 📁 src/controllers/order.controller.ts
import { Response } from "express";
import { db } from "../database";
import { AuthRequest } from "../middlewares/authMiddleware";
import { addPendingOrder } from "../cron/update.status.automatic";

export const OrderController = {
  // Lấy danh sách đơn hàng
  async getAll(req: AuthRequest, res: Response) {
    try {
      const user_id = req.user?.id;
      const role = req.user?.role;

      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      let query = "";
      let params: any[] = [];

      if (role === "admin") {
        query = `
          SELECT dh.*, kh.HoTen, kh.SoDienThoai
          FROM donhang dh
          LEFT JOIN khachhang kh ON dh.MaKH = kh.MaKH
          ORDER BY dh.NgayDat DESC
        `;
      } else {
        query = `
          SELECT dh.*, kh.HoTen, kh.SoDienThoai
          FROM donhang dh
          LEFT JOIN khachhang kh ON dh.MaKH = kh.MaKH
          WHERE dh.user_id = ?
          ORDER BY dh.NgayDat DESC
        `;
        params = [user_id];
      }

      const [rows]: any = await db.query(query, params);
      res.json(rows);
    } catch (err) {
      console.error("Lỗi khi lấy danh sách đơn hàng:", err);
      res
        .status(500)
        .json({ message: "Lỗi khi lấy danh sách đơn hàng", error: err });
    }
  },

  // Lấy đơn hàng theo ID
  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      const role = req.user?.role;

      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const [order]: any = await db.query(
        role === "admin"
          ? "SELECT * FROM donhang WHERE MaDonHang = ?"
          : "SELECT * FROM donhang WHERE MaDonHang = ? AND user_id = ?",
        role === "admin" ? [id] : [id, user_id]
      );

      if (!order.length)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      const [details]: any = await db.query(
        `SELECT ctdh.*, sp.TenSP, sp.HinhAnh
         FROM chitietdonhang ctdh
         JOIN sanpham sp ON ctdh.MaSP = sp.MaSP
         WHERE ctdh.MaDonHang = ?`,
        [id]
      );

      res.json({ ...order[0], ChiTiet: details });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy đơn hàng", error: err });
    }
  },

  // Cập nhật trạng thái - Chỉ admin
  async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      const role = req.user?.role;
      const { TrangThai } = req.body;

      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });
      if (!TrangThai)
        return res.status(400).json({ message: "Thiếu trạng thái" });

      const [result]: any = await db.query(
        role === "admin"
          ? "UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ?"
          : "UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ? AND user_id = ?",
        role === "admin" ? [TrangThai, id] : [TrangThai, id, user_id]
      );

      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ message: "Không tìm thấy đơn hàng hoặc bạn không có quyền" });

      if (TrangThai === "Đã xác nhận") {
        addPendingOrder(id);
      }

      res.json({ message: "Cập nhật trạng thái thành công" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật", error: err });
    }
  },

  // Xóa đơn hàng
  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user_id = req.user?.id;
      const role = req.user?.role;

      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const [result]: any = await db.query(
        role === "admin"
          ? "DELETE FROM donhang WHERE MaDonHang = ?"
          : "DELETE FROM donhang WHERE MaDonHang = ? AND user_id = ?",
        role === "admin" ? [id] : [id, user_id]
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

  // Thanh toán giỏ hàng
  async checkout(req: AuthRequest, res: Response) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const user_id = req.user?.id;
      if (!user_id)
        return res.status(401).json({ message: "Vui lòng đăng nhập" });

      const {
        PhuongThucThanhToan,
        DiaChiGiaoHang,
        GhiChu,
        SanPhamDaChon,
        KhoangCach,
        PhiShip = 0,
      } = req.body;

      if (!PhuongThucThanhToan || !DiaChiGiaoHang)
        return res.status(400).json({ message: "Thiếu thông tin thanh toán" });

      if (!Array.isArray(SanPhamDaChon) || SanPhamDaChon.length === 0)
        return res
          .status(400)
          .json({ message: "Không có sản phẩm nào được chọn để thanh toán" });

      const tempOrderId = `CART_${user_id}`;

      const [cartItems]: any = await connection.query(
        `SELECT ctdh.*, sp.SoLuongTon, sp.TenSP 
         FROM chitietdonhang ctdh
         JOIN sanpham sp ON ctdh.MaSP = sp.MaSP
         WHERE ctdh.MaDonHang = ? AND ctdh.MaSP IN (?) FOR UPDATE`,
        [tempOrderId, SanPhamDaChon]
      );

      if (!cartItems.length)
        return res
          .status(400)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ" });

      for (const item of cartItems) {
        if (item.SoLuongTon < item.SoLuong) {
          await connection.rollback();
          return res.status(400).json({
            message: `Sản phẩm "${item.TenSP}" chỉ còn ${item.SoLuongTon} cái`,
          });
        }
      }

      const [khach]: any = await connection.query(
        `SELECT MaKH FROM khachhang WHERE user_id = ?`,
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
        `SELECT MaDonHang FROM donhang ORDER BY MaDonHang DESC LIMIT 1`
      );
      const lastNum = lastOrder.length
        ? parseInt(lastOrder[0].MaDonHang.replace("DH", ""), 10)
        : 0;
      const MaDonHang = `DH${String(lastNum + 1).padStart(4, "0")}`;

      const TongTienSanPham = cartItems.reduce(
        (sum: number, item: any) => sum + item.SoLuong * item.GiaBanTaiThoiDiem,
        0
      );
      const TongTien = TongTienSanPham + Number(PhiShip);

      await connection.query(
        `INSERT INTO donhang 
         (MaDonHang, MaKH, user_id, TongTien, TrangThai, PhuongThucThanhToan, DiaChiGiaoHang, GhiChu, NgayDat, KhoangCach, PhiShip)
         VALUES (?, ?, ?, ?, 'Chờ xác nhận', ?, ?, ?, NOW(), ?, ?)`,
        [
          MaDonHang,
          MaKH,
          user_id,
          TongTien,
          PhuongThucThanhToan,
          DiaChiGiaoHang,
          GhiChu || null,
          KhoangCach || null,
          PhiShip,
        ]
      );

      await connection.query(
        `UPDATE chitietdonhang 
         SET MaDonHang = ? 
         WHERE MaDonHang = ? AND MaSP IN (?)`,
        [MaDonHang, tempOrderId, SanPhamDaChon]
      );

      for (const item of cartItems) {
        await connection.query(
          `UPDATE sanpham 
           SET SoLuongTon = SoLuongTon - ?, DaBan = DaBan + ? 
           WHERE MaSP = ?`,
          [item.SoLuong, item.SoLuong, item.MaSP]
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

  // Lấy giỏ hàng
  async getCart(req: AuthRequest, res: Response) {
    try {
      const user_id = req.user?.id;
      if (!user_id) return res.status(401).json({ message: "Chưa đăng nhập" });

      const tempOrderId = `CART_${user_id}`;
      const [rows]: any = await db.query(
        `SELECT ctdh.*, sp.TenSP, sp.HinhAnh, (ctdh.SoLuong * ctdh.GiaBanTaiThoiDiem) AS ThanhTien
         FROM chitietdonhang ctdh
         JOIN sanpham sp ON ctdh.MaSP = sp.MaSP
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
        `DELETE FROM chitietdonhang WHERE MaDonHang = ? AND MaSP = ?`,
        [tempOrderId, MaSP]
      );

      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      res.json({ message: "Xóa sản phẩm thành công!" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xóa", error: err });
    }
  },

  // THANH TOÁN TRỰC TIẾP – MUA NGAY
  async checkoutDirectly(req: AuthRequest, res: Response) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const user_id = req.user?.id;
      if (!user_id)
        return res.status(401).json({ message: "Vui lòng đăng nhập" });

      const {
        PhuongThucThanhToan,
        DiaChiGiaoHang,
        GhiChu,
        items,
        KhoangCach,
        PhiShip = 0,
      } = req.body;

      if (!PhuongThucThanhToan || !DiaChiGiaoHang)
        return res.status(400).json({ message: "Thiếu thông tin thanh toán" });

      if (!Array.isArray(items) || items.length === 0)
        return res
          .status(400)
          .json({ message: "Không có sản phẩm nào để thanh toán" });

      const placeholders = items.map(() => "?").join(",");
      const maSPList = items.map((i: any) => i.MaSP);

      const [products]: any = await connection.query(
        `SELECT MaSP, TenSP, SoLuongTon 
         FROM sanpham 
         WHERE MaSP IN (${placeholders}) FOR UPDATE`,
        maSPList
      );

      if (products.length !== items.length) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Một số sản phẩm không tồn tại!" });
      }

      for (const item of items) {
        const product = products.find((p: any) => p.MaSP === item.MaSP);
        if (!product || product.SoLuongTon < item.SoLuong) {
          await connection.rollback();
          return res.status(400).json({
            message: `Sản phẩm "${product?.TenSP || item.MaSP}" chỉ còn ${
              product?.SoLuongTon || 0
            } cái`,
          });
        }
      }

      const [khach]: any = await connection.query(
        `SELECT MaKH FROM khachhang WHERE user_id = ?`,
        [user_id]
      );
      if (!khach.length) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Chưa có thông tin khách hàng" });
      }
      const MaKH = khach[0].MaKH;

      const MaDonHang = "DH" + Date.now();

      const TongTienSanPham = items.reduce(
        (sum: number, item: any) => sum + item.SoLuong * item.GiaBanTaiThoiDiem,
        0
      );
      const TongTien = TongTienSanPham + Number(PhiShip);

      await connection.query(
        `INSERT INTO donhang 
         (MaDonHang, MaKH, user_id, TongTien, TrangThai, PhuongThucThanhToan, DiaChiGiaoHang, GhiChu, NgayDat, KhoangCach, PhiShip)
         VALUES (?, ?, ?, ?, 'Chờ xác nhận', ?, ?, ?, NOW(), ?, ?)`,
        [
          MaDonHang,
          MaKH,
          user_id,
          TongTien,
          PhuongThucThanhToan,
          DiaChiGiaoHang,
          GhiChu || null,
          KhoangCach || null,
          PhiShip,
        ]
      );

      for (const item of items) {
        await connection.query(
          `INSERT INTO chitietdonhang 
           (MaDonHang, MaSP, SoLuong, GiaBanTaiThoiDiem) 
           VALUES (?, ?, ?, ?)`,
          [MaDonHang, item.MaSP, item.SoLuong, item.GiaBanTaiThoiDiem]
        );
      }

      for (const item of items) {
        await connection.query(
          `UPDATE sanpham 
           SET SoLuongTon = SoLuongTon - ?, DaBan = DaBan + ? 
           WHERE MaSP = ?`,
          [item.SoLuong, item.SoLuong, item.MaSP]
        );
      }

      await connection.commit();
      res.status(201).json({
        message: "Thanh toán trực tiếp thành công!",
        MaDonHang,
      });
    } catch (err: any) {
      await connection.rollback();
      console.error("Lỗi checkoutDirectly:", err);
      res.status(500).json({
        message: "Lỗi khi thanh toán trực tiếp",
        error: err.message,
      });
    } finally {
      connection.release();
    }
  },
};
