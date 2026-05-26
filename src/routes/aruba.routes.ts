import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function addInventoryItem(
  profileId: string,
  itemId: string,
  amount: number
) {
  const { data: existing } = await supabase
    .from("player_inventory")
    .select("amount")
    .eq("profile_id", profileId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("player_inventory")
      .update({
        amount: Number(existing.amount || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId)
      .eq("item_id", itemId);
  } else {
    await supabase.from("player_inventory").insert({
      profile_id: profileId,
      item_id: itemId,
      amount,
    });
  }
}

router.post("/throw-mojo", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profile_id;

    if (!profileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // =========================
    // LOAD PLAYER STATE
    // =========================

    const { data: state } = await supabase
      .from("player_state")
      .select("pearls")
      .eq("profile_id", profileId)
      .single();

    if (!state) {
      return res.status(400).json({
        success: false,
        message: "Player state not found",
      });
    }

    // =========================
    // LOAD MOJOS
    // =========================

    const { data: mojoItem } = await supabase
      .from("player_inventory")
      .select("amount")
      .eq("profile_id", profileId)
      .eq("item_id", "mojo")
      .maybeSingle();

    let currentMojos = Number(mojoItem?.amount || 0);
    let currentPearls = Number(state.pearls || 0);

    // =========================
    // PAYMENT
    // =========================

    if (currentMojos > 0) {
      currentMojos -= 1;

      await supabase
        .from("player_inventory")
        .update({
          amount: currentMojos,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId)
        .eq("item_id", "mojo");
    } else {
      const pearlCost = 100;

      if (currentPearls < pearlCost) {
        return res.status(400).json({
          success: false,
          message: "Not enough mojos or pearls",
        });
      }

      currentPearls -= pearlCost;

      await supabase
        .from("player_state")
        .update({
          pearls: currentPearls,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId);
    }

    // =========================
    // ROLL REWARD
    // =========================

    const roll = Math.random() * 100;

    let reward: any = {};

    // Hollow ammo
    if (roll < 40) {
      const amount = 200;

      await addInventoryItem(profileId, "hollow", amount);

      reward = {
        type: "ammo",
        item_id: "hollow",
        amount,
      };
    }

    // Explosive ammo
    else if (roll < 60) {
      const amount = 60;

      await addInventoryItem(profileId, "explosive", amount);

      reward = {
        type: "ammo",
        item_id: "explosive",
        amount,
      };
    }

    // Gunpowder
    else if (roll < 80) {
      const amount = randomInt(4, 8);

      await addInventoryItem(profileId, "gunpowder", amount);

      reward = {
        type: "extra",
        item_id: "gunpowder",
        amount,
      };
    }

    // Mojo reward
    else {
      const amount = randomInt(1, 3);

      await addInventoryItem(profileId, "mojo", amount);

      reward = {
        type: "mojo",
        item_id: "mojo",
        amount,
      };

      currentMojos += amount;
    }

    return res.json({
      success: true,
      reward,
      wallet: {
        pearls: currentPearls,
        mojos: currentMojos,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unexpected Aruba error",
    });
  }
});

export default router;