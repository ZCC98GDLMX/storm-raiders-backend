import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

type ShopItem = {
  id: string;
  currency: "gold" | "pearls" | "crystals";
  price: number;
  amount: number;
  unique?: boolean;
};

const SHOP_ITEMS: Record<string, ShopItem> = {
  hollow: { id: "hollow", currency: "gold", price: 30000, amount: 1000 },
  explosive: { id: "explosive", currency: "pearls", price: 500, amount: 1000 },
  luminous: { id: "luminous", currency: "pearls", price: 500, amount: 1000 },

  harpoon_1: { id: "harpoon_1", currency: "gold", price: 1000, amount: 10 },
  harpoon_2: { id: "harpoon_2", currency: "gold", price: 5000, amount: 10 },
  harpoon_3: { id: "harpoon_3", currency: "pearls", price: 1000, amount: 10 },

  cannon_30lb: { id: "cannon_30lb", currency: "gold", price: 10000, amount: 1 },
  cannon_50lb: { id: "cannon_50lb", currency: "pearls", price: 6500, amount: 1 },
  cannon_55lb: { id: "cannon_55lb", currency: "pearls", price: 7500, amount: 1 },
  almirant_cannon: { id: "almirant_cannon", currency: "pearls", price: 7500, amount: 1 },

  sails_1: { id: "sails_1", currency: "gold", price: 25000, amount: 1 },
  sails_2: { id: "sails_2", currency: "gold", price: 75000, amount: 1 },
  sails_3: { id: "sails_3", currency: "pearls", price: 500, amount: 1 },

  red_korsar_1: { id: "red_korsar_1", currency: "gold", price: 0, amount: 1, unique: true },
  red_korsar_2: { id: "red_korsar_2", currency: "gold", price: 50000, amount: 1, unique: true },
  red_korsar_3: { id: "red_korsar_3", currency: "gold", price: 75000, amount: 1, unique: true },

  rocket_damage: { id: "rocket_damage",  currency: "pearls",  price: 500,  amount: 1,},
  rocket_slow: { id: "rocket_slow",  currency: "pearls",  price: 500,  amount: 1,},

  plates: { id: "plates",  currency: "gold",  price: 1000000,  amount: 100,},
  gunpowder: {  id: "gunpowder",  currency: "gold",  price: 2000000,  amount: 100,},

};

const buySchema = z.object({
  item_id: z.string().min(1).max(80),
});

router.post("/buy", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const parsed = buySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid buy data" });
  }

  const itemId = parsed.data.item_id;
  const item = SHOP_ITEMS[itemId];

  if (!item) {
    return res.status(404).json({ success: false, message: "Item not found in shop" });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("gold, pearls, crystals")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(404).json({ success: false, message: "Player state not found" });
  }

  const currentCurrency = Number(state[item.currency] || 0);

  if (currentCurrency < item.price) {
    return res.status(400).json({
      success: false,
      message: `Not enough ${item.currency}`,
    });
  }

  const { data: existingInventory } = await supabase
    .from("player_inventory")
    .select("amount")
    .eq("profile_id", profileId)
    .eq("item_id", item.id)
    .maybeSingle();

  if (item.unique && existingInventory && Number(existingInventory.amount) > 0) {
    return res.status(400).json({
      success: false,
      message: "Item already owned",
    });
  }

  const newCurrencyAmount = currentCurrency - item.price;

  const { data: updatedState, error: updateStateError } = await supabase
    .from("player_state")
    .update({
      [item.currency]: newCurrencyAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (updateStateError || !updatedState) {
    return res.status(400).json({
      success: false,
      message: updateStateError?.message || "Could not update currency",
    });
  }

  const newAmount = Number(existingInventory?.amount || 0) + item.amount;

  const { data: updatedInventory, error: inventoryError } = await supabase
    .from("player_inventory")
    .upsert({
      profile_id: profileId,
      item_id: item.id,
      amount: newAmount,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "profile_id,item_id",
    })
    .select("item_id, amount")
    .single();

  if (inventoryError || !updatedInventory) {
    return res.status(400).json({
      success: false,
      message: inventoryError?.message || "Could not update inventory",
    });
  }

  return res.json({
    success: true,
    purchased: {
      item_id: item.id,
      amount: item.amount,
      currency: item.currency,
      price: item.price,
    },
    state: updatedState,
    inventory_item: updatedInventory,
  });
});

export default router;