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

  renegados_1: { id: "renegados_1", currency: "gold", price: 100000, amount: 1, unique: true },
  renegados_2: { id: "renegados_2", currency: "gold", price: 150000, amount: 1, unique: true },
  renegados_3: { id: "renegados_3", currency: "gold", price: 200000, amount: 1, unique: true },

  wild_1: { id: "wild_1", currency: "gold", price: 250000, amount: 1, unique: true },
  wild_2: { id: "wild_2", currency: "gold", price: 500000, amount: 1, unique: true },
  wild_3: { id: "wild_3", currency: "gold", price: 750000, amount: 1, unique: true },

  tortuga_1: { id: "tortuga_1", currency: "gold", price: 1000000, amount: 1, unique: true },
  tortuga_2: { id: "tortuga_2", currency: "gold", price: 1500000, amount: 1, unique: true },
  tortuga_3: { id: "tortuga_3", currency: "gold", price: 2000000, amount: 1, unique: true },

  sinclair_1: { id: "sinclair_1", currency: "gold", price: 2250000, amount: 1, unique: true },
  sinclair_2: { id: "sinclair_2", currency: "gold", price: 2500000, amount: 1, unique: true },
  sinclair_3: { id: "sinclair_3", currency: "gold", price: 2750000, amount: 1, unique: true },

  ratpack_1: { id: "ratpack_1", currency: "gold", price: 3000000, amount: 1, unique: true },
  ratpack_2: { id: "ratpack_2", currency: "gold", price: 4000000, amount: 1, unique: true },
  ratpack_3: { id: "ratpack_3", currency: "gold", price: 6000000, amount: 1, unique: true },

  little_buccaneer: { id: "little_buccaneer", currency: "pearls", price: 30000, amount: 1, unique: true },
  elite: { id: "elite", currency: "pearls", price: 75000, amount: 1, unique: true },

  rocket_damage: { id: "rocket_damage",  currency: "pearls",  price: 500,  amount: 1,},
  rocket_slow: { id: "rocket_slow",  currency: "pearls",  price: 500,  amount: 1,},

  plates: { id: "plates",  currency: "gold",  price: 1000000,  amount: 100,},
  gunpowder: {  id: "gunpowder",  currency: "gold",  price: 2000000,  amount: 100,},
  turtle_light: { id: "turtle_light", currency: "pearls", price: 2500, amount: 1 },
  crystal_gift: { id: "crystal_gift", currency: "pearls", price: 300, amount: 1 },
  triton_bless: { id: "triton_bless", currency: "pearls", price: 500, amount: 1 },
  light_medallion: { id: "light_medallion", currency: "pearls", price: 400, amount: 1 },

  pirate_1: { id: "pirate_1", currency: "gold", price: 250, amount: 1 },
  pirate_2: { id: "pirate_2", currency: "pearls", price: 5, amount: 1 },

  captain_1: { id: "captain_1", currency: "pearls", price: 25000, amount: 1 },
  captain_2: { id: "captain_2", currency: "pearls", price: 50000, amount: 1 },

  foreman_1: { id: "foreman_1", currency: "gold", price: 10800, amount: 1 },
  foreman_2: { id: "foreman_2", currency: "gold", price: 99000, amount: 1 },
  foreman_3: { id: "foreman_3", currency: "pearls", price: 29000, amount: 1 },
  foreman_4: { id: "foreman_4", currency: "pearls", price: 60000, amount: 1 },

  lookout_1: { id: "lookout_1", currency: "gold", price: 10000, amount: 1 },
  lookout_2: { id: "lookout_2", currency: "pearls", price: 15000, amount: 1 },

  gunner_1: { id: "gunner_1", currency: "pearls", price: 19000, amount: 1 },

  slave_1: { id: "slave_1", currency: "gold", price: 10000, amount: 1 },
  slave_2: { id: "slave_2", currency: "gold", price: 25000, amount: 1 },
  slave_3: { id: "slave_3", currency: "pearls", price: 500, amount: 1 },

  crystals: { id: "crystals", currency: "pearls", price: 308, amount: 1 },


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