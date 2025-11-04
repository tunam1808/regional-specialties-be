export interface DonHang {
  MaDonHang?: number;
  MaKH: number;
  user_id: number;
  TongTien: number;
  TrangThai?:
    | "Chờ xác nhận"
    | "Đã xác nhận"
    | "Đang giao"
    | "Hoàn thành"
    | "Đã hủy";
  PhuongThucThanhToan?: "Tiền mặt" | "Chuyển khoản" | "Ví điện tử";
  GhiChu?: string;
  NgayDat?: Date;
  NgayCapNhat?: Date;
  DiaChiGiaoHang?: string;
}
