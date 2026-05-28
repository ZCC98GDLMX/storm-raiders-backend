import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { NPC_REWARDS, MONSTER_REWARDS } from "../game/npcRewards";
import { calculatePlayerStats } from "../game/playerStats";

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

const attackSchema = z.object({
  ammo_type: z.enum(["hollow", "explosive", "luminous"]),
  use_gunpowder: z.boolean().optional(),
});

function getAmmoDamage(ammoType: "hollow" | "explosive" | "luminous"): number {
  const values: Record<string, number> = {
    hollow: 20,
    explosive: 75,
    luminous: 75,
  };

  return values[ammoType] || 20;
}

function calculateCannonVolleyDamage(params: {
  ammoType: "hollow" | "explosive" | "luminous";
  cannonCount: number;
  hitChance: number;
  damageBonusPercent: number;
  critChance: number;
  critDamageMultiplier: number;
}) {
  const ammoDamage = getAmmoDamage(params.ammoType);
  const cannonCount = Math.max(1, Math.floor(params.cannonCount));
  const hitChance = Math.max(0, Math.min(100, Number(params.hitChance || 0)));

  let hitCannons = 0;
  let baseDamage = 0;

  for (let i = 0; i < cannonCount; i++) {
    const roll = Math.random() * 100;

    if (roll <= hitChance) {
      hitCannons += 1;
      baseDamage += ammoDamage;
    }
  }

  let damage = baseDamage * (1 + Number(params.damageBonusPercent || 0) / 100);

  const criticalRoll = Math.random() * 100;
  const critical = damage > 0 && criticalRoll <= Number(params.critChance || 0);

  if (critical) {
    damage *= Number(params.critDamageMultiplier || 1.2);
  }

  return {
    damage: Math.round(damage),
    hit_cannons: hitCannons,
    total_cannons: cannonCount,
    critical,
  };
}

function getTalentValueFromLevel(level: number, values: number[]): number {
  const safeLevel = Math.max(0, Math.min(5, Number(level || 0)));

  if (safeLevel <= 0) {
    return 0;
  }

  return values[safeLevel - 1] || 0;
}

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

router.post("/attack", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = attackSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid attack data",
    });
  }

  const { ammo_type, use_gunpowder } = parsed.data;

  try {
    const stats = await calculatePlayerStats(profileId);
    const ammoCost = Math.max(1, Number(stats.equipped_cannons || 1));

    const { data: ammoItem, error: ammoError } = await supabase
      .from("player_inventory")
      .select("item_id, amount")
      .eq("profile_id", profileId)
      .eq("item_id", ammo_type)
      .maybeSingle();

    if (ammoError) {
      return res.status(400).json({
        success: false,
        message: ammoError.message,
      });
    }

    if (!ammoItem || Number(ammoItem.amount || 0) < ammoCost) {
      return res.status(400).json({
        success: false,
        message: "Not enough ammo",
        ammo_type,
        ammo_cost: ammoCost,
      });
    }

    const newAmmoAmount = Number(ammoItem.amount || 0) - ammoCost;

    const { data: updatedAmmo, error: updateAmmoError } = await supabase
      .from("player_inventory")
      .update({
        amount: newAmmoAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId)
      .eq("item_id", ammo_type)
      .select("item_id, amount")
      .single();

    if (updateAmmoError || !updatedAmmo) {
      return res.status(400).json({
        success: false,
        message: updateAmmoError?.message || "Could not consume ammo",
      });
    }

    let gunpowderConsumed = false;
    let updatedGunpowder: { item_id: string; amount: number } | null = null;

    const { data: gunpowderEquipped } = await supabase
      .from("player_equipment")
      .select("slot, item_id")
      .eq("profile_id", profileId)
      .eq("slot", "gunpowder")
      .eq("item_id", "gunpowder")
      .maybeSingle();

    const shouldUseGunpowder = Boolean(gunpowderEquipped) || use_gunpowder === true;

    if (shouldUseGunpowder) {
      const { data: gunpowderItem, error: gunpowderFetchError } = await supabase
        .from("player_inventory")
        .select("item_id, amount")
        .eq("profile_id", profileId)
        .eq("item_id", "gunpowder")
        .maybeSingle();

      if (gunpowderFetchError) {
        return res.status(400).json({
          success: false,
          message: gunpowderFetchError.message,
        });
      }

      if (gunpowderItem && Number(gunpowderItem.amount || 0) > 0) {
        const newGunpowderAmount = Number(gunpowderItem.amount || 0) - 1;

        const { data: updatedGp, error: updateGunpowderError } = await supabase
          .from("player_inventory")
          .update({
            amount: newGunpowderAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("profile_id", profileId)
          .eq("item_id", "gunpowder")
          .select("item_id, amount")
          .single();

        if (updateGunpowderError) {
          return res.status(400).json({
            success: false,
            message: updateGunpowderError.message,
          });
        }

        if (updatedGp) {
          gunpowderConsumed = true;
          updatedGunpowder = updatedGp;
        }
      }
    }

   let combatDamageBonusPercent = Number(stats.cannon_damage_bonus_percent || 0);

if (gunpowderConsumed) {
  const { data: explosiveAlchemyTalent } = await supabase
    .from("player_talents")
    .select("level")
    .eq("profile_id", profileId)
    .eq("talent_id", "explosive_alchemy")
    .maybeSingle();

  combatDamageBonusPercent += 10;
  combatDamageBonusPercent += getTalentValueFromLevel(
    Number(explosiveAlchemyTalent?.level || 0),
    [7, 9, 11, 13, 15]
  );
}



    const volley = calculateCannonVolleyDamage({
      ammoType: ammo_type,
      cannonCount: ammoCost,
      hitChance: Number(stats.hit_chance || 0),
      damageBonusPercent: combatDamageBonusPercent,
      critChance: Number(stats.crit_chance || 0),
      critDamageMultiplier: Number(stats.crit_damage_multiplier || 1.2),
    });

    const damage = volley.damage;
    const critical = volley.critical;

    return res.json({
      success: true,
            attack: {
        ammo_type,
        ammo_cost: ammoCost,

        // Ya no usamos miss global.
        // hit=true significa que el disparo/volley existió.
        hit: true,

        critical,
        damage,

        hit_cannons: volley.hit_cannons,
        total_cannons: volley.total_cannons,

        hit_chance: Number(stats.hit_chance || 0),
        crit_chance: Number(stats.crit_chance || 0),
        damage_bonus_percent: combatDamageBonusPercent,
        reload_time: Number(stats.reload_time || 0),
        cannon_range: Number(stats.cannon_range || 0),
        gunpowder_consumed: gunpowderConsumed,
      },
      inventory: {
        ammo: updatedAmmo,
        gunpowder: updatedGunpowder,
      },
      stats,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not process attack",
    });
  }
});

export default router;