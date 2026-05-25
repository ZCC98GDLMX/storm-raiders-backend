import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const equipSchema = z.object({
  slot: z.string().min(1).max(40),
  item_id: z.string().min(1).max(80),
});

const VALID_SLOTS = new Set([
  "ship",
  "harpoon",
  "pirate",
  "captain",
  "gunner",
  "boatswain",
  "lookout",
  "slave",
  "plates",
  "gunpowder",
  "sail_1",
  "sail_2",
  "sail_3",
  "cannon_1",
  "cannon_2",
  "cannon_3",
  "cannon_4",
  "cannon_5",
  "cannon_6",
  "cannon_7",
  "cannon_8",
  "cannon_9",
  "cannon_10"
]);

router.post("/equip", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = equipSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid equip data" });
  }

  const { slot, item_id } = parsed.data;

  if (!VALID_SLOTS.has(slot)) {
    return res.status(400).json({ success: false, message: "Invalid equipment slot" });
  }

  const { data: inventoryItem, error: inventoryError } = await supabase
    .from("player_inventory")
    .select("amount")
    .eq("profile_id", profileId)
    .eq("item_id", item_id)
    .maybeSingle();

  if (inventoryError) {
    return res.status(400).json({ success: false, message: inventoryError.message });
  }

  if (!inventoryItem || Number(inventoryItem.amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Item not owned",
    });
  }

  const { data: equipment, error: equipError } = await supabase
    .from("player_equipment")
    .upsert(
      {
        profile_id: profileId,
        slot,
        item_id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,slot",
      }
    )
    .select("slot, item_id")
    .single();

  if (equipError || !equipment) {
    return res.status(400).json({
      success: false,
      message: equipError?.message || "Could not equip item",
    });
  }

  const { data: allEquipment } = await supabase
    .from("player_equipment")
    .select("slot, item_id")
    .eq("profile_id", profileId);

  return res.json({
    success: true,
    equipped: equipment,
    equipment: allEquipment || [],
  });
});

const unequipSchema = z.object({
  slot: z.string().min(1).max(40),
});

router.post("/unequip", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = unequipSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid unequip data" });
  }

  const { slot } = parsed.data;

  if (!VALID_SLOTS.has(slot)) {
    return res.status(400).json({ success: false, message: "Invalid equipment slot" });
  }

  const { error } = await supabase
    .from("player_equipment")
    .delete()
    .eq("profile_id", profileId)
    .eq("slot", slot);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const { data: allEquipment } = await supabase
    .from("player_equipment")
    .select("slot, item_id")
    .eq("profile_id", profileId);

  return res.json({
    success: true,
    removed_slot: slot,
    equipment: allEquipment || [],
  });
});

export default router;