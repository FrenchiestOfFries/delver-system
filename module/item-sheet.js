import {
  getAllowedCarryModes,
  getItemDerivedData,
  getItemTraits,
  getWeaponBaseDie,
  isItemEquippable,
  normalizeBulkySlots,
  normalizeCarryMode,
  normalizeDecay,
  normalizeItemCategory,
  normalizeQuality
} from "./delver-item-rules.js";


const DELVER_MAX_INVENTORY_SLOTS = 20;
const DELVER_BASE_INVENTORY_SLOTS = 10;


function emptyInventorySlot() {
  return {
    kind: "empty",
    itemId: "",
    label: ""
  };
}


/**
 * Delver generic Item sheet.
 *
 * v0.1.5 Item v3 foundation:
 * - six DM-facing Item categories
 * - Quality / Decay
 * - Magical / Key Item / Equippable traits
 * - Bulky slot-cost authoring
 * - derived weapon die preview
 * - central carry-rule preview
 *
 * Multi-slot Bulky inventory and hard carry enforcement are
 * intentionally handled in the following inventory pass.
 */
export class SimpleItemSheet extends ItemSheet {

  /* ======================================================== */
  /* OPTIONS                                                  */
  /* ======================================================== */

  static get defaultOptions() {

    return foundry.utils.mergeObject(
      super.defaultOptions,
      {
        classes: [
          "delver",
          "sheet",
          "item",
          "delver-item",
          "delver-item-v3"
        ],

        template:
          "systems/delver/templates/item-sheet.html",

        width: 640,
        height: 760,

        resizable: true
      }
    );
  }


  /* ======================================================== */
  /* SHEET DATA                                               */
  /* ======================================================== */

  async getData(options) {

    const context =
      await super.getData(options);


    const system =
      this.document.system ?? {};


    const derived =
      getItemDerivedData(system);


    const category =
      derived.category;


    const carryMode =
      normalizeCarryMode(
        system.carryMode
      );


    const actor =
      this.document.parent;


    const ownedByCharacter =
      actor?.documentName === "Actor" &&
      actor.type === "character";


    const ownedByActor =
      actor?.documentName === "Actor";


    const assignedToSlot =
      ownedByCharacter
        ? this._itemIsAssignedToSlot(actor)
        : false;


    const equippable =
      isItemEquippable(system);


    const canEquipHere =
      ownedByCharacter &&
      equippable &&
      carryMode === "slot" &&
      assignedToSlot;


    const inherentlyEquippable =
      category === "weapon" ||
      category === "armor";


    const bulky =
      derived.bulky;


    const showExplicitEquippable =
      !inherentlyEquippable &&
      !bulky;


    let equippableReason =
      "";


    if (bulky) {

      equippableReason =
        "Required — Bulky Items must be equipped while carried.";
    }
    else if (
      category === "weapon"
    ) {

      equippableReason =
        "Yes — Weapons are inherently equippable.";
    }
    else if (
      category === "armor"
    ) {

      equippableReason =
        "Yes — Armor is inherently equippable.";
    }


    const allowedCarryModes =
      getAllowedCarryModes(system);


    const carryLabels = {
      slot:
        "Inventory Slot",

      loose:
        "Carried Loosely",

      backpack:
        "Backpack"
    };


    const allowedCarryLabels =
      allowedCarryModes.map(
        mode =>
          carryLabels[mode] ??
          mode
      );


    const currentCarryAllowed =
      allowedCarryModes.includes(
        carryMode
      );


    const rollModifier =
      derived.rollModifier;


    const rollModifierText =
      rollModifier > 0
        ? `+${rollModifier}`
        : String(
            rollModifier
          );


    context.item =
      this.document;


    context.systemData = {
      ...system,

      category,
      carryMode,

      quality:
        derived.quality,

      decay:
        derived.decay,

      magical:
        derived.magical,

      traits: {
        ...(
          system.traits ??
          {}
        ),

        ...derived.traits
      },

      weapon: {
        ...(
          system.weapon ??
          {}
        ),

        baseDie:
          derived.weaponBaseDie
      }
    };


    context.derived = {
      ...derived,

      rollModifierText,
      allowedCarryLabels,
      currentCarryAllowed
    };


    context.isWeapon =
      category === "weapon";


    context.isArmor =
      category === "armor";


    context.isTrinket =
      category === "trinket";


    context.isConsumable =
      category ===
      "consumable";


    context.isGear =
      category === "gear";


    context.isSpellVessel =
      category ===
      "spell-vessel";


    context.hasCharges =
      Boolean(
        system.charges
          ?.enabled
      );


    context.isBulky =
      bulky;


    context.showExplicitEquippable =
      showExplicitEquippable;


    context.equippableReason =
      equippableReason;


    context.isEquippable =
      equippable;


    context.isOwnedByActor =
      ownedByActor;


    context.isOwnedByCharacter =
      ownedByCharacter;


    context.isAssignedToSlot =
      assignedToSlot;


    context.canEquipHere =
      canEquipHere;


    return context;
  }


  /* ======================================================== */
  /* LISTENERS                                                */
  /* ======================================================== */

  activateListeners(html) {
    super.activateListeners(
      html
    );


    if (!this.isEditable) {
      return;
    }


    /* ------------------------------------------------------ */
    /* STRUCTURAL FIELDS                                      */
    /* ------------------------------------------------------ */

    html
      .find(
        [
          '[name="system.category"]',
          '[name="system.quality"]',
          '[name="system.decay"]',
          '[name="system.magical"]',
          '[name="system.traits.equippable"]',
          '[name="system.traits.keyItem"]',
          '[name="system.traits.bulkySlots"]',
          '[name="system.weapon.baseDie"]'
        ].join(", ")
      )
      .on(
        "change",
        this._onStructuralChange.bind(
          this
        )
      );


    /* ------------------------------------------------------ */
    /* BULKY TOGGLE                                           */
    /* ------------------------------------------------------ */

    html
      .find(
        "[data-delver-bulky-toggle]"
      )
      .on(
        "change",
        this._onBulkyToggle.bind(
          this
        )
      );


    /* ------------------------------------------------------ */
    /* CHARGES                                                */
    /* ------------------------------------------------------ */

    html
      .find(
        '[name="system.charges.enabled"]'
      )
      .on(
        "change",
        this._onChargesToggle.bind(
          this
        )
      );


    /* ------------------------------------------------------ */
    /* CURRENT CARRY LOCATION                                 */
    /* ------------------------------------------------------ */

    html
      .find(
        '[name="system.carryMode"]'
      )
      .on(
        "change",
        this._onCarryModeChange.bind(
          this
        )
      );


    /* ------------------------------------------------------ */
    /* OPEN-TIME MIGRATION / CLEANUP                          */
    /* ------------------------------------------------------ */

    void this
      ._ensureItemIntegrity();
  }


  /* ======================================================== */
  /* STRUCTURAL CHANGE                                        */
  /* ======================================================== */

  async _onStructuralChange(
    event
  ) {

    event.preventDefault();


    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    await this
      ._ensureItemIntegrity();


    this.render(false);


    this.document.parent
      ?.sheet
      ?.render(false);
  }


  /* ======================================================== */
  /* BULKY TOGGLE                                             */
  /* ======================================================== */

  async _onBulkyToggle(
    event
  ) {

    event.preventDefault();


    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    const enabled =
      Boolean(
        event.currentTarget
          .checked
      );


    const currentSlots =
      normalizeBulkySlots(
        this.document.system
          ?.traits
          ?.bulkySlots
      );


    await this.document.update({
      "system.traits.bulkySlots":
        enabled
          ? Math.max(
              2,
              currentSlots
            )
          : 0
    });


    await this
      ._ensureItemIntegrity();


    this.render(false);


    this.document.parent
      ?.sheet
      ?.render(false);
  }


  /* ======================================================== */
  /* CHARGES                                                  */
  /* ======================================================== */

  async _onChargesToggle(
    event
  ) {

    event.preventDefault();


    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    this.render(false);
  }


  /* ======================================================== */
  /* CARRY MODE                                               */
  /* ======================================================== */

  async _onCarryModeChange(
    event
  ) {

    event.preventDefault();


    const oldCarryMode =
      normalizeCarryMode(
        this.document.system
          ?.carryMode
      );


    const newCarryMode =
      normalizeCarryMode(
        event.currentTarget
          .value
      );


    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    const success =
      await this
        ._syncCharacterCarryMode(
          oldCarryMode,
          newCarryMode
        );


    if (!success) {

      await this.document.update({
        "system.carryMode":
          oldCarryMode
      });
    }


    await this
      ._ensureItemIntegrity();


    this.render(false);


    const actor =
      this.document.parent;


    if (
      actor?.documentName ===
      "Actor"
    ) {

      actor.sheet
        ?.render(false);
    }
  }


  /* ======================================================== */
  /* CHARACTER CARRY SYNC                                     */
  /* ======================================================== */

  async _syncCharacterCarryMode(
    oldCarryMode,
    newCarryMode
  ) {

    const actor =
      this.document.parent;


    if (
      actor?.documentName !==
        "Actor" ||
      actor.type !==
        "character"
    ) {

      return true;
    }


    const slots =
      this._normalizeSlots(
        actor.system
          ?.inventory
          ?.slots
      );


    const currentIndices =
      [];


    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      if (
        slots[index].kind ===
          "item" &&
        slots[index].itemId ===
          this.document.id
      ) {

        currentIndices.push(
          index
        );
      }
    }


    /* ------------------------------------------------------ */
    /* Moving AWAY from numbered inventory                    */
    /* ------------------------------------------------------ */

    if (
      newCarryMode !==
      "slot"
    ) {

      if (
        currentIndices.length ===
        0
      ) {

        return true;
      }


      for (
        const index of
          currentIndices
      ) {

        slots[index] =
          emptyInventorySlot();
      }


      await actor.update({
        "system.inventory.slots":
          slots
      });


      return true;
    }


    /* ------------------------------------------------------ */
    /* Already has a numbered slot                            */
    /* ------------------------------------------------------ */

    if (
      currentIndices.length >
      0
    ) {

      return true;
    }


    /* ------------------------------------------------------ */
    /* Moving INTO numbered inventory                         */
    /* ------------------------------------------------------ */

    const con =
      Number(
        actor.system
          ?.abilities
          ?.con ??
        0
      );


    const capacity =
      Math.min(
        DELVER_MAX_INVENTORY_SLOTS,

        Math.max(
          0,

          DELVER_BASE_INVENTORY_SLOTS +
            con
        )
      );


    const emptyIndex =
      slots.findIndex(
        (slot, index) =>
          index < capacity &&
          slot.kind ===
            "empty"
      );


    if (
      emptyIndex ===
      -1
    ) {

      ui.notifications.warn(
        "No available inventory slot. Move or drop something before changing this Item to Inventory Slot."
      );


      return false;
    }


    slots[emptyIndex] = {
      kind:
        "item",

      itemId:
        this.document.id,

      label:
        ""
    };


    await actor.update({
      "system.inventory.slots":
        slots
    });


    return true;
  }


  /* ======================================================== */
  /* ITEM INTEGRITY                                           */
  /* ======================================================== */

  async _ensureItemIntegrity() {

    const system =
      this.document.system ??
      {};


    const updates =
      {};


    /* ------------------------------------------------------ */
    /* ITEM V3 CORE                                           */
    /* ------------------------------------------------------ */

    const category =
      normalizeItemCategory(
        system.category
      );


    if (
      system.category !==
      category
    ) {

      updates[
        "system.category"
      ] =
        category;
    }


    const quality =
      normalizeQuality(
        system.quality
      );


    if (
      Number(
        system.quality ??
        0
      ) !==
      quality
    ) {

      updates[
        "system.quality"
      ] =
        quality;
    }


    const decay =
      normalizeDecay(
        category,
        system.decay
      );


    if (
      Number(
        system.decay ??
        0
      ) !==
      decay
    ) {

      updates[
        "system.decay"
      ] =
        decay;
    }


    /* ------------------------------------------------------ */
    /* TRAITS / LEGACY EQUIPPABLE                             */
    /* ------------------------------------------------------ */

    const traits =
      getItemTraits(
        system
      );


    if (
      Boolean(
        system.traits
          ?.equippable
      ) !==
      traits.equippable
    ) {

      updates[
        "system.traits.equippable"
      ] =
        traits.equippable;
    }


    /*
     * Once the old top-level equippable value has been
     * copied into Item v3 traits, remove the legacy field.
     * This prevents an old true value from permanently
     * overriding the new checkbox.
     */
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          system,
          "equippable"
        )
    ) {

      updates[
        "system.-=equippable"
      ] =
        null;
    }


    if (
      Boolean(
        system.traits
          ?.keyItem
      ) !==
      traits.keyItem
    ) {

      updates[
        "system.traits.keyItem"
      ] =
        traits.keyItem;
    }


    if (
      Number(
        system.traits
          ?.bulkySlots ??
        0
      ) !==
      traits.bulkySlots
    ) {

      updates[
        "system.traits.bulkySlots"
      ] =
        traits.bulkySlots;
    }


    /* ------------------------------------------------------ */
    /* LEGACY CARRY VALUE                                     */
    /* ------------------------------------------------------ */

    const carryMode =
      normalizeCarryMode(
        system.carryMode
      );


    if (
      system.carryMode !==
      carryMode
    ) {

      updates[
        "system.carryMode"
      ] =
        carryMode;
    }


    /* ------------------------------------------------------ */
    /* WEAPON BASE DIE MIGRATION                              */
    /* ------------------------------------------------------ */

    const baseDie =
      getWeaponBaseDie(
        system
      );


    if (
      (
        system.weapon
          ?.baseDie ??
        ""
      ) !==
      baseDie
    ) {

      updates[
        "system.weapon.baseDie"
      ] =
        baseDie;
    }


    if (
      Object.prototype
        .hasOwnProperty
        .call(
          system.weapon ??
            {},
          "die"
        )
    ) {

      updates[
        "system.weapon.-=die"
      ] =
        null;
    }


    /* ------------------------------------------------------ */
    /* EQUIPMENT STATE                                        */
    /* ------------------------------------------------------ */

    const actor =
      this.document.parent;


    const ownedByCharacter =
      actor?.documentName ===
        "Actor" &&
      actor.type ===
        "character";


    const assignedToSlot =
      ownedByCharacter &&
      this._itemIsAssignedToSlot(
        actor
      );


    const proposedSystem =
      foundry.utils.deepClone(
        system
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
      ...(
        proposedSystem.traits ??
        {}
      ),

      ...traits
    };


    proposedSystem.weapon = {
      ...(
        proposedSystem.weapon ??
        {}
      ),

      baseDie
    };


    const mayBeEquipped =
      isItemEquippable(
        proposedSystem
      ) &&
      ownedByCharacter &&
      carryMode === "slot" &&
      assignedToSlot;


    if (
      Boolean(
        system.equipped
      ) &&
      !mayBeEquipped
    ) {

      updates[
        "system.equipped"
      ] =
        false;
    }


    if (
      Object.keys(
        updates
      ).length ===
      0
    ) {

      return;
    }


    await this.document.update(
      updates,
      {
        render:
          false
      }
    );
  }


  /* ======================================================== */
  /* INVENTORY HELPERS                                        */
  /* ======================================================== */

  _itemIsAssignedToSlot(
    actor
  ) {

    const slots =
      Array.isArray(
        actor.system
          ?.inventory
          ?.slots
      )
        ? actor.system
            .inventory
            .slots
        : [];


    return slots.some(
      slot =>
        slot?.kind ===
          "item" &&
        slot?.itemId ===
          this.document.id
    );
  }


  _normalizeSlots(
    rawSlots
  ) {

    const existing =
      Array.isArray(
        rawSlots
      )
        ? rawSlots
        : [];


    return Array.from(
      {
        length:
          DELVER_MAX_INVENTORY_SLOTS
      },

      (_, index) => {

        const slot =
          existing[index];


        if (!slot) {

          return (
            emptyInventorySlot()
          );
        }


        return {
          kind:
            slot.kind ??
            "empty",

          itemId:
            slot.itemId ??
            "",

          label:
            slot.label ??
            ""
        };
      }
    );
  }
}