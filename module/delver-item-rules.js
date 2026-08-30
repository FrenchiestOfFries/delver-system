export const DELVER_ITEM_CATEGORIES = Object.freeze([
  "armor",
  "weapon",
  "trinket",
  "consumable",
  "gear",
  "spell-vessel"
]);

export const DELVER_ITEM_CATEGORY_LABELS = Object.freeze({
  armor: "Armor",
  weapon: "Weapon",
  trinket: "Trinket",
  consumable: "Consumable",
  gear: "Gear",
  "spell-vessel": "Spell Vessel"
});

export const DELVER_VALID_CARRY_MODES = Object.freeze([
  "slot",
  "loose",
  "backpack",
  "bulky"
]);

export const DELVER_WEAPON_DIE_LADDER = Object.freeze([
  "d4",
  "d6",
  "d8",
  "d10"
]);


/* ========================================================== */
/* GENERIC NORMALIZATION                                      */
/* ========================================================== */

export function clampInteger(
  value,
  min,
  max,
  fallback = min
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.trunc(number)
    )
  );
}


export function normalizeItemCategory(value) {

  /*
   * v0.1.0 used "misc" as the generic category.
   * Item v3 replaces that DM-facing bucket with Gear.
   */

  if (
    value === "misc" ||
    !DELVER_ITEM_CATEGORIES.includes(value)
  ) {

    return "gear";
  }


  return value;
}


export function normalizeCarryMode(value) {

  /*
   * Historical migration.
   *
   * "bulky" remains temporarily valid during v0.1.5A.
   * The next inventory pass removes Bulky as a location
   * and replaces it with real multi-slot occupancy.
   */

  if (value === "large") {
    return "bulky";
  }


  return DELVER_VALID_CARRY_MODES.includes(value)
    ? value
    : "slot";
}


export function normalizeQuality(value) {

  return clampInteger(
    value,
    0,
    3,
    0
  );
}


export function normalizeDecay(
  category,
  value
) {

  const normalizedCategory =
    normalizeItemCategory(category);


  /*
   * Consumables do not retain mechanical Decay.
   *
   * If something would cause a Consumable to decay
   * or break, the Consumable is destroyed instead.
   */

  if (
    normalizedCategory ===
    "consumable"
  ) {

    return 0;
  }


  return clampInteger(
    value,
    0,
    3,
    0
  );
}


export function normalizeBulkySlots(value) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {

    return 0;
  }


  /*
   * Bulky means MINIMUM 2 slots.
   */

  return Math.max(
    2,
    Math.trunc(number)
  );
}


export function normalizeWeaponDie(value) {

  return DELVER_WEAPON_DIE_LADDER.includes(value)
    ? value
    : "";
}


/* ========================================================== */
/* ITEM TRAITS                                                */
/* ========================================================== */

export function getItemTraits(
  system = {}
) {

  /*
   * Legacy top-level system.equippable is intentionally
   * still recognized so existing Items migrate safely.
   */

  const legacyEquippable =
    Boolean(
      system.equippable
    );


  const explicitBulkySlots =
    normalizeBulkySlots(
      system.traits?.bulkySlots
    );


  /*
   * Old Bulky / In Hands Items become 2-slot Bulky Items.
   *
   * We do NOT move them into numbered inventory yet.
   * That happens in the multi-slot inventory pass.
   */

  const bulkySlots =
    explicitBulkySlots >= 2
      ? explicitBulkySlots
      : (
          normalizeCarryMode(
            system.carryMode
          ) === "bulky"
            ? 2
            : 0
        );


  return {

    equippable:
      Boolean(
        system.traits?.equippable ||
        legacyEquippable
      ),

    keyItem:
      Boolean(
        system.traits?.keyItem
      ),

    bulkySlots
  };
}


export function isBulkyItem(
  system = {}
) {

  return (
    getItemTraits(system)
      .bulkySlots >= 2
  );
}


export function isItemEquippable(
  system = {}
) {

  const category =
    normalizeItemCategory(
      system.category
    );


  const traits =
    getItemTraits(system);


  /*
   * Weapons and Armor are inherently equippable.
   *
   * Bulky Items are mechanically equipped whenever
   * they are successfully carried.
   *
   * Everything else may explicitly opt in.
   */

  return (
    category === "weapon" ||
    category === "armor" ||
    traits.bulkySlots >= 2 ||
    traits.equippable
  );
}


/* ========================================================== */
/* CARRY ELIGIBILITY                                          */
/* ========================================================== */

export function getAllowedCarryModes(
  system = {}
) {

  const category =
    normalizeItemCategory(
      system.category
    );


  const traits =
    getItemTraits(system);


  /*
   * This is now our central source of truth.
   *
   * v0.1.5A exposes this information.
   * v0.1.5B will actually enforce it during drag/drop
   * and context-menu movement.
   */


  /*
   * Bulky Items will occupy numbered inventory slots
   * directly and cannot exist in Backpack/Loose.
   */

  if (
    traits.bulkySlots >= 2
  ) {

    return [
      "slot"
    ];
  }


  /*
   * Ordinary Trinkets are carried loosely.
   *
   * Mechanically equippable Trinkets and Key Items
   * instead require Inventory/Backpack.
   */

  if (
    category === "trinket" &&
    !traits.equippable &&
    !traits.keyItem
  ) {

    return [
      "loose"
    ];
  }


  /*
   * Armor, Weapons, Consumables, Gear,
   * Spell Vessels, Key Items, etc.
   */

  return [
    "slot",
    "backpack"
  ];
}


export function getDefaultCarryMode(
  system = {}
) {

  return (
    getAllowedCarryModes(system)[0] ??
    "slot"
  );
}


export function getItemSlotCost(
  system = {}
) {

  const bulkySlots =
    getItemTraits(system)
      .bulkySlots;


  return bulkySlots >= 2
    ? bulkySlots
    : 1;
}


/* ========================================================== */
/* QUALITY / DECAY                                            */
/* ========================================================== */

export function getItemRollModifier(
  system = {}
) {

  const category =
    normalizeItemCategory(
      system.category
    );


  const quality =
    normalizeQuality(
      system.quality
    );


  const decay =
    normalizeDecay(
      category,
      system.decay
    );


  /*
   * Current ruling:
   *
   * Weapon:
   *   Quality modifies rolls.
   *   Decay modifies damage die.
   *
   * Everything else:
   *   Quality - Decay modifies rolls.
   */

  if (
    category === "weapon"
  ) {

    return quality;
  }


  return (
    quality -
    decay
  );
}


/* ========================================================== */
/* WEAPON DECAY                                               */
/* ========================================================== */

export function getWeaponBaseDie(
  system = {}
) {

  /*
   * Prefer Item v3 baseDie.
   *
   * Fall back to v0.1.0 weapon.die for migration.
   */

  return normalizeWeaponDie(
    system.weapon?.baseDie ||
    system.weapon?.die
  );
}


export function getWeaponCurrentDie(
  system = {}
) {

  const baseDie =
    getWeaponBaseDie(system);


  if (!baseDie) {
    return "";
  }


  const decay =
    normalizeDecay(
      "weapon",
      system.decay
    );


  const baseIndex =
    DELVER_WEAPON_DIE_LADDER.indexOf(
      baseDie
    );


  /*
   * d4 is the absolute floor.
   *
   * Decay itself still retains its full value,
   * so a d6 weapon at Decay 3 remains d4 until
   * all three points are repaired.
   */

  const currentIndex =
    Math.max(
      0,
      baseIndex - decay
    );


  return (
    DELVER_WEAPON_DIE_LADDER[
      currentIndex
    ] ??
    "d4"
  );
}


/* ========================================================== */
/* COMMON DERIVED DATA                                        */
/* ========================================================== */

export function getItemDerivedData(
  system = {}
) {

  const category =
    normalizeItemCategory(
      system.category
    );


  const traits =
    getItemTraits(system);


  const quality =
    normalizeQuality(
      system.quality
    );


  const decay =
    normalizeDecay(
      category,
      system.decay
    );


  const allowedCarryModes =
    getAllowedCarryModes(system);


  return {

    category,

    categoryLabel:
      DELVER_ITEM_CATEGORY_LABELS[
        category
      ] ??
      "Gear",

    quality,
    decay,

    magical:
      Boolean(
        system.magical
      ),

    traits,

    bulky:
      traits.bulkySlots >= 2,

    slotCost:
      getItemSlotCost(system),

    equippable:
      isItemEquippable(system),

    allowedCarryModes,

    defaultCarryMode:
      getDefaultCarryMode(system),

    rollModifier:
      getItemRollModifier(system),

    weaponBaseDie:
      getWeaponBaseDie(system),

    weaponCurrentDie:
      category === "weapon"
        ? getWeaponCurrentDie(system)
        : ""
  };
}