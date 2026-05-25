import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

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
    .select("slot, item_id")
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

export default router;