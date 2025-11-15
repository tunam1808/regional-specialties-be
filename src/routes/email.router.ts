import { Router } from "express";
import { sendEmailController } from "../controllers/email.controller";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.post("/send-email", authMiddleware, sendEmailController);

export default router;
