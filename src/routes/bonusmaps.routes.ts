import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { BONUS_MAP_WAVE_REWARDS } from "../game/bonusMapRewards";

const router = Router();

const waveCompleteSchema = z.object({
  bonusmap_type: z.enum(["green", "red", "blue"]),
  wave: z.number().int().positive(),
});

router.post("/wave-complete", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = waveCompleteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid wave data" });
  }

  const { bonusmap_type, wave } = parsed.data;
  const reward = BONUS_MAP_WAVE_REWARDS[bonusmap_type]?.[wave];

  if (!reward) {
    return res.status(400).json({
      success: false,
      message: "Wave reward not found",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("current_xp, gold, pearls, crystals, elite_points")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({ success: false, message: "Player state not found" });
  }

  const { error: stateUpdateError } = await supabase
    .from("player_state")
    .update({
      current_xp: Number(state.current_xp || 0) + Number(reward.xp || 0),
      gold: Number(state.gold || 0) + Number(reward.gold || 0),
      pearls: Number(state.pearls || 0) + Number(reward.pearls || 0),
      crystals: Number(state.crystals || 0) + Number(reward.crystals || 0),
      elite_points: Number(state.elite_points || 0) + Number(reward.elite || 0),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (stateUpdateError) {
    return res.status(400).json({ success: false, message: stateUpdateError.message });
  }

  const inventoryRewards: Array<{ item_id: string; amount: number }> = [];

  if (reward.gunpowder) inventoryRewards.push({ item_id: "gunpowder", amount: reward.gunpowder });
  if (reward.plates) inventoryRewards.push({ item_id: "plates", amount: reward.plates });
  if (reward.harpoons) inventoryRewards.push({ item_id: "harpoon_1", amount: reward.harpoons });
  if (reward.mojos) inventoryRewards.push({ item_id: "mojo", amount: reward.mojos });

  for (const item of inventoryRewards) {
    const { data: existing } = await supabase
      .from("player_inventory")
      .select("amount")
      .eq("profile_id", profileId)
      .eq("item_id", item.item_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("player_inventory")
        .update({
          amount: Number(existing.amount || 0) + item.amount,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId)
        .eq("item_id", item.item_id);
    } else {
      await supabase.from("player_inventory").insert({
        profile_id: profileId,
        item_id: item.item_id,
        amount: item.amount,
      });
    }
  }

  await supabase.from("player_bonusmaps").upsert(
    {
      profile_id: profileId,
      bonusmap_type,
      current_wave: wave,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,bonusmap_type" }
  );

  return res.json({
    success: true,
    bonusmap_type,
    wave,
    reward,
  });
});

router.get("/progress/:type", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;
  const bonusmapType = String(req.params.type);

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!["green", "red", "blue"].includes(bonusmapType)) {
    return res.status(400).json({ success: false, message: "Invalid bonusmap type" });
  }

  const { data, error } = await supabase
    .from("player_bonusmaps")
    .select("bonusmap_type, current_wave, owned_count")
    .eq("profile_id", profileId)
    .eq("bonusmap_type", bonusmapType)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  return res.json({
    success: true,
    bonusmap_type: bonusmapType,
    current_wave: data?.current_wave || 0,
    owned_count: data?.owned_count || 0,
  });
});

export default router;