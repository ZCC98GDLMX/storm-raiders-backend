import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

router.post("/kill", requireAuth, async (_req: AuthRequest, res) => {
  return res.status(410).json({
    success: false,
    message: "Deprecated endpoint. Use /combat/npc-kill or /combat/monster-kill.",
  });
});

export default router;