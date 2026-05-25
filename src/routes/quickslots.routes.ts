import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const setQuickslotSchema = z.object({
  slot_index: z.number().int().min(1).max(10),
  item_id: z.string().min(1).max(80),
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("player_quickslots")
    .select("slot_index, item_id")
    .eq("profile_id", profileId)
    .order("slot_index", { ascending: true });

  if (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  return res.json({
    success: true,
    quickslots: data || [],
  });
});

router.post("/set", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = setQuickslotSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid quickslot data" });
  }

  const { slot_index, item_id } = parsed.data;

  const { data, error } = await supabase
    .from("player_quickslots")
    .upsert(
      {
        profile_id: profileId,
        slot_index,
        item_id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,slot_index",
      }
    )
    .select("slot_index, item_id")
    .single();

  if (error || !data) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Could not set quickslot",
    });
  }

  return res.json({
    success: true,
    quickslot: data,
  });
});

router.delete("/:slot_index", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;
  const slotIndex = Number(req.params.slot_index);

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > 10) {
    return res.status(400).json({ success: false, message: "Invalid slot index" });
  }

  const { error } = await supabase
    .from("player_quickslots")
    .delete()
    .eq("profile_id", profileId)
    .eq("slot_index", slotIndex);

  if (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  return res.json({
    success: true,
    removed_slot: slotIndex,
  });
});

export default router;