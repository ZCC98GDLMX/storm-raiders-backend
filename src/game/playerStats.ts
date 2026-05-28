import { supabase } from "../db/supabase";

type EquipmentRow = {
  slot: string;
  item_id: string;
  amount?: number | null;
};

type TalentRow = {
  talent_id: string;
  level: number;
};

const ELITE_REQUIREMENTS = [
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

function getEliteLevelFromElitePoints(points: number): number {
  let level = 1;

  for (let i = 0; i < ELITE_REQUIREMENTS.length; i++) {
    if (points >= ELITE_REQUIREMENTS[i]) {
      level = i + 1;
    }
  }

  return Math.max(1, Math.min(10, level));
}

function isSpellActive(value: unknown): boolean {
  if (!value) return false;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() > Date.now();
}

function getTalentLevel(talents: Record<string, number>, talentId: string): number {
  return Math.max(0, Math.min(5, Number(talents[talentId] || 0)));
}

function getTalentValue(
  talents: Record<string, number>,
  talentId: string,
  values: number[]
): number {
  const level = getTalentLevel(talents, talentId);
  if (level <= 0) return 0;
  return values[level - 1] || 0;
}

function getShipStats(shipId: string, eliteLevel: number) {
  const eliteStats = {
    hp: 100000 + ((eliteLevel - 1) * 5000),
    cannons: 100 + (eliteLevel - 1),
    speed: 100,
    sails: 3,
  };

  if (
    shipId === "elite" ||
    shipId === "dark_mojo" ||
    shipId === "venom" ||
    shipId === "skull_crossbones" ||
    shipId === "skull_crossbones_2"
  ) {
    return eliteStats;
  }

  const ships: Record<string, any> = {
    red_korsar_1: { hp: 5000, cannons: 5, speed: 65, sails: 1 },
    red_korsar_2: { hp: 7500, cannons: 8, speed: 65, sails: 2 },
    red_korsar_3: { hp: 10000, cannons: 10, speed: 65, sails: 3 },

    renegados_1: { hp: 10000, cannons: 15, speed: 65, sails: 1 },
    renegados_2: { hp: 12500, cannons: 16, speed: 65, sails: 2 },
    renegados_3: { hp: 15000, cannons: 18, speed: 65, sails: 3 },

    wild_1: { hp: 15000, cannons: 20, speed: 65, sails: 1 },
    wild_2: { hp: 17500, cannons: 23, speed: 65, sails: 2 },
    wild_3: { hp: 20000, cannons: 25, speed: 65, sails: 3 },

    tortuga_1: { hp: 20000, cannons: 25, speed: 65, sails: 1 },
    tortuga_2: { hp: 25000, cannons: 26, speed: 65, sails: 2 },
    tortuga_3: { hp: 30000, cannons: 28, speed: 65, sails: 3 },

    sinclair_1: { hp: 35000, cannons: 30, speed: 65, sails: 1 },
    sinclair_2: { hp: 40000, cannons: 32, speed: 65, sails: 2 },
    sinclair_3: { hp: 45000, cannons: 35, speed: 65, sails: 3 },

    ratpack_1: { hp: 50000, cannons: 40, speed: 65, sails: 1 },
    ratpack_2: { hp: 55000, cannons: 45, speed: 65, sails: 2 },
    ratpack_3: { hp: 60000, cannons: 50, speed: 65, sails: 3 },

    little_buccaneer: { hp: 75000, cannons: 75, speed: 100, sails: 3 },
  };

  return ships[shipId] || ships.red_korsar_1;
}

function getCannonStats(cannonId: string) {
  const combatRangeScale = 0.5;

  const cannons: Record<string, any> = {
    cannon_30lb: { damage: 20, range: 360 * combatRangeScale, hit_chance: 45, reload: 10 },
    cannon_50lb: { damage: 40, range: 500 * combatRangeScale, hit_chance: 75, reload: 7 },
    cannon_55lb: { damage: 40, range: 600 * combatRangeScale, hit_chance: 75, reload: 7 },
    almirant_cannon: { damage: 40, range: 500 * combatRangeScale, hit_chance: 75, reload: 7 },
  };

  return cannons[cannonId] || cannons.cannon_30lb;
}

function getSailSpeedBonus(sailId: string): number {
  const values: Record<string, number> = {
    sails_1: 20,
    sails_2: 25,
    sails_3: 30,
  };

  return values[sailId] || 0;
}

function getForemanRepair(itemId: string): number {
  const values: Record<string, number> = {
    foreman_1: 125,
    foreman_2: 250,
    foreman_3: 500,
    foreman_4: 1000,
  };

  return values[itemId] || 0;
}

function getSlaveReloadMultiplier(itemId: string): number {
  const values: Record<string, number> = {
    slave_1: 1.5,
    slave_2: 1.75,
    slave_3: 2.0,
  };

  return values[itemId] || 1.0;
}

function getEquipmentMap(equipment: EquipmentRow[]) {
  const map: Record<string, EquipmentRow> = {};

  for (const row of equipment) {
    map[row.slot] = row;
  }

  return map;
}

function getEquippedCannons(equipment: EquipmentRow[]): string[] {
  return equipment
    .filter((row) => /^cannon_\d+$/.test(row.slot))
    .sort((a, b) => Number(a.slot.replace("cannon_", "")) - Number(b.slot.replace("cannon_", "")))
    .map((row) => row.item_id);
}

function getEquippedSails(equipment: EquipmentRow[]): string[] {
  return equipment
    .filter((row) => /^sail_\d+$/.test(row.slot))
    .sort((a, b) => Number(a.slot.replace("sail_", "")) - Number(b.slot.replace("sail_", "")))
    .map((row) => row.item_id);
}

export async function calculatePlayerStats(profileId: string) {
  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("*")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    throw new Error("Player state not found");
  }

  const { data: equipmentRows, error: equipmentError } = await supabase
    .from("player_equipment")
    .select("slot, item_id, amount")
    .eq("profile_id", profileId);

  if (equipmentError) {
    throw new Error(equipmentError.message);
  }

  const { data: talentRows, error: talentError } = await supabase
    .from("player_talents")
    .select("talent_id, level")
    .eq("profile_id", profileId);

  if (talentError) {
    throw new Error(talentError.message);
  }

  const equipment = (equipmentRows || []) as EquipmentRow[];
  const equipmentMap = getEquipmentMap(equipment);

  const talents: Record<string, number> = {};
  for (const row of (talentRows || []) as TalentRow[]) {
    talents[row.talent_id] = Number(row.level || 0);
  }

  const elitePoints = Number(state.elite_points || 0);
  const eliteLevel = getEliteLevelFromElitePoints(elitePoints);

  const shipId = equipmentMap.ship?.item_id || "red_korsar_1";
  const shipStats = getShipStats(shipId, eliteLevel);

  const equippedCannons = getEquippedCannons(equipment);
  const equippedSails = getEquippedSails(equipment);

  const greenHullActive = isSpellActive(state.green_hull_spell_expires_at);
  const redHullActive = isSpellActive(state.red_hull_spell_expires_at);
  const blueHullActive = isSpellActive(state.blue_hull_spell_expires_at);

  const greenCannonActive = isSpellActive(state.green_cannon_spell_expires_at);
  const redCannonActive = isSpellActive(state.red_cannon_spell_expires_at);
  const blueCannonActive = isSpellActive(state.blue_cannon_spell_expires_at);

  let maxHp = Number(shipStats.hp);

  if (greenHullActive) maxHp += 12500;
  if (redHullActive) maxHp += 25000;
  if (blueHullActive) maxHp += 50000;

  maxHp += getTalentValue(talents, "hit_point_hoard", [4000, 6000, 8000, 10000, 12000]);

  let speed = Number(shipStats.speed);

  for (const sailId of equippedSails) {
    speed += getSailSpeedBonus(sailId);
  }

  speed += getTalentValue(talents, "wind_at_your_back", [25, 35, 45, 55, 65]);

  const cannonStats = equippedCannons.map(getCannonStats);
  const cannonCount = cannonStats.length;

  let cannonBaseDamage = 0;
  let cannonRange = 180;
  let hitChance = 45;
  let reloadTime = 10;

  if (cannonStats.length > 0) {
    cannonBaseDamage = cannonStats.reduce((sum, cannon) => sum + cannon.damage, 0);
    cannonRange = Math.max(...cannonStats.map((cannon) => cannon.range));
    hitChance =
      cannonStats.reduce((sum, cannon) => sum + cannon.hit_chance, 0) / cannonStats.length;
    reloadTime = Math.min(...cannonStats.map((cannon) => cannon.reload));
  }

  hitChance += equipmentMap.gunner?.item_id === "gunner_1" ? 5 : 0;
  hitChance += getTalentValue(talents, "agwes_aim", [2, 3, 4, 5, 6]);
  hitChance = Math.max(0, Math.min(100, hitChance));

  cannonRange += getTalentValue(talents, "destructions_reach", [2, 3, 4, 5, 6]);

    reloadTime = reloadTime / getSlaveReloadMultiplier(equipmentMap.slave?.item_id || "");
    reloadTime = Math.max(1, reloadTime);

  let cannonDamageBonusPercent = 0;

  if (equipmentMap.gunpowder?.item_id === "gunpowder") {
    cannonDamageBonusPercent += 10;
    cannonDamageBonusPercent += getTalentValue(talents, "explosive_alchemy", [7, 9, 11, 13, 15]);
  }

  cannonDamageBonusPercent += getTalentValue(talents, "ogouns_wrath", [4, 6, 8, 10, 12]);

  if (greenCannonActive) cannonDamageBonusPercent += 5;
  if (redCannonActive) cannonDamageBonusPercent += 5;
  if (blueCannonActive) cannonDamageBonusPercent += 5;

  const cannonDamagePreview = cannonBaseDamage * (1 + cannonDamageBonusPercent / 100);

  let defensePercent = 0;

  if (equipmentMap.plates?.item_id === "plates") {
    defensePercent = 10;
    defensePercent += getTalentValue(talents, "agwes_armor", [4, 6, 8, 10, 12]);
  }

  let repairPerSecond = getForemanRepair(equipmentMap.boatswain?.item_id || "");
  repairPerSecond *= 1 + getTalentValue(talents, "swift_remedy", [10, 15, 20, 25, 30]) / 100;

  const critChance = getTalentValue(talents, "critical_hits", [2, 3, 4, 5, 6]);

  const currentHp = Math.max(
    0,
    Math.min(Number(state.current_hp || maxHp), maxHp)
  );

  return {
    profile_id: profileId,

    ship_id: shipId,
    elite_points: elitePoints,
    elite_level: eliteLevel,

    max_hp: maxHp,
    current_hp: currentHp,

    speed,
    max_cannons: Number(shipStats.cannons),
    max_sails: Number(shipStats.sails),

    equipped_cannons: cannonCount,
    cannon_base_damage: cannonBaseDamage,
    cannon_damage_preview: cannonDamagePreview,
    cannon_damage_bonus_percent: cannonDamageBonusPercent,
    cannon_range: cannonRange,
    reload_time: reloadTime,
    hit_chance: hitChance,
    crit_chance: critChance,
    crit_damage_multiplier: 1.2,

    defense_percent: defensePercent,
    repair_per_second: repairPerSecond,

    spells: {
      green_hull_active: greenHullActive,
      red_hull_active: redHullActive,
      blue_hull_active: blueHullActive,
      green_cannon_active: greenCannonActive,
      red_cannon_active: redCannonActive,
      blue_cannon_active: blueCannonActive,
    },
  };
}