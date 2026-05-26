import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { z } from "zod";

const router = Router();

const consumeSchema = z.object({
  item_id: z.string().min(1).max(80),
  amount: z.number().int().min(1).max(100000),
});

const CONSUMABLE_ITEMS = new Set([
  "hollow",
  "explosive",
  "luminous",

  "harpoon_1",
  "harpoon_2",
  "harpoon_3",

  "gunpowder",
  "plates",
  "crystal_gift",
  "light_medallion",
  "turtle_light",
  "triton_bless",

  "rocket_damage",
  "rocket_slow",
]);

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { data: inventory, error: inventoryError } = await supabase
    .from("player_inventory")
    .select("item_id, amount")
    .eq("profile_id", profileId);

  if (inventoryError) {
    return res.status(400).json({ success: false, message: inventoryError.message });
  }

  const { data: equipment, error: equipmentError } = await supabase
  .from("player_equipment")
  .select("slot, item_id, amount")
  .eq("profile_id", profileId);

  if (equipmentError) {
    return res.status(400).json({ success: false, message: equipmentError.message });
  }

  return res.json({
    success: true,
    inventory: inventory || [],
    equipment: equipment || [],
  });
});

router.post("/consume", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = consumeSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid consume data" });
  }

  const { item_id, amount } = parsed.data;

  if (!CONSUMABLE_ITEMS.has(item_id)) {
    return res.status(400).json({
      success: false,
      message: "This item cannot be consumed",
    });
  }

  const { data: inventoryItem, error: fetchError } = await supabase
    .from("player_inventory")
    .select("item_id, amount")
    .eq("profile_id", profileId)
    .eq("item_id", item_id)
    .maybeSingle();

  if (fetchError) {
    return res.status(400).json({ success: false, message: fetchError.message });
  }

  if (!inventoryItem || Number(inventoryItem.amount) < amount) {
    return res.status(400).json({
      success: false,
      message: "Not enough item amount",
    });
  }

  const newAmount = Number(inventoryItem.amount) - amount;

  const { data: updatedItem, error: updateError } = await supabase
    .from("player_inventory")
    .update({
      amount: newAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .eq("item_id", item_id)
    .select("item_id, amount")
    .single();

  if (updateError || !updatedItem) {
    return res.status(400).json({
      success: false,
      message: updateError?.message || "Could not consume item",
    });
  }

  return res.json({
    success: true,
    consumed: {
      item_id,
      amount,
    },
    inventory_item: updatedItem,
  });
});

export default router;