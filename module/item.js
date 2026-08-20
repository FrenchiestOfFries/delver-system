const DELVER_VALID_CARRY_MODES = new Set([
  "slot",
  "loose",
  "backpack",
  "bulky"
]);


/* ========================================================== */
/* HELPERS                                                    */
/* ========================================================== */

function normalizeCarryMode(value) {

  /*
   * Migration:
   *
   * Early Delver builds called this carry mode "large".
   * It actually represents cumbersome / encumbering
   * objects rather than weapon size.
   */
  if (value === "large") {
    return "bulky";
  }


  return DELVER_VALID_CARRY_MODES.has(
    value
  )
    ? value
    : "slot";
}


function itemIsInActorSlot(
  item
) {

  const actor =
    item.parent;


  if (
    actor?.documentName !== "Actor" ||
    actor.type !== "character"
  ) {

    return false;
  }


  const slots =
    Array.isArray(
      actor.system
        ?.inventory
        ?.slots
    )
      ? actor.system.inventory.slots
      : [];


  return slots.some(
    slot =>
      slot?.kind === "item" &&
      slot?.itemId === item.id
  );
}


function itemIsEquippable(
  item,
  categoryOverride = undefined,
  equippableOverride = undefined
) {

  const category =
    categoryOverride ??
    item.system?.category ??
    "misc";


  /*
   * Weapons and Armor are inherently equipment.
   *
   * Other categories can opt-in using the generic
   * system.equippable flag.
   */
  if (
    category === "weapon" ||
    category === "armor"
  ) {

    return true;
  }


  const explicit =
    equippableOverride ??
    item.system?.equippable ??
    false;


  return Boolean(explicit);
}


function setUpdateProperty(
  changes,
  path,
  value
) {

  /*
   * Foundry update objects may arrive either flattened:
   *
   * "system.equipped": true
   *
   * or nested:
   *
   * system: { equipped: true }
   *
   * Support both.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      changes,
      path
    )
  ) {

    changes[path] =
      value;

    return;
  }


  foundry.utils.setProperty(
    changes,
    path,
    value
  );
}


/* ========================================================== */
/* DELVER ITEM                                                */
/* ========================================================== */

export class SimpleItem extends Item {

  /* ======================================================== */
  /* UPDATE INTEGRITY                                         */
  /* ======================================================== */

  async _preUpdate(
    changes,
    options,
    user
  ) {

    const allowed =
      await super._preUpdate(
        changes,
        options,
        user
      );


    if (allowed === false) {
      return false;
    }


    const flatChanges =
      foundry.utils.flattenObject(
        changes
      );


    /* ------------------------------------------------------ */
    /* Proposed Category                                      */
    /* ------------------------------------------------------ */

    const hasCategoryChange =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.category"
      );


    const category =
      hasCategoryChange
        ? flatChanges[
            "system.category"
          ]
        : this.system?.category ??
          "misc";


    /* ------------------------------------------------------ */
    /* Proposed Equippable Flag                               */
    /* ------------------------------------------------------ */

    const hasEquippableChange =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.equippable"
      );


    const explicitEquippable =
      hasEquippableChange
        ? Boolean(
            flatChanges[
              "system.equippable"
            ]
          )
        : Boolean(
            this.system?.equippable
          );


    const equippable =
      (
        category === "weapon" ||
        category === "armor"
      )
        ? true
        : explicitEquippable;


    /* ------------------------------------------------------ */
    /* Proposed Carry Mode                                    */
    /* ------------------------------------------------------ */

    const hasCarryChange =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.carryMode"
      );


    const requestedCarryMode =
      hasCarryChange
        ? flatChanges[
            "system.carryMode"
          ]
        : this.system?.carryMode;


    const carryMode =
      normalizeCarryMode(
        requestedCarryMode
      );


    /*
     * Persist the old "large" -> "bulky" migration
     * whenever this Item receives an update.
     */
    if (
      requestedCarryMode !==
      carryMode
    ) {

      setUpdateProperty(
        changes,
        "system.carryMode",
        carryMode
      );
    }


    /* ------------------------------------------------------ */
    /* Proposed Equipped State                                */
    /* ------------------------------------------------------ */

    const hasEquippedChange =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.equipped"
      );


    const wantsEquipped =
      hasEquippedChange
        ? Boolean(
            flatChanges[
              "system.equipped"
            ]
          )
        : Boolean(
            this.system?.equipped
          );


    /*
     * EQUIPMENT INVARIANT
     *
     * An Item may only actually be Equipped if:
     *
     * 1. It is equippable.
     * 2. It belongs to a Character Actor.
     * 3. carryMode is "slot".
     * 4. It is actually referenced by a numbered
     *    inventory slot.
     *
     * Backpack / Loose / Bulky Items therefore cannot
     * remain Equipped.
     */
    const actor =
      this.parent;


    const ownedByCharacter =
      actor?.documentName === "Actor" &&
      actor.type === "character";


    const assignedToSlot =
      itemIsInActorSlot(
        this
      );


    const validEquippedState =
      equippable &&
      ownedByCharacter &&
      carryMode === "slot" &&
      assignedToSlot;


    if (
      wantsEquipped &&
      !validEquippedState
    ) {

      setUpdateProperty(
        changes,
        "system.equipped",
        false
      );
    }


    return allowed;
  }


  /* ======================================================== */
  /* ROLL DATA                                                */
  /* ======================================================== */

  getRollData() {

    const data =
      super.getRollData();


    return foundry.utils.mergeObject(
      data,
      this.system ?? {},
      {
        inplace: false
      }
    );
  }
}