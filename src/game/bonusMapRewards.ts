export const BONUS_MAP_WAVE_REWARDS: Record<string, Record<number, {
  gunpowder?: number;
  plates?: number;
  mojos?: number;
  harpoons?: number;
  xp?: number;
  elite?: number;
  pearls?: number;
  gold?: number;
  crystals?: number;
}>> = {
  green: {
    1: { gunpowder: 20, xp: 316, elite: 239, pearls: 88, gold: 1973 },
    2: { plates: 10, xp: 348, elite: 264, pearls: 146, gold: 2178 },
    3: { mojos: 3, xp: 414, elite: 314, pearls: 166, gold: 2589 },
    4: { harpoons: 3, xp: 796, elite: 603, pearls: 265, gold: 4973 },
    5: { gunpowder: 115, xp: 1687, elite: 1279, pearls: 494, gold: 10544 },
    6: { plates: 82, xp: 2326, elite: 1764, pearls: 706, gold: 14540 },
    7: { mojos: 17, xp: 2424, elite: 1838, pearls: 741, gold: 15150, crystals: 2 },
    8: { harpoons: 9, xp: 2756, elite: 2090, pearls: 997, gold: 17222 },
    9: { gunpowder: 259, xp: 3680, elite: 2791, pearls: 1111, gold: 23002 },
    10: { plates: 121, xp: 3299, elite: 2501, pearls: 1041, gold: 20616 },
  },
};