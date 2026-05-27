import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { BONUS_MAP_WAVE_REWARDS, BONUS_MAP_FINAL_REWARDS } from "../game/bonusMapRewards";

const router = Router();

const waveCompleteSchema = z.object({
  bonusmap_type: z.enum(["green", "red", "blue"]),
  wave: z.number().int().positive(),
});

const completeBonusmapSchema = z.object({
  bonusmap_type: z.enum(["green", "red", "blue"]),
});

const SPELL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const SPELL_REWARD_COLUMNS: Record<string, string> = {
  green_cannon_spell: "green_cannon_spell_expires_at",
  green_hull_spell: "green_hull_spell_expires_at",
  red_cannon_spell: "red_cannon_spell_expires_at",
  red_hull_spell: "red_hull_spell_expires_at",
  blue_cannon_spell: "blue_cannon_spell_expires_at",
  blue_hull_spell: "blue_hull_spell_expires_at",
};

function addSevenDaysToSpell(currentExpiresAt: string | null): string {
  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && current.getTime() > now.getTime() ? current : now;

  return new Date(base.getTime() + SPELL_DURATION_MS).toISOString();
}

function pickFinalReward(bonusmapType: "green" | "red" | "blue") {
  const rewards = BONUS_MAP_FINAL_REWARDS[bonusmapType];
  const roll = Math.random() * 100;

  let acc = 0;

  for (const reward of rewards) {
    acc += reward.chance;

    if (roll <= acc) {
      return reward.id;
    }
  }

  return rewards[0].id;
}

async function addInventoryItem(profileId: string, itemId: string, amount: number) {
  const { data: existing } = await supabase
    .from("player_inventory")
    .select("amount")
    .eq("profile_id", profileId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing) {
    return supabase
      .from("player_inventory")
      .update({
        amount: Number(existing.amount || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId)
      .eq("item_id", itemId);
  }

  return supabase.from("player_inventory").insert({
    profile_id: profileId,
    item_id: itemId,
    amount,
  });
}

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

  const { data: progress, error: progressError } = await supabase
    .from("player_bonusmaps")
    .select("current_wave")
    .eq("profile_id", profileId)
    .eq("bonusmap_type", bonusmap_type)
    .maybeSingle();

  if (progressError) {
    return res.status(400).json({ success: false, message: progressError.message });
  }

  const currentWave = Number(progress?.current_wave || 0);
  const expectedWave = currentWave + 1;

  if (wave !== expectedWave) {
    return res.status(400).json({
      success: false,
      message: `Invalid wave progression. Expected wave ${expectedWave}`,
    });
  }

  const reward = BONUS_MAP_WAVE_REWARDS[bonusmap_type]?.[wave];

  if (!reward) {
    return res.status(400).json({ success: false, message: "Wave reward not found" });
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
    await addInventoryItem(profileId, item.item_id, item.amount);
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

router.post("/complete", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = completeBonusmapSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid bonusmap complete data" });
  }

  const { bonusmap_type } = parsed.data;
  const finalReward = pickFinalReward(bonusmap_type);
  const spellColumn = SPELL_REWARD_COLUMNS[finalReward];

  const requiredFinalWave: Record<"green" | "red" | "blue", number> = {
    green: 30,
    red: 30,
    blue: 30,
  };

  const { data: progressCheck, error: progressCheckError } = await supabase
    .from("player_bonusmaps")
    .select("current_wave, owned_count")
    .eq("profile_id", profileId)
    .eq("bonusmap_type", bonusmap_type)
    .maybeSingle();

  if (progressCheckError) {
    return res.status(400).json({ success: false, message: progressCheckError.message });
  }

  const currentWave = Number(progressCheck?.current_wave || 0);
  const ownedCount = Number(progressCheck?.owned_count || 0);
  const finalWave = requiredFinalWave[bonusmap_type];

  if (ownedCount <= 0) {
    return res.status(400).json({ success: false, message: "No owned bonusmap available" });
  }

  if (currentWave < finalWave) {
    return res.status(400).json({
      success: false,
      message: `Bonusmap not completed. Required wave ${finalWave}`,
    });
  }

  const { error: progressUpdateError } = await supabase.from("player_bonusmaps").upsert(
    {
      profile_id: profileId,
      bonusmap_type,
      current_wave: 0,
      owned_count: Math.max(0, ownedCount - 1),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,bonusmap_type" }
  );

  if (progressUpdateError) {
    return res.status(400).json({ success: false, message: progressUpdateError.message });
  }

  const designRewards = [
    "dark_mojo_design",
    "venom_design",
    "skull_crossbones_design",
    "skull_crossbones_2_design",
  ];

  let spell_expires_at: string | null = null;

  if (spellColumn) {
    const { data: spellState, error: spellFetchError } = await supabase
      .from("player_state")
      .select(spellColumn)
      .eq("profile_id", profileId)
      .single();

    if (spellFetchError || !spellState) {
      return res.status(400).json({
        success: false,
        message: spellFetchError?.message || "Player state not found",
      });
    }

    const spellStateRecord = spellState as unknown as Record<string, string | null>;
    const currentExpiresAt = spellStateRecord[spellColumn] || null;
    const newExpiresAt = addSevenDaysToSpell(currentExpiresAt);

    const { error: spellUpdateError } = await supabase
      .from("player_state")
      .update({
        [spellColumn]: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    if (spellUpdateError) {
      return res.status(400).json({ success: false, message: spellUpdateError.message });
    }

    spell_expires_at = newExpiresAt;
  } else if (designRewards.includes(finalReward)) {
    await addInventoryItem(profileId, finalReward, 1);
  } else {
    await addInventoryItem(profileId, finalReward, 1);
  }

  return res.json({
    success: true,
    bonusmap_type,
    final_reward: finalReward,
    spell_expires_at,
    current_wave: 0,
    owned_count: Math.max(0, ownedCount - 1),
  });
});

export default router;