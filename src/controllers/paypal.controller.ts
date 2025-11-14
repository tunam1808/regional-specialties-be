import { Request, Response } from "express";
import { db } from "../database";
import axios from "axios";

// ===================== PAYPAL SANDBOX CONFIG =====================
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID?.trim()!;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET?.trim()!;
const PAYPAL_API =
  process.env.PAYPAL_API_ENDPOINT || "https://api-m.sandbox.paypal.com";

// Interface cho request có user từ JWT middleware
export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

// ===================== ACCESS TOKEN CACHE =====================
let cachedToken = "";
let tokenExpiry = 0;
let tokenPromise: Promise<string> | null = null;

async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("Thiếu PAYPAL_CLIENT_ID hoặc PAYPAL_CLIENT_SECRET");
    }

    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    try {
      const response = await axios.post(
        `${PAYPAL_API}/v1/oauth2/token`,
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 15000,
        }
      );

      cachedToken = response.data.access_token;
      tokenExpiry = Date.now() + response.data.expires_in * 1000 - 60000; // refresh trước 1 phút
      return cachedToken;
    } catch (err: any) {
      console.error("LỖI LẤY TOKEN PAYPAL:", err.response?.data || err.message);
      throw new Error("Failed to get PayPal access token");
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

// ===================== CREATE PAYMENT =====================
export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, orderInfo } = req.body;

    // ✅ Kiểm tra user
    if (!req.user?.id)
      return res.status(401).json({ error: "User không hợp lệ" });
    const user_id = req.user.id;

    // ✅ Lấy MaKH từ DB
    const [khRows]: any = await db.query(
      "SELECT MaKH FROM khachhang WHERE user_id = ?",
      [user_id]
    );
    if (!khRows.length)
      return res.status(400).json({ error: "Khách hàng không tồn tại" });
    const MaKH = khRows[0].MaKH;

    // ✅ Kiểm tra amount & orderInfo
    if (!amount || !orderInfo)
      return res.status(400).json({ error: "Thiếu amount hoặc orderInfo" });

    // ✅ Chuyển amount từ FE sang number
    let amountNumber = Number(String(amount).replace(/[.,]/g, ""));
    if (isNaN(amountNumber) || amountNumber <= 0)
      return res.status(400).json({ error: "Số tiền không hợp lệ" });

    // ✅ Tạo mã đơn hàng
    const MaDonHang = `DH${Date.now()}${Math.floor(Math.random() * 999)}`;
    console.log("🔥 MaDonHang:", MaDonHang);

    // ===================== CHUYỂN VND → USD =====================
    const VND_TO_USD = 26310; // tỉ giá
    let amountUSD = amountNumber / VND_TO_USD;
    if (amountUSD < 0.01) amountUSD = 0.01;
    const amountUSDStr = amountUSD.toFixed(2); // phải là string

    // ===================== LƯU ĐƠN HÀNG =====================
    await db.query(
      `INSERT INTO donhang (MaDonHang, MaKH, user_id, TongTien, TrangThai, NgayDat)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [MaDonHang, MaKH, user_id, amountNumber, "Chờ thanh toán"]
    );

    // ===================== LẤY TOKEN PAYPAL =====================
    const accessToken = await getPayPalAccessToken();

    // ===================== TẠO ORDER PAYPAL =====================
    const orderResponse = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: MaDonHang,
            description: orderInfo.substring(0, 127),
            amount: {
              currency_code: "USD",
              value: amountUSDStr, // string 2 chữ số thập phân
            },
          },
        ],
        application_context: {
          brand_name: "Regional Specialties",
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${process.env.BACKEND_URL}/api/paypal/success?orderId=${MaDonHang}`,
          cancel_url: `${process.env.BACKEND_URL}/api/paypal/cancel?orderId=${MaDonHang}`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": MaDonHang,
        },
      }
    );

    const approveLink = orderResponse.data.links.find(
      (l: any) => l.rel === "approve"
    )?.href;
    if (!approveLink) throw new Error("Không tìm thấy approve link từ PayPal");

    return res.json({
      success: true,
      MaDonHang,
      paypalOrderID: orderResponse.data.id,
      approveLink,
      status: orderResponse.data.status,
    });
  } catch (err: any) {
    console.error("CREATE PAYMENT ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Tạo thanh toán thất bại",
      details: err.response?.data || err.message,
    });
  }
};

// ===================== PAYPAL SUCCESS =====================
export const paypalSuccess = async (req: Request, res: Response) => {
  const { orderId: MaDonHang, token: paypalOrderID, PayerID } = req.query;

  console.log("🔥 paypalSuccess called");
  console.log("Query params:", req.query);

  if (!MaDonHang || typeof MaDonHang !== "string") {
    console.error("❌ Thiếu hoặc sai MaDonHang");
    return res.redirect(
      `${process.env.FRONTEND_URL}/payment-fail?error=invalid_order`
    );
  }

  if (!paypalOrderID || typeof paypalOrderID !== "string") {
    console.error("❌ Thiếu token (PayPal Order ID)");
    return res.redirect(
      `${process.env.FRONTEND_URL}/payment-fail?error=invalid_token`
    );
  }

  try {
    // Lấy access token PayPal
    const accessToken = await getPayPalAccessToken();
    console.log("✅ PayPal Access Token:", accessToken);

    // Capture đơn hàng PayPal
    const captureResp = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${paypalOrderID}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ PayPal Capture Response:", captureResp.data);

    // Kiểm tra trạng thái capture
    const captureStatus = captureResp.data.status;
    if (captureStatus === "COMPLETED") {
      await db.query(
        "UPDATE donhang SET TrangThai = ?, PhuongThucThanhToan = ?, NgayCapNhat = NOW() WHERE MaDonHang = ?",
        ["Đã xác nhận", "PayPal", MaDonHang]
      );
      console.log(`✅ Đơn hàng ${MaDonHang} đã được thanh toán`);
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment-success?orderId=${MaDonHang}`
      );
    } else {
      console.error(`❌ Capture chưa hoàn tất. Status: ${captureStatus}`);
      await db.query("UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ?", [
        "Thanh toán thất bại",
        MaDonHang,
      ]);
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment-fail?orderId=${MaDonHang}`
      );
    }
  } catch (err: any) {
    console.error("❌ paypalSuccess error:", err.response?.data || err.message);
    await db.query("UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ?", [
      "Thanh toán thất bại",
      MaDonHang,
    ]);
    return res.redirect(
      `${process.env.FRONTEND_URL}/payment-fail?orderId=${MaDonHang}`
    );
  }
};

// ===================== PAYPAL CANCEL =====================
export const paypalCancel = async (req: Request, res: Response) => {
  const { orderId: MaDonHang } = req.query;
  if (MaDonHang && typeof MaDonHang === "string") {
    await db.query("UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ?", [
      "Đã hủy",
      MaDonHang,
    ]);
  }
  res.redirect(`${process.env.FRONTEND_URL}/payment-cancel`);
};

// ===================== PAYPAL WEBHOOK =====================
export const paypalWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const MaDonHang = event.resource?.purchase_units?.[0]?.reference_id;
      if (MaDonHang) {
        await db.query(
          `UPDATE donhang 
           SET TrangThai = 'Đã xác nhận',
               PhuongThucThanhToan = 'PayPal',
               NgayCapNhat = NOW()
           WHERE MaDonHang = ?`,
          [MaDonHang]
        );
      }
    }

    if (
      event.event_type === "PAYMENT.CAPTURE.DENIED" ||
      event.event_type === "PAYMENT.CAPTURE.FAILED"
    ) {
      const MaDonHang = event.resource?.purchase_units?.[0]?.reference_id;
      if (MaDonHang) {
        await db.query("UPDATE donhang SET TrangThai = ? WHERE MaDonHang = ?", [
          "Thanh toán thất bại",
          MaDonHang,
        ]);
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("paypalWebhook error:", err.message);
    res.status(500).json({ error: "Webhook xử lý lỗi" });
  }
};

// ===================== CHECK ORDER STATUS =====================
export const checkOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id)
      return res.status(401).json({ error: "User không hợp lệ" });
    const user_id = req.user.id;

    const { MaDonHang } = req.query;
    if (!MaDonHang || typeof MaDonHang !== "string") {
      return res.status(400).json({ error: "Thiếu hoặc sai MaDonHang" });
    }

    const [rows]: any = await db.query(
      "SELECT TrangThai, PhuongThucThanhToan, NgayCapNhat FROM donhang WHERE MaDonHang = ? AND user_id = ?",
      [MaDonHang, user_id]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    return res.json({
      MaDonHang,
      TrangThai: rows[0].TrangThai,
      PhuongThucThanhToan: rows[0].PhuongThucThanhToan,
      NgayCapNhat: rows[0].NgayCapNhat,
    });
  } catch (err: any) {
    console.error("checkOrderStatus error:", err);
    return res.status(500).json({ error: "Lỗi server" });
  }
};
