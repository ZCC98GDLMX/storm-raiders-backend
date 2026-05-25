import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const upgradeTalentSchema = z.object({
  talent_id: z.string().min(1).max(80),
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { data: talents, error } = await supabase
    .from("player_talents")
    .select("talent_id, level")
    .eq("profile_id", profileId);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const { data: state } = await supabase
    .from("player_state")
    .select("talent_points_bought, talent_points_available, talent_points_invested")
    .eq("profile_id", profileId)
    .single();

  return res.json({
    success: true,
    talents: talents || [],
    talent_points_bought: state?.talent_points_bought || 0,
    talent_points_available: state?.talent_points_available || 0,
    talent_points_invested: state?.talent_points_invested || 0,
  });
});

router.post("/upgrade", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const parsed = upgradeTalentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid talent data",
    });
  }

  const talentId = parsed.data.talent_id;

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("talent_points_available, talent_points_invested")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: "Player state not found",
    });
  }

  if (state.talent_points_available <= 0) {
    return res.status(400).json({
      success: false,
      message: "No talent points available",
    });
  }

  const { data: existingTalent } = await supabase
    .from("player_talents")
    .select("level")
    .eq("profile_id", profileId)
    .eq("talent_id", talentId)
    .maybeSingle();

  const currentLevel = existingTalent?.level || 0;
  const newLevel = currentLevel + 1;

  const { error: talentError } = await supabase
    .from("player_talents")
    .upsert(
      {
        profile_id: profileId,
        talent_id: talentId,
        level: newLevel,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,talent_id",
      }
    );

  if (talentError) {
    return res.status(400).json({
      success: false,
      message: talentError.message,
    });
  }

  const { error: updateStateError } = await supabase
    .from("player_state")
    .update({
      talent_points_available: state.talent_points_available - 1,
      talent_points_invested: state.talent_points_invested + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (updateStateError) {
    return res.status(400).json({
      success: false,
      message: updateStateError.message,
    });
  }

  return res.json({
    success: true,
    talent_id: talentId,
    new_level: newLevel,
    talent_points_available: state.talent_points_available - 1,
    talent_points_invested: state.talent_points_invested + 1,
  });
});

router.post("/buy-point", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { data: state, error } = await supabase
    .from("player_state")
    .select("crystals, talent_points_bought, talent_points_available")
    .eq("profile_id", profileId)
    .single();

  if (error || !state) {
    return res.status(400).json({
      success: false,
      message: "Player state not found",
    });
  }

  const currentBought = Number(state.talent_points_bought || 0);
  const price = 100 + currentBought * 25;

  if (Number(state.crystals || 0) < price) {
    return res.status(400).json({
      success: false,
      message: "Not enough crystals",
      price,
    });
  }

  const { data: updatedState, error: updateError } = await supabase
    .from("player_state")
    .update({
      crystals: Number(state.crystals) - price,
      talent_points_bought: currentBought + 1,
      talent_points_available: Number(state.talent_points_available || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .select("crystals, talent_points_bought, talent_points_available, talent_points_invested")
    .single();

  if (updateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not buy talent point",
    });
  }

  return res.json({
    success: true,
    price,
    state: updatedState,
  });
});

export default router;