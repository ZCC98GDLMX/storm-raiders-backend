import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const REWARD_TYPES = ["xp", "gold", "pearls", "plates", "gunpowder", "mojo", "hp"] as const;
type RewardType = typeof REWARD_TYPES[number];

function pickRewardType(): RewardType {
  return REWARD_TYPES[Math.floor(Math.random() * REWARD_TYPES.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getBaseRewardAmount(rewardType: RewardType): number {
  switch (rewardType) {
    case "xp": return randomInt(30, 50);
    case "gold": return randomInt(500, 5500);
    case "pearls": return randomInt(20, 150);
    case "plates": return randomInt(1, 5);
    case "gunpowder": return randomInt(1, 5);
    case "mojo": return randomInt(1, 3);
    case "hp": return randomInt(200, 2500);
  }
}

async function addInventoryItem(profileId: string, itemId: string, amount: number) {
  const { data: existing } = await supabase
    .from("player_inventory")
    .select("amount")
    .eq("profile_id", profileId)
    .eq("item_id", itemId)
    .maybeSingle();

  const newAmount = Number(existing?.amount || 0) + amount;

  return await supabase
    .from("player_inventory")
    .upsert(
      {
        profile_id: profileId,
        item_id: itemId,
        amount: newAmount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,item_id" }
    )
    .select("item_id, amount")
    .single();
}

router.post("/collect", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const rewardType = pickRewardType();
  const amount = getBaseRewardAmount(rewardType);

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: stateError?.message || "Player state not found",
    });
  }

  if (rewardType === "plates" || rewardType === "gunpowder" || rewardType === "mojo") {
    const itemId = rewardType === "mojo" ? "mojo" : rewardType;
    const { data: inventoryItem, error } = await addInventoryItem(profileId, itemId, amount);

    if (error || !inventoryItem) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Could not add glitter inventory reward",
      });
    }

    return res.json({
      success: true,
      reward: { type: rewardType, amount },
      inventory_item: inventoryItem,
      state,
    });
  }

  if (rewardType === "hp") {
    return res.json({
      success: true,
      reward: { type: rewardType, amount },
      state,
    });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (rewardType === "xp") updates.current_xp = Number(state.current_xp || 0) + amount;
  if (rewardType === "gold") updates.gold = Number(state.gold || 0) + amount;
  if (rewardType === "pearls") updates.pearls = Number(state.pearls || 0) + amount;

  const { data: updatedState, error: updateError } = await supabase
    .from("player_state")
    .update(updates)
    .eq("profile_id", profileId)
    .select("level, current_xp, gold, pearls, crystals, elite_points")
    .single();

  if (updateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not apply glitter reward",
    });
  }

  return res.json({
    success: true,
    reward: { type: rewardType, amount },
    state: updatedState,
  });
});

export default router;