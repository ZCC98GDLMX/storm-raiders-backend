import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { NPC_REWARDS, MONSTER_REWARDS } from "../game/npcRewards";

const router = Router();

const npcKillSchema = z.object({
  npc_type: z.string().min(1).max(80),
});

const monsterKillSchema = z.object({
  monster_type: z.string().min(1).max(80),
});

const cannonShotEliteSchema = z.object({
  ammo_type: z.string().min(1).max(80),
  cannon_count: z.number().int().min(1).max(109),
});

router.post("/npc-kill", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = npcKillSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid npc kill data" });
  }

  const { npc_type } = parsed.data;
  const reward = NPC_REWARDS[npc_type];

  if (!reward) {
    return res.status(400).json({
      success: false,
      message: "Unknown npc type",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: "Player state not found",
    });
  }

  const newState = {
    current_xp: Number(state.current_xp || 0) + Number(reward.xp || 0),
    gold: Number(state.gold || 0) + Number(reward.gold || 0),
    pearls: Number(state.pearls || 0) + Number(reward.pearls || 0),
    crystals: Number(state.crystals || 0) + Number(reward.crystals || 0),
    updated_at: new Date().toISOString(),
  };

  const { data: updatedState, error: updateError } = await supabase
    .from("player_state")
    .update(newState)
    .eq("profile_id", profileId)
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .single();

  if (updateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not apply npc reward",
    });
  }

  return res.json({
    success: true,
    npc_type,
    reward,
    state: updatedState,
  });
});

router.post("/monster-kill", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = monsterKillSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid monster kill data" });
  }

  const { monster_type } = parsed.data;
  const reward = MONSTER_REWARDS[monster_type];

  if (!reward) {
    return res.status(400).json({
      success: false,
      message: "Unknown monster type",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: "Player state not found",
    });
  }

  const newState = {
    current_xp: Number(state.current_xp || 0) + Number(reward.xp || 0),
    gold: Number(state.gold || 0) + Number(reward.gold || 0),
    pearls: Number(state.pearls || 0) + Number(reward.pearls || 0),
    crystals: Number(state.crystals || 0) + Number(reward.crystals || 0),
    updated_at: new Date().toISOString(),
  };

  const { data: updatedState, error: updateError } = await supabase
    .from("player_state")
    .update(newState)
    .eq("profile_id", profileId)
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .single();

  if (updateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not apply monster reward",
    });
  }

  return res.json({
    success: true,
    monster_type,
    reward,
    state: updatedState,
  });
});

router.post("/cannon-shot-elite", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = cannonShotEliteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid cannon shot data" });
  }

  const { ammo_type, cannon_count } = parsed.data;

  const elitePerCannon: Record<string, number> = {
    hollow: 0,
    explosive: 1,
    luminous: 1,
  };

  const elitePerShot = elitePerCannon[ammo_type];

  if (elitePerShot === undefined) {
    return res.status(400).json({
      success: false,
      message: "Unknown cannon ammo type",
    });
  }

  const eliteGain = elitePerShot * cannon_count;

  if (eliteGain <= 0) {
    return res.json({
      success: true,
      elite_gain: 0,
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("elite_points")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: "Player state not found",
    });
  }

  const newElitePoints = Number(state.elite_points || 0) + eliteGain;

  const { data: updatedState, error: updateError } = await supabase
    .from("player_state")
    .update({
      elite_points: newElitePoints,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .single();

  if (updateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not apply elite points",
    });
  }

  return res.json({
    success: true,
    ammo_type,
    cannon_count,
    elite_gain: eliteGain,
    state: updatedState,
  });
});

export default router;