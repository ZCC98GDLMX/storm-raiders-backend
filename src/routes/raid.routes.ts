import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const enterRaidSchema = z.object({
  from_map_id: z.string().min(1).max(40),
  from_map_path: z.string().min(1).max(200),
});

const exitRaidSchema = z.object({
  map_id: z.string().min(1).max(40),
  map_path: z.string().min(1).max(200),
  position_x: z.number(),
  position_y: z.number(),
});

router.post("/sunraid/enter", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = enterRaidSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid raid enter data" });
  }

  const { data: medallion, error: medallionError } = await supabase
    .from("player_inventory")
    .select("item_id, amount")
    .eq("profile_id", profileId)
    .eq("item_id", "light_medallion")
    .maybeSingle();

  if (medallionError) {
    return res.status(400).json({ success: false, message: medallionError.message });
  }

  if (!medallion || Number(medallion.amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Not enough light medallions",
    });
  }

  const newAmount = Number(medallion.amount) - 1;

  const { data: updatedItem, error: consumeError } = await supabase
    .from("player_inventory")
    .update({
      amount: newAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .eq("item_id", "light_medallion")
    .select("item_id, amount")
    .single();

  if (consumeError || !updatedItem) {
    return res.status(400).json({
      success: false,
      message: consumeError?.message || "Could not consume light medallion",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .update({
      map_id: "sunraid",
      map_path: "res://scenes/world/sunraidmap.tscn",
      position_x: 600,
      position_y: 400,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (stateError || !state) {
    return res.status(400).json({
      success: false,
      message: stateError?.message || "Could not enter Sun Raid",
    });
  }

  return res.json({
    success: true,
    inventory_item: updatedItem,
    state,
    raid: {
      map_id: "sunraid",
      map_path: "res://scenes/world/sunraidmap.tscn",
      position_x: 600,
      position_y: 400,
    },
  });
});

router.post("/sunraid/exit", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = exitRaidSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid raid exit data" });
  }

  const { map_id, map_path, position_x, position_y } = parsed.data;

  const { data: state, error } = await supabase
    .from("player_state")
    .update({
      map_id,
      map_path,
      position_x,
      position_y,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (error || !state) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Could not exit Sun Raid",
    });
  }

  return res.json({
    success: true,
    state,
  });
});

export default router;