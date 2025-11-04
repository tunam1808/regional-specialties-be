export interface ChiTietDonHang {
  MaCTDH?: number; // Tự tăng → có thể optional
  MaDonHang: string; // Mã đơn hàng (FK tới DonHang)
  MaSP: number; // Mã sản phẩm
  SoLuong: number;
  GiaBanTaiThoiDiem: number;
  GhiChu?: string; // optional
}
