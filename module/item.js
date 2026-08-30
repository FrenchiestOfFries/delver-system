import {
  getWeaponBaseDie,
  isItemEquippable,
  normalizeBulkySlots,
  normalizeCarryMode,
  normalizeDecay,
  normalizeItemCategory,
  normalizeQuality,
  normalizeWeaponDie
} from "./delver-item-rules.js";


/* ========================================================== */
/* HELPERS                                                    */
/* ========================================================== */

function itemIsInActorSlot(item) {

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


function setUpdateProperty(
  changes,
  path,
  value
) {

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


    if (
      allowed === false
    ) {

      return false;
    }


    const flatChanges =
      foundry.utils.flattenObject(
        changes
      );


    /* ------------------------------------------------------ */
    /* CATEGORY                                                */
    /* ------------------------------------------------------ */

    const requestedCategory =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.category"
      )
        ? flatChanges[
            "system.category"
          ]
        : this.system?.category;


    const category =
      normalizeItemCategory(
        requestedCategory
      );


    if (
      requestedCategory !==
      category
    ) {

      setUpdateProperty(
        changes,
        "system.category",
        category
      );
    }


    /* ------------------------------------------------------ */
    /* QUALITY                                                 */
    /* ------------------------------------------------------ */

    const requestedQuality =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.quality"
      )
        ? flatChanges[
            "system.quality"
          ]
        : this.system?.quality;


    const quality =
      normalizeQuality(
        requestedQuality
      );


    if (
      Number(
        requestedQuality ?? 0
      ) !== quality
    ) {

      setUpdateProperty(
        changes,
        "system.quality",
        quality
      );
    }


    /* ------------------------------------------------------ */
    /* DECAY                                                   */
    /* ------------------------------------------------------ */

    const requestedDecay =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.decay"
      )
        ? flatChanges[
            "system.decay"
          ]
        : this.system?.decay;


    const decay =
      normalizeDecay(
        category,
        requestedDecay
      );


    if (
      Number(
        requestedDecay ?? 0
      ) !== decay
    ) {

      setUpdateProperty(
        changes,
        "system.decay",
        decay
      );
    }


    /* ------------------------------------------------------ */
    /* EQUIPPABLE TRAIT                                        */
    /* ------------------------------------------------------ */

    const requestedExplicitEquippable =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.traits.equippable"
      )
        ? Boolean(
            flatChanges[
              "system.traits.equippable"
            ]
          )
        : Boolean(
            this.system
              ?.traits
              ?.equippable ||
            this.system
              ?.equippable
          );


    /* ------------------------------------------------------ */
    /* KEY ITEM                                                */
    /* ------------------------------------------------------ */

    const requestedKeyItem =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.traits.keyItem"
      )
        ? Boolean(
            flatChanges[
              "system.traits.keyItem"
            ]
          )
        : Boolean(
            this.system
              ?.traits
              ?.keyItem
          );


    /* ------------------------------------------------------ */
    /* BULKY                                                   */
    /* ------------------------------------------------------ */

    const requestedBulkySlots =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.traits.bulkySlots"
      )
        ? flatChanges[
            "system.traits.bulkySlots"
          ]
        : this.system
            ?.traits
            ?.bulkySlots ??
          (
            normalizeCarryMode(
              this.system?.carryMode
            ) === "bulky"
              ? 2
              : 0
          );


    const bulkySlots =
      normalizeBulkySlots(
        requestedBulkySlots
      );


    if (
      Number(
        requestedBulkySlots ?? 0
      ) !== bulkySlots
    ) {

      setUpdateProperty(
        changes,
        "system.traits.bulkySlots",
        bulkySlots
      );
    }


    /* ------------------------------------------------------ */
    /* CARRY MODE                                              */
    /* ------------------------------------------------------ */

    const requestedCarryMode =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.carryMode"
      )
        ? flatChanges[
            "system.carryMode"
          ]
        : this.system?.carryMode;


    const carryMode =
      normalizeCarryMode(
        requestedCarryMode
      );


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
    /* WEAPON BASE DIE                                         */
    /* ------------------------------------------------------ */

    const requestedBaseDie =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.weapon.baseDie"
      )
        ? flatChanges[
            "system.weapon.baseDie"
          ]
        : getWeaponBaseDie(
            this.system ?? {}
          );


    const baseDie =
      normalizeWeaponDie(
        requestedBaseDie
      );


    if (
      requestedBaseDie !==
      baseDie
    ) {

      setUpdateProperty(
        changes,
        "system.weapon.baseDie",
        baseDie
      );
    }


    /* ------------------------------------------------------ */
    /* PROPOSED SYSTEM                                         */
    /* ------------------------------------------------------ */

    const proposedSystem =
      foundry.utils.deepClone(
        this.system ?? {}
      );


    proposedSystem.category =
      category;


    proposedSystem.quality =
      quality;


    proposedSystem.decay =
      decay;


    proposedSystem.carryMode =
      carryMode;


    proposedSystem.traits = {
      ...(proposedSystem.traits ?? {}),

      equippable:
        requestedExplicitEquippable,

      keyItem:
        requestedKeyItem,

      bulkySlots
    };


    proposedSystem.weapon = {
      ...(proposedSystem.weapon ?? {}),

      baseDie
    };


    /* ------------------------------------------------------ */
    /* EQUIPPED STATE                                         */
    /* ------------------------------------------------------ */

    const wantsEquipped =
      Object.prototype.hasOwnProperty.call(
        flatChanges,
        "system.equipped"
      )
        ? Boolean(
            flatChanges[
              "system.equipped"
            ]
          )
        : Boolean(
            this.system?.equipped
          );


    const actor =
      this.parent;


    const ownedByCharacter =
      actor?.documentName ===
        "Actor" &&
      actor.type ===
        "character";


    const assignedToSlot =
      itemIsInActorSlot(
        this
      );


    /*
     * v0.1.5A keeps our existing equipment invariant.
     *
     * v0.1.5B will deliberately modify this when Bulky
     * becomes real multi-slot inventory occupancy.
     */

    const validEquippedState =
      isItemEquippable(
        proposedSystem
      ) &&
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