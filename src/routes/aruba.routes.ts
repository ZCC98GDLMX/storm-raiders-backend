import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const PIECE_TOTALS = {
  green: 30,
  red: 48,
  blue: 64,
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomPiece(total: number): number {
  return randomInt(1, total);
}

function addMissingPieces(currentPieces: number[], total: number, amount: number): number[] {
  const added: number[] = [];

  for (let i = 0; i < amount; i++) {
    const missing: number[] = [];

    for (let piece = 1; piece <= total; piece++) {
      if (!currentPieces.includes(piece) && !added.includes(piece)) {
        missing.push(piece);
      }
    }

    if (missing.length <= 0) break;

    added.push(missing[randomInt(0, missing.length - 1)]);
  }

  return added;
}

async function addInventoryItem(profileId: string, itemId: string, amount: number) {
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
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

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

    const { data: mojoItem } = await supabase
      .from("player_inventory")
      .select("amount")
      .eq("profile_id", profileId)
      .eq("item_id", "mojo")
      .maybeSingle();

    let currentMojos = Number(mojoItem?.amount || 0);
    let currentPearls = Number(state.pearls || 0);

    let { data: arubaState } = await supabase
      .from("player_aruba_state")
      .select("green_pieces, red_pieces, blue_pieces, multiplier, multiplier_enabled")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!arubaState) {
      const { data: createdArubaState, error: createError } = await supabase
        .from("player_aruba_state")
        .insert({
          profile_id: profileId,
          green_pieces: [],
          red_pieces: [],
          blue_pieces: [],
          multiplier: 1,
          multiplier_enabled: false,
        })
        .select("green_pieces, red_pieces, blue_pieces, multiplier, multiplier_enabled")
        .single();

      if (createError || !createdArubaState) {
        return res.status(400).json({
          success: false,
          message: createError?.message || "Could not create Aruba state",
        });
      }

      arubaState = createdArubaState;
    }

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

    const activeMultiplier =
      arubaState.multiplier_enabled && Number(arubaState.multiplier || 1) > 1
        ? Number(arubaState.multiplier || 1)
        : 1;

    let nextMultiplier = Number(arubaState.multiplier || 1);
    let nextMultiplierEnabled = false;

    if (arubaState.multiplier_enabled) {
      nextMultiplier = 1;
      nextMultiplierEnabled = false;
    }

    const roll = Math.random() * 100;
    let reward: any = {};

    let greenPieces: number[] = Array.isArray(arubaState.green_pieces)
      ? arubaState.green_pieces.map(Number)
      : [];

    let redPieces: number[] = Array.isArray(arubaState.red_pieces)
      ? arubaState.red_pieces.map(Number)
      : [];

    let bluePieces: number[] = Array.isArray(arubaState.blue_pieces)
      ? arubaState.blue_pieces.map(Number)
      : [];

    // 15% bonusmap pieces
    if (roll < 5) {
      if (activeMultiplier > 1) {
        const addedPieces = addMissingPieces(greenPieces, PIECE_TOTALS.green, activeMultiplier);
        greenPieces.push(...addedPieces);

        reward = {
          type: "bonusmap_piece",
          map_type: "green",
          piece_ids: addedPieces,
          amount: addedPieces.length,
        };
      } else {
        const piece = pickRandomPiece(PIECE_TOTALS.green);

        if (greenPieces.includes(piece)) {
          nextMultiplier = Math.min(Math.max(nextMultiplier, 1) + 1, 6);
          reward = {
            type: "duplicate_piece",
            map_type: "green",
            piece_id: piece,
            amount: 0,
            multiplier: nextMultiplier,
          };
        } else {
          greenPieces.push(piece);
          reward = {
            type: "bonusmap_piece",
            map_type: "green",
            piece_id: piece,
            amount: 1,
          };
        }
      }
    } else if (roll < 10) {
      if (activeMultiplier > 1) {
        const addedPieces = addMissingPieces(redPieces, PIECE_TOTALS.red, activeMultiplier);
        redPieces.push(...addedPieces);

        reward = {
          type: "bonusmap_piece",
          map_type: "red",
          piece_ids: addedPieces,
          amount: addedPieces.length,
        };
      } else {
        const piece = pickRandomPiece(PIECE_TOTALS.red);

        if (redPieces.includes(piece)) {
          nextMultiplier = Math.min(Math.max(nextMultiplier, 1) + 1, 6);
          reward = {
            type: "duplicate_piece",
            map_type: "red",
            piece_id: piece,
            amount: 0,
            multiplier: nextMultiplier,
          };
        } else {
          redPieces.push(piece);
          reward = {
            type: "bonusmap_piece",
            map_type: "red",
            piece_id: piece,
            amount: 1,
          };
        }
      }
    } else if (roll < 15) {
      if (activeMultiplier > 1) {
        const addedPieces = addMissingPieces(bluePieces, PIECE_TOTALS.blue, activeMultiplier);
        bluePieces.push(...addedPieces);

        reward = {
          type: "bonusmap_piece",
          map_type: "blue",
          piece_ids: addedPieces,
          amount: addedPieces.length,
        };
      } else {
        const piece = pickRandomPiece(PIECE_TOTALS.blue);

        if (bluePieces.includes(piece)) {
          nextMultiplier = Math.min(Math.max(nextMultiplier, 1) + 1, 6);
          reward = {
            type: "duplicate_piece",
            map_type: "blue",
            piece_id: piece,
            amount: 0,
            multiplier: nextMultiplier,
          };
        } else {
          bluePieces.push(piece);
          reward = {
            type: "bonusmap_piece",
            map_type: "blue",
            piece_id: piece,
            amount: 1,
          };
        }
      }
    }

    // special items
    else if (roll < 17.5) {
      const amount = 1 * activeMultiplier;
      await addInventoryItem(profileId, "crystal_gift", amount);
      reward = { type: "extra", item_id: "crystal_gift", amount };
    } else if (roll < 20) {
      const amount = 1 * activeMultiplier;
      await addInventoryItem(profileId, "light_medallion", amount);
      reward = { type: "extra", item_id: "light_medallion", amount };
    } else if (roll < 21.5) {
      const amount = 1 * activeMultiplier;
      await addInventoryItem(profileId, "turtle_light", amount);
      reward = { type: "extra", item_id: "turtle_light", amount };
    } else if (roll < 23) {
      const amount = 1 * activeMultiplier;
      await addInventoryItem(profileId, "triton_bless", amount);
      reward = { type: "extra", item_id: "triton_bless", amount };
    }

    // mojos
    else if (roll < 31) {
      const amount = 1 * activeMultiplier;
      await addInventoryItem(profileId, "mojo", amount);
      currentMojos += amount;
      reward = { type: "mojo", item_id: "mojo", amount };
    } else if (roll < 33) {
      const amount = 2 * activeMultiplier;
      await addInventoryItem(profileId, "mojo", amount);
      currentMojos += amount;
      reward = { type: "mojo", item_id: "mojo", amount };
    } else if (roll < 35.5) {
      const amount = 3 * activeMultiplier;
      await addInventoryItem(profileId, "mojo", amount);
      currentMojos += amount;
      reward = { type: "mojo", item_id: "mojo", amount };
    }

    // ammo
    else if (roll < 48) {
      const amount = 200 * activeMultiplier;
      await addInventoryItem(profileId, "hollow", amount);
      reward = { type: "ammo", item_id: "hollow", amount };
    } else if (roll < 56) {
      const amount = 60 * activeMultiplier;
      await addInventoryItem(profileId, "explosive", amount);
      reward = { type: "ammo", item_id: "explosive", amount };
    } else if (roll < 60.5) {
      const amount = 60 * activeMultiplier;
      await addInventoryItem(profileId, "luminous", amount);
      reward = { type: "ammo", item_id: "luminous", amount };
    }

    // extras
    else if (roll < 73) {
      const amount = randomInt(4, 8) * activeMultiplier;
      await addInventoryItem(profileId, "plates", amount);
      reward = { type: "extra", item_id: "plates", amount };
    } else if (roll < 85.5) {
      const amount = randomInt(4, 8) * activeMultiplier;
      await addInventoryItem(profileId, "gunpowder", amount);
      reward = { type: "extra", item_id: "gunpowder", amount };
    }

    // harpoons
    else if (roll < 93.5) {
      const amount = randomInt(20, 50) * activeMultiplier;
      await addInventoryItem(profileId, "harpoon_1", amount);
      reward = { type: "harpoon", item_id: "harpoon_1", amount };
    } else if (roll < 97.5) {
      const amount = randomInt(5, 10) * activeMultiplier;
      await addInventoryItem(profileId, "harpoon_2", amount);
      reward = { type: "harpoon", item_id: "harpoon_2", amount };
    } else {
      const amount = randomInt(2, 5) * activeMultiplier;
      await addInventoryItem(profileId, "harpoon_3", amount);
      reward = { type: "harpoon", item_id: "harpoon_3", amount };
    }

    const { error: arubaUpdateError } = await supabase
      .from("player_aruba_state")
      .upsert(
        {
          profile_id: profileId,
          green_pieces: greenPieces,
          red_pieces: redPieces,
          blue_pieces: bluePieces,
          multiplier: nextMultiplier,
          multiplier_enabled: nextMultiplierEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (arubaUpdateError) {
      return res.status(400).json({
        success: false,
        message: arubaUpdateError.message,
      });
    }

    return res.json({
      success: true,
      reward,
      wallet: {
        pearls: currentPearls,
        mojos: currentMojos,
      },
      aruba: {
        green_pieces: greenPieces,
        red_pieces: redPieces,
        blue_pieces: bluePieces,
        multiplier: nextMultiplier,
        multiplier_enabled: nextMultiplierEnabled,
      },
      active_multiplier: activeMultiplier,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unexpected Aruba error",
    });
  }
});

router.post("/create-bonusmap", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profile_id;
    const bonusmapType = String(req.body?.bonusmap_type || "").toLowerCase();

    if (!profileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!["green", "red", "blue"].includes(bonusmapType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bonusmap type",
      });
    }

    const requiredPieces = {
      green: 30,
      red: 48,
      blue: 64,
    };

    const { data: arubaState } = await supabase
      .from("player_aruba_state")
      .select("green_pieces, red_pieces, blue_pieces")
      .eq("profile_id", profileId)
      .single();

    if (!arubaState) {
      return res.status(400).json({
        success: false,
        message: "Aruba state not found",
      });
    }

    let greenPieces: number[] = Array.isArray(arubaState.green_pieces)
      ? arubaState.green_pieces.map(Number)
      : [];

    let redPieces: number[] = Array.isArray(arubaState.red_pieces)
      ? arubaState.red_pieces.map(Number)
      : [];

    let bluePieces: number[] = Array.isArray(arubaState.blue_pieces)
      ? arubaState.blue_pieces.map(Number)
      : [];

    let currentPieces: number[] = [];

    if (bonusmapType === "green") {
      currentPieces = greenPieces;
    } else if (bonusmapType === "red") {
      currentPieces = redPieces;
    } else {
      currentPieces = bluePieces;
    }

    const required = requiredPieces[bonusmapType as keyof typeof requiredPieces];

    if (currentPieces.length < required) {
      return res.status(400).json({
        success: false,
        message: "Not enough bonusmap pieces",
      });
    }

    const { data: existingBonusmap } = await supabase
      .from("player_bonusmaps")
      .select("owned_count")
      .eq("profile_id", profileId)
      .eq("bonusmap_type", bonusmapType)
      .maybeSingle();

    let newOwnedCount = 1;

    if (existingBonusmap) {
      newOwnedCount = Number(existingBonusmap.owned_count || 0) + 1;

      await supabase
        .from("player_bonusmaps")
        .update({
          owned_count: newOwnedCount,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId)
        .eq("bonusmap_type", bonusmapType);
    } else {
      await supabase.from("player_bonusmaps").insert({
        profile_id: profileId,
        bonusmap_type: bonusmapType,
        current_wave: 0,
        owned_count: newOwnedCount,
      });
    }

    if (bonusmapType === "green") {
      greenPieces = [];
    } else if (bonusmapType === "red") {
      redPieces = [];
    } else {
      bluePieces = [];
    }

    await supabase
      .from("player_aruba_state")
      .update({
        green_pieces: greenPieces,
        red_pieces: redPieces,
        blue_pieces: bluePieces,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    return res.json({
      success: true,
      message: "Bonusmap created",
      bonusmap_type: bonusmapType,
      owned_count: newOwnedCount,
      aruba: {
        green_pieces: greenPieces,
        red_pieces: redPieces,
        blue_pieces: bluePieces,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unexpected create bonusmap error",
    });
  }
});

router.get("/state", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profile_id;

    if (!profileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    let { data: arubaState } = await supabase
      .from("player_aruba_state")
      .select("green_pieces, red_pieces, blue_pieces, multiplier, multiplier_enabled")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!arubaState) {
      const { data: createdArubaState, error: createError } = await supabase
        .from("player_aruba_state")
        .insert({
          profile_id: profileId,
          green_pieces: [],
          red_pieces: [],
          blue_pieces: [],
          multiplier: 1,
          multiplier_enabled: false,
        })
        .select("green_pieces, red_pieces, blue_pieces, multiplier, multiplier_enabled")
        .single();

      if (createError || !createdArubaState) {
        return res.status(400).json({
          success: false,
          message: createError?.message || "Could not create Aruba state",
        });
      }

      arubaState = createdArubaState;
    }

    const { data: bonusmaps, error: bonusmapError } = await supabase
      .from("player_bonusmaps")
      .select("bonusmap_type, owned_count")
      .eq("profile_id", profileId);

    if (bonusmapError) {
      return res.status(400).json({
        success: false,
        message: bonusmapError.message,
      });
    }

    const owned = {
      green: 0,
      red: 0,
      blue: 0,
    };

    for (const row of bonusmaps || []) {
      const type = String(row.bonusmap_type || "");

      if (type === "green") {
        owned.green = Number(row.owned_count || 0);
      } else if (type === "red") {
        owned.red = Number(row.owned_count || 0);
      } else if (type === "blue") {
        owned.blue = Number(row.owned_count || 0);
      }
    }

    return res.json({
      success: true,
      aruba: {
        green_pieces: arubaState.green_pieces || [],
        red_pieces: arubaState.red_pieces || [],
        blue_pieces: arubaState.blue_pieces || [],
        multiplier: Number(arubaState.multiplier || 1),
        multiplier_enabled: Boolean(arubaState.multiplier_enabled || false),
      },
      bonusmaps: owned,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unexpected Aruba state error",
    });
  }
});

router.post("/set-multiplier", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profile_id;
    const enabled = Boolean(req.body?.enabled);

    if (!profileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { data: arubaState, error } = await supabase
      .from("player_aruba_state")
      .select("multiplier, multiplier_enabled")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (!arubaState) {
      return res.status(400).json({
        success: false,
        message: "Aruba state not found",
      });
    }

    const currentMultiplier = Number(arubaState.multiplier || 1);

    if (enabled && currentMultiplier <= 1) {
      return res.status(400).json({
        success: false,
        message: "No multiplier available",
      });
    }

    const { data: updatedState, error: updateError } = await supabase
      .from("player_aruba_state")
      .update({
        multiplier_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId)
      .select("multiplier, multiplier_enabled")
      .single();

    if (updateError || !updatedState) {
      return res.status(400).json({
        success: false,
        message: updateError?.message || "Failed to update multiplier",
      });
    }

    return res.json({
      success: true,
      multiplier: Number(updatedState.multiplier || 1),
      multiplier_enabled: Boolean(updatedState.multiplier_enabled),
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unexpected set multiplier error",
    });
  }
});

export default router;