import { Request, Response } from "express";
import { db } from "../database";

export const StatisticController = {
  async getRevenue(req: Request, res: Response) {
    try {
      const { type, all, startDate, endDate } = req.query;

      // Validate type
      if (!["day", "month", "year"].includes(type as string)) {
        return res.status(400).json({
          message: "type phải là day, month hoặc year",
        });
      }

      let format = "";
      let groupBy = "";

      switch (type) {
        case "day":
          format = "%Y-%m-%d";
          groupBy = "DATE_FORMAT(NgayDat, '%Y-%m-%d')";
          break;
        case "month":
          format = "%Y-%m";
          groupBy = "DATE_FORMAT(NgayDat, '%Y-%m')";
          break;
        case "year":
          format = "%Y";
          groupBy = "DATE_FORMAT(NgayDat, '%Y')";
          break;
      }

      // Xây dựng điều kiện WHERE
      const conditions: string[] = [];
      const params: any[] = [format];

      // 1. Lọc trạng thái (nếu không có all=true)
      if (all !== "true") {
        conditions.push("TrangThai IN ('Đã giao', 'Hoàn thành')");
      }

      // 2. Lọc theo khoảng thời gian
      if (startDate) {
        conditions.push("NgayDat >= ?");
        params.push(startDate);
      }
      if (endDate) {
        // Bao gồm cả ngày cuối (đến 23:59:59)
        conditions.push("NgayDat < DATE(?) + INTERVAL 1 DAY");
        params.push(endDate);
      }

      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      const query = `
        SELECT 
          DATE_FORMAT(NgayDat, ?) AS label,
          COALESCE(SUM(TongTien), 0) AS TongDoanhThu,
          COUNT(MaDonHang) AS SoDon
        FROM donhang
        ${whereClause}
        GROUP BY ${groupBy}
        ORDER BY MIN(NgayDat) ASC
      `;

      console.log("SQL Query:", query);
      console.log("Params:", params);

      const [rows]: any = await db.query(query, params);

      res.json(rows);
    } catch (err) {
      console.error("Lỗi thống kê doanh thu:", err);
      res.status(500).json({
        message: "Lỗi khi lấy thống kê doanh thu",
        error: err,
      });
    }
  },
};
