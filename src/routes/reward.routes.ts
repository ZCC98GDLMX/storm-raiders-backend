import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const grantKillRewardSchema = z.object({
  xp: z.number().int().min(0).max(1000000),
  gold: z.number().int().min(0).max(10000000),
  pearls: z.number().int().min(0).max(1000000).optional().default(0),
  crystals: z.number().int().min(0).max(100000).optional().default(0),
  source: z.string().min(1).max(80).optional().default("unknown"),
});

router.post("/kill", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = grantKillRewardSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid reward data" });
  }

  const reward = parsed.data;

  const { data: currentState, error: fetchError } = await supabase
    .from("player_state")
    .select("current_xp, gold, pearls, crystals")
    .eq("profile_id", profileId)
    .single();

  if (fetchError || !currentState) {
    return res.status(404).json({ success: false, message: "Player state not found" });
  }

  const updates = {
    current_xp: Number(currentState.current_xp) + reward.xp,
    gold: Number(currentState.gold) + reward.gold,
    pearls: Number(currentState.pearls) + reward.pearls,
    crystals: Number(currentState.crystals) + reward.crystals,
    updated_at: new Date().toISOString(),
  };

  const { data: state, error: updateError } = await supabase
    .from("player_state")
    .update(updates)
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (updateError || !state) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not grant reward",
    });
  }

  return res.json({
    success: true,
    reward,
    state,
  });
});

export default router;