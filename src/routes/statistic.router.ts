import express from "express";
import { StatisticController } from "../controllers/statistic.controller";
import { authMiddleware } from "../middlewares/authMiddleware";
import { verifyAdmin } from "../middlewares/verifyAdmin";

const router = express.Router();

router.use(authMiddleware, verifyAdmin);

router.get("/revenue", StatisticController.getRevenue);

export default router;
