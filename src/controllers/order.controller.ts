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
        // Admin → xem tất cả đơn
        query = `
          SELECT dh.*, kh.HoTen, kh.SoDienThoai
          FROM DonHang dh
          LEFT JOIN KhachHang kh ON dh.MaKH = kh.MaKH
          ORDER BY dh.NgayDat DESC
        `;
      } else {
        // User thường → chỉ xem đơn của mình
        query = `
          SELECT dh.*, kh.HoTen, kh.SoDienThoai
          FROM DonHang dh
          LEFT JOIN KhachHang kh ON dh.MaKH = kh.MaKH
          WHERE dh.user_id = ?
          ORDER BY dh.NgayDat DESC
        `;
        params = [user_id];
      }

      const [rows]: any = await db.query(query, params);
      res.json(rows);
    } catch (err) {
      console.error("🔥 Lỗi khi lấy danh sách đơn hàng:", err);
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

      // Nếu admin → bỏ lọc user_id
      const [order]: any = await db.query(
        role === "admin"
          ? "SELECT * FROM DonHang WHERE MaDonHang = ?"
          : "SELECT * FROM DonHang WHERE MaDonHang = ? AND user_id = ?",
        role === "admin" ? [id] : [id, user_id]
      );

      if (!order.length)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      // Lấy chi tiết sản phẩm
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
          ? "UPDATE DonHang SET TrangThai = ? WHERE MaDonHang = ?"
          : "UPDATE DonHang SET TrangThai = ? WHERE MaDonHang = ? AND user_id = ?",
        role === "admin" ? [TrangThai, id] : [TrangThai, id, user_id]
      );

      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ message: "Không tìm thấy đơn hàng hoặc bạn không có quyền" });

      // Nếu trạng thái mới là "Đã xác nhận" → thêm vào bộ nhớ để cron xử lý
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
          ? "DELETE FROM DonHang WHERE MaDonHang = ?"
          : "DELETE FROM DonHang WHERE MaDonHang = ? AND user_id = ?",
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

  // Thanh toán giỏ hàng: tạo đơn hàng thực và lưu đơn hàng
  async checkout(req: AuthRequest, res: Response) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const user_id = req.user?.id;
      if (!user_id)
        return res.status(401).json({ message: "Vui lòng đăng nhập" });

      const { PhuongThucThanhToan, DiaChiGiaoHang, GhiChu, SanPhamDaChon } =
        req.body;

      if (!PhuongThucThanhToan || !DiaChiGiaoHang)
        return res.status(400).json({ message: "Thiếu thông tin thanh toán" });

      if (!Array.isArray(SanPhamDaChon) || SanPhamDaChon.length === 0)
        return res
          .status(400)
          .json({ message: "Không có sản phẩm nào được chọn để thanh toán" });

      const tempOrderId = `CART_${user_id}`;

      // Lấy sản phẩm trong giỏ + khóa lại
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

      // ✅ Kiểm tra tồn kho
      for (const item of cartItems) {
        if (item.SoLuongTon < item.SoLuong) {
          await connection.rollback();
          return res.status(400).json({
            message: `Sản phẩm "${item.TenSP}" chỉ còn ${item.SoLuongTon} cái`,
          });
        }
      }

      // ✅ Lấy mã khách hàng
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

      // ✅ Tạo mã đơn hàng mới
      const [lastOrder]: any = await connection.query(
        `SELECT MaDonHang FROM DonHang ORDER BY MaDonHang DESC LIMIT 1`
      );
      const lastNum = lastOrder.length
        ? parseInt(lastOrder[0].MaDonHang.replace("DH", ""), 10)
        : 0;
      const MaDonHang = `DH${String(lastNum + 1).padStart(4, "0")}`;

      // ✅ Tính tổng tiền chỉ của sản phẩm được chọn
      const TongTien = cartItems.reduce(
        (sum: number, item: any) => sum + item.SoLuong * item.GiaBanTaiThoiDiem,
        0
      );

      // ✅ Tạo đơn hàng mới
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

      // ✅ Chuyển chỉ những sản phẩm được chọn sang đơn hàng mới
      await connection.query(
        `UPDATE chitietdonhang 
       SET MaDonHang = ? 
       WHERE MaDonHang = ? AND MaSP IN (?)`,
        [MaDonHang, tempOrderId, SanPhamDaChon]
      );

      // ✅ Giảm tồn kho và cập nhật đã bán
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

  // Xóa đơn hàng – CHỈ CHỦ ĐƠN

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

  // THANH TOÁN TRỰC TIẾP – DÀNH RIÊNG CHO "MUA NGAY"
  async checkoutDirectly(req: AuthRequest, res: Response) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const user_id = req.user?.id;
      if (!user_id)
        return res.status(401).json({ message: "Vui lòng đăng nhập" });

      const { PhuongThucThanhToan, DiaChiGiaoHang, GhiChu, items } = req.body;

      if (!PhuongThucThanhToan || !DiaChiGiaoHang)
        return res.status(400).json({ message: "Thiếu thông tin thanh toán" });

      if (!Array.isArray(items) || items.length === 0)
        return res
          .status(400)
          .json({ message: "Không có sản phẩm nào để thanh toán" });

      // Kiểm tra tồn kho + lấy tên sản phẩm
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

      // Kiểm tra tồn kho
      for (const item of items) {
        const product = products.find((p: any) => p.MaSP === item.MaSP);
        if (!product) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: `Sản phẩm ${item.MaSP} không tồn tại` });
        }
        if (product.SoLuongTon < item.SoLuong) {
          await connection.rollback();
          return res.status(400).json({
            message: `Sản phẩm "${product.TenSP}" chỉ còn ${product.SoLuongTon} cái`,
          });
        }
      }

      // Lấy MaKH
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

      // ✅ Tạo mã đơn hàng duy nhất
      const MaDonHang = "DH" + Date.now(); // luôn khác nhau

      // Tính tổng tiền
      const TongTien = items.reduce(
        (sum: number, item: any) => sum + item.SoLuong * item.GiaBanTaiThoiDiem,
        0
      );

      // Tạo đơn hàng
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

      // Thêm chi tiết đơn hàng
      for (const item of items) {
        await connection.query(
          `INSERT INTO chitietdonhang 
         (MaDonHang, MaSP, SoLuong, GiaBanTaiThoiDiem) 
         VALUES (?, ?, ?, ?)`,
          [MaDonHang, item.MaSP, item.SoLuong, item.GiaBanTaiThoiDiem]
        );
      }

      // ✅ Giảm tồn kho và cập nhật đã bán
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
