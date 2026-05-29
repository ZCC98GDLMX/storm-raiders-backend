import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { z } from "zod";
import { calculatePlayerStats } from "../game/playerStats";

const router = Router();
const updateStateSchema = z.object({
  map_id: z.string().min(1).optional(),
  map_path: z.string().min(1).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  current_hp: z.number().min(0).optional(),

  level: z.number().min(1).optional(),
  current_xp: z.number().min(0).optional(),
  gold: z.number().min(0).optional(),
  pearls: z.number().min(0).optional(),
  crystals: z.number().min(0).optional(),

  turtle_light_time_left: z.number().min(0).optional(),

  crystal_gift_time_left: z.number().min(0).optional(),
  crystal_gift_cooldown_left: z.number().min(0).optional(),

  triton_bless_cooldown_left: z.number().min(0).optional(),

  rocket_damage_cooldown_left: z.number().min(0).optional(),
  rocket_slow_cooldown_left: z.number().min(0).optional(),
  mission_progress: z.record(z.string(), z.any()).optional(),
  claimed_missions: z.record(z.string(), z.any()).optional(),
  active_mission_id: z.string().optional(),

  active_pirate_test_id: z.string().optional(),
  pirate_test_progress: z.record(z.string(), z.any()).optional(),
  pirate_test_time_left: z.number().min(0).optional(),
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, email, created_at")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({
      success: false,
      message: "Profile not found",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("*")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(404).json({
      success: false,
      message: "Player state not found",
    });
  }

  const premiumExpiresAt = state.premium_expires_at
  ? new Date(state.premium_expires_at).getTime()
  : 0;

const premiumTimeLeft = premiumExpiresAt > 0
  ? Math.max(0, Math.floor((premiumExpiresAt - Date.now()) / 1000))
  : 0;

const stateWithPremium = {
  ...state,
  premium_time_left: premiumTimeLeft,
  is_premium: premiumTimeLeft > 0,
};

  return res.json({
    success: true,
    profile,
    state: stateWithPremium,
  });
});

router.patch("/state", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const parsed = updateStateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid state data",
    });
  }

  const updates = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { data: state, error } = await supabase
    .from("player_state")
    .update(updates)
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (error || !state) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Could not update player state",
    });
  }

  const premiumExpiresAt = state.premium_expires_at
  ? new Date(state.premium_expires_at).getTime()
  : 0;

const premiumTimeLeft = premiumExpiresAt > 0
  ? Math.max(0, Math.floor((premiumExpiresAt - Date.now()) / 1000))
  : 0;

const stateWithPremium = {
  ...state,
  premium_time_left: premiumTimeLeft,
  is_premium: premiumTimeLeft > 0,
};

  return res.json({
    success: true,
    state: stateWithPremium,
  });
});

router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const stats = await calculatePlayerStats(profileId);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not calculate player stats",
    });
  }
});

export default router;