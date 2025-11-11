import cron from "node-cron";
import { db } from "../database";

// Lưu trữ đơn hàng đã xác nhận và thời gian xác nhận
const pendingOrders: Record<string, number> = {}; // MaDonHang -> timestamp xác nhận

// Hàm thêm đơn vừa xác nhận vào bộ nhớ
export function addPendingOrder(MaDonHang: string) {
  pendingOrders[MaDonHang] = Date.now();
  console.log(
    `🕒 Đơn ${MaDonHang} được thêm vào bộ nhớ để tự động cập nhật trạng thái`
  );
}

// Cron chạy mỗi giây để kiểm tra đơn hàng trong bộ nhớ
cron.schedule("* * * * * *", async () => {
  const now = Date.now();

  for (const [MaDonHang, ts] of Object.entries(pendingOrders)) {
    const diff = (now - ts) / 1000; // thời gian đã trôi qua (giây)

    try {
      if (diff >= 5 && diff < 15) {
        // 5s sau xác nhận → "Đang giao"
        await db.query(
          `UPDATE DonHang SET TrangThai = 'Đang giao' WHERE MaDonHang = ? AND TrangThai = 'Đã xác nhận'`,
          [MaDonHang]
        );
        console.log(`🚚 Đơn ${MaDonHang} → Đang giao`);
      } else if (diff >= 15) {
        // 10s sau "Đang giao" → "Hoàn thành"
        await db.query(
          `UPDATE DonHang SET TrangThai = 'Hoàn thành' WHERE MaDonHang = ? AND TrangThai = 'Đang giao'`,
          [MaDonHang]
        );
        console.log(`✅ Đơn ${MaDonHang} → Hoàn thành`);
        delete pendingOrders[MaDonHang]; // xong thì xoá khỏi memory
      }
    } catch (err) {
      console.error(`❌ Lỗi cập nhật đơn ${MaDonHang}:`, err);
    }
  }
});
