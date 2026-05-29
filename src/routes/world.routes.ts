import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const presenceSchema = z.object({
  map_id: z.string().min(1),
  map_path: z.string().optional(),
  position_x: z.number(),
  position_y: z.number(),
  current_hp: z.number().min(0),
  max_hp: z.number().min(0),
  is_sunk: z.boolean().optional(),
  ship_id: z.string().optional(),
});

router.post("/presence", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = presenceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid presence data",
      issues: parsed.error.flatten(),
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({
      success: false,
      message: "Profile not found",
    });
  }

  const payload = {
    profile_id: profileId,
    username: profile.username,
    map_id: parsed.data.map_id,
    map_path: parsed.data.map_path || "",
    position_x: parsed.data.position_x,
    position_y: parsed.data.position_y,
    current_hp: parsed.data.current_hp,
    max_hp: parsed.data.max_hp,
    is_sunk: parsed.data.is_sunk ?? false,
    ship_id: parsed.data.ship_id || "",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("player_presence")
    .upsert(payload, { onConflict: "profile_id" })
    .select("*")
    .single();

  if (error || !data) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Could not update player presence",
    });
  }

  return res.json({
    success: true,
    presence: data,
  });
});

router.get("/players", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;
  const mapId = String(req.query.map_id || "");

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!mapId) {
    return res.status(400).json({
      success: false,
      message: "map_id is required",
    });
  }

  const since = new Date(Date.now() - 30000).toISOString();

  const { data, error } = await supabase
    .from("player_presence")
    .select("*")
    .eq("map_id", mapId)
    .neq("profile_id", profileId)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.json({
    success: true,
    players: data || [],
  });
});

router.delete("/presence", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { error } = await supabase
    .from("player_presence")
    .delete()
    .eq("profile_id", profileId);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.json({
    success: true,
  });
});

export default router;