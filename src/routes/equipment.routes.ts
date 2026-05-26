import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const equipSchema = z.object({
  slot: z.string().min(1).max(40),
  item_id: z.string().min(1).max(80),
  amount: z.number().int().min(1).max(1000).optional(),
});

const unequipSchema = z.object({
  slot: z.string().min(1).max(40),
  amount: z.number().int().min(1).max(1000).optional(),
});

const SHIPS = new Set([
  "red_korsar_1", "red_korsar_2", "red_korsar_3",
  "renegados_1", "renegados_2", "renegados_3",
  "wild_1", "wild_2", "wild_3",
  "tortuga_1", "tortuga_2", "tortuga_3",
  "sinclair_1", "sinclair_2", "sinclair_3",
  "ratpack_1", "ratpack_2", "ratpack_3",
  "little_buccaneer", "elite",
  "dark_mojo", "venom", "skull_crossbones", "skull_crossbones_2",
]);

const CANNONS = new Set([
  "cannon_30lb",
  "cannon_50lb",
  "cannon_55lb",
  "almirant_cannon",
]);

const SAILS = new Set([
  "sails_1",
  "sails_2",
  "sails_3",
]);

const HARPOONS = new Set([
  "harpoon_1",
  "harpoon_2",
  "harpoon_3",
]);

const PIRATE_SLOTS: Record<string, string> = {
  pirate_1: "basic_pirates",
  pirate_2: "experienced_pirates",
  captain_1: "captain",
  captain_2: "captain",
  gunner_1: "gunner",
  foreman_1: "boatswain",
  foreman_2: "boatswain",
  foreman_3: "boatswain",
  foreman_4: "boatswain",
  lookout_1: "lookout",
  lookout_2: "lookout",
  slave_1: "slave",
  slave_2: "slave",
  slave_3: "slave",
};

const EQUIPPABLE_ITEMS = new Set([
  "plates",
  "gunpowder",
]);

const STATIC_VALID_SLOTS = new Set([
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
  "basic_pirates",
  "experienced_pirates",
]);

function isValidSlot(slot: string): boolean {
  if (STATIC_VALID_SLOTS.has(slot)) return true;

  if (/^cannon_\d+$/.test(slot)) {
    const number = Number(slot.replace("cannon_", ""));
    return number >= 1 && number <= 109;
  }

  if (/^sail_\d+$/.test(slot)) {
    const number = Number(slot.replace("sail_", ""));
    return number >= 1 && number <= 3;
  }

  return false;
}

function getShipMaxCannons(shipId: string, eliteLevel = 1): number {
  eliteLevel = Math.max(1, Math.min(10, eliteLevel));

  if (
    shipId === "elite" ||
    shipId === "dark_mojo" ||
    shipId === "venom" ||
    shipId === "skull_crossbones" ||
    shipId === "skull_crossbones_2"
  ) {
    return 100 + (eliteLevel - 1);
  }

  if (shipId === "little_buccaneer") return 75;

  const values: Record<string, number> = {
    red_korsar_1: 5,
    red_korsar_2: 8,
    red_korsar_3: 10,
    renegados_1: 15,
    renegados_2: 16,
    renegados_3: 18,
    wild_1: 20,
    wild_2: 23,
    wild_3: 25,
    tortuga_1: 25,
    tortuga_2: 26,
    tortuga_3: 28,
    sinclair_1: 30,
    sinclair_2: 32,
    sinclair_3: 35,
    ratpack_1: 40,
    ratpack_2: 45,
    ratpack_3: 50,
  };

  return values[shipId] || 5;
}

function getShipMaxSails(shipId: string): number {
  if (
    shipId === "little_buccaneer" ||
    shipId === "elite" ||
    shipId === "dark_mojo" ||
    shipId === "venom" ||
    shipId === "skull_crossbones" ||
    shipId === "skull_crossbones_2"
  ) {
    return 3;
  }

  if (shipId.endsWith("_1")) return 1;
  if (shipId.endsWith("_2")) return 2;
  if (shipId.endsWith("_3")) return 3;

  return 1;
}

function itemMatchesSlot(slot: string, itemId: string): boolean {
  if (slot === "ship") return SHIPS.has(itemId);
  if (/^cannon_\d+$/.test(slot)) return CANNONS.has(itemId);
  if (/^sail_\d+$/.test(slot)) return SAILS.has(itemId);
  if (slot === "harpoon") return HARPOONS.has(itemId);
  if (slot === "plates") return itemId === "plates";
  if (slot === "gunpowder") return itemId === "gunpowder";

  if (slot === "basic_pirates") return itemId === "pirate_1";
  if (slot === "experienced_pirates") return itemId === "pirate_2";

  if (PIRATE_SLOTS[itemId]) {
    return PIRATE_SLOTS[itemId] === slot;
  }

  return EQUIPPABLE_ITEMS.has(itemId) && slot === itemId;
}

async function getCurrentShip(profileId: string): Promise<string> {
  const { data } = await supabase
    .from("player_equipment")
    .select("item_id")
    .eq("profile_id", profileId)
    .eq("slot", "ship")
    .maybeSingle();

  return String(data?.item_id || "red_korsar_1");
}

async function validateCapacity(profileId: string, slot: string, itemId: string): Promise<string | null> {
  const shipId = slot === "ship" ? itemId : await getCurrentShip(profileId);
  const eliteLevel = await getUnlockedEliteLevel(profileId);

  if (/^cannon_\d+$/.test(slot)) {
    const number = Number(slot.replace("cannon_", ""));

    if (number > getShipMaxCannons(shipId, eliteLevel)) {
      return "Cannon slot exceeds ship capacity";
    }
  }

  if (/^sail_\d+$/.test(slot)) {
    const number = Number(slot.replace("sail_", ""));

    if (number > getShipMaxSails(shipId)) {
      return "Sail slot exceeds ship capacity";
    }
  }

  return null;
}

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
  const amount = parsed.data.amount || 1;

  if (!isValidSlot(slot)) {
    return res.status(400).json({ success: false, message: "Invalid equipment slot" });
  }

  if (!itemMatchesSlot(slot, item_id)) {
    return res.status(400).json({
      success: false,
      message: "Item does not match equipment slot",
    });
  }

  const capacityError = await validateCapacity(profileId, slot, item_id);

  if (capacityError) {
    return res.status(400).json({
      success: false,
      message: capacityError,
    });
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

  if (slot === "basic_pirates" || slot === "experienced_pirates") {
    const shipId = await getCurrentShip(profileId);
    const maxPirates = getShipMaxPirates(shipId) + await getCommanderBonus(profileId);
    const currentlyEquipped = await getCurrentlyEquippedPirates(profileId);

    const { data: existingPirateSlot } = await supabase
      .from("player_equipment")
      .select("amount")
      .eq("profile_id", profileId)
      .eq("slot", slot)
      .maybeSingle();

    const currentSlotAmount = Number(existingPirateSlot?.amount || 0);
    const newSlotAmount = currentSlotAmount + amount;

    if (currentlyEquipped + amount > maxPirates) {
      return res.status(400).json({
        success: false,
        message: "Pirate capacity exceeded",
      });
    }

    if (newSlotAmount > Number(inventoryItem.amount || 0)) {
      return res.status(400).json({
        success: false,
        message: "Not enough pirates owned",
      });
    }

    const { data: equipment, error: equipError } = await supabase
      .from("player_equipment")
      .upsert(
        {
          profile_id: profileId,
          slot,
          item_id,
          amount: newSlotAmount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,slot" }
      )
      .select("slot, item_id, amount")
      .single();

    if (equipError || !equipment) {
      return res.status(400).json({
        success: false,
        message: equipError?.message || "Could not equip pirates",
      });
    }

    const { data: allEquipment } = await supabase
      .from("player_equipment")
      .select("slot, item_id, amount")
      .eq("profile_id", profileId);

    return res.json({
      success: true,
      equipped: equipment,
      equipment: allEquipment || [],
    });
  }

  const { data: equipment, error: equipError } = await supabase
    .from("player_equipment")
    .upsert(
      {
        profile_id: profileId,
        slot,
        item_id,
        amount: 1,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,slot",
      }
    )
    .select("slot, item_id, amount")
    .single();

  if (equipError || !equipment) {
    return res.status(400).json({
      success: false,
      message: equipError?.message || "Could not equip item",
    });
  }

  const { data: allEquipment } = await supabase
    .from("player_equipment")
    .select("slot, item_id, amount")
    .eq("profile_id", profileId);

  return res.json({
    success: true,
    equipped: equipment,
    equipment: allEquipment || [],
  });
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
  const amount = parsed.data.amount || 1;

  if (!isValidSlot(slot)) {
    return res.status(400).json({ success: false, message: "Invalid equipment slot" });
  }

  if (slot === "basic_pirates" || slot === "experienced_pirates") {
    const { data: existingSlot, error: fetchError } = await supabase
      .from("player_equipment")
      .select("amount")
      .eq("profile_id", profileId)
      .eq("slot", slot)
      .maybeSingle();

    if (fetchError) {
      return res.status(400).json({
        success: false,
        message: fetchError.message,
      });
    }

    const currentAmount = Number(existingSlot?.amount || 0);
    const newAmount = Math.max(0, currentAmount - amount);

    if (newAmount <= 0) {
      const { error: deleteError } = await supabase
        .from("player_equipment")
        .delete()
        .eq("profile_id", profileId)
        .eq("slot", slot);

      if (deleteError) {
        return res.status(400).json({
          success: false,
          message: deleteError.message,
        });
      }
    } else {
      const { error: updateError } = await supabase
        .from("player_equipment")
        .update({
          amount: newAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId)
        .eq("slot", slot);

      if (updateError) {
        return res.status(400).json({
          success: false,
          message: updateError.message,
        });
      }
    }

    const { data: allEquipment } = await supabase
      .from("player_equipment")
      .select("slot, item_id, amount")
      .eq("profile_id", profileId);

    return res.json({
      success: true,
      removed_slot: slot,
      equipment: allEquipment || [],
    });
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
    .select("slot, item_id, amount")
    .eq("profile_id", profileId);

  return res.json({
    success: true,
    removed_slot: slot,
    equipment: allEquipment || [],
  });
});

function getEliteLevelFromElitePoints(points: number): number {
  const requirements = [
    0,
    40000,
    72400,
    128872,
    225526,
    387905,
    655559,
    1088228,
    1773811,
    2838098,
  ];

  let level = 1;

  for (let i = 0; i < requirements.length; i++) {
    if (points >= requirements[i]) {
      level = i + 1;
    }
  }

  return Math.max(1, Math.min(10, level));
}

async function getUnlockedEliteLevel(profileId: string): Promise<number> {
  const { data } = await supabase
    .from("player_state")
    .select("elite_points")
    .eq("profile_id", profileId)
    .maybeSingle();

  return getEliteLevelFromElitePoints(Number(data?.elite_points || 0));
}

function getShipMaxPirates(shipId: string): number {
  if (
    shipId === "elite" ||
    shipId === "dark_mojo" ||
    shipId === "venom" ||
    shipId === "skull_crossbones" ||
    shipId === "skull_crossbones_2"
  ) {
    return 200;
  }

  if (shipId === "little_buccaneer") return 150;

  const values: Record<string, number> = {
    red_korsar_1: 20,
    red_korsar_2: 25,
    red_korsar_3: 30,

    renegados_1: 40,
    renegados_2: 45,
    renegados_3: 50,

    wild_1: 55,
    wild_2: 60,
    wild_3: 65,

    tortuga_1: 70,
    tortuga_2: 75,
    tortuga_3: 80,

    sinclair_1: 85,
    sinclair_2: 90,
    sinclair_3: 95,

    ratpack_1: 100,
    ratpack_2: 100,
    ratpack_3: 100,
  };

  return values[shipId] || 20;
}

async function getCommanderBonus(profileId: string): Promise<number> {
  const { data } = await supabase
    .from("player_equipment")
    .select("item_id")
    .eq("profile_id", profileId)
    .eq("slot", "captain")
    .maybeSingle();

  const captain = String(data?.item_id || "");

  if (captain === "captain_1") return 10;
  if (captain === "captain_2") return 20;

  return 0;
}

async function getCurrentlyEquippedPirates(profileId: string): Promise<number> {
  const { data } = await supabase
    .from("player_equipment")
    .select("slot, amount")
    .eq("profile_id", profileId)
    .in("slot", ["basic_pirates", "experienced_pirates"]);

  let total = 0;

  for (const row of data || []) {
    total += Number(row.amount || 0);
  }

  return total;
}

export default router;