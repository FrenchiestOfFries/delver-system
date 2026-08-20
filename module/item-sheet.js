const DELVER_MAX_INVENTORY_SLOTS = 20;
const DELVER_BASE_INVENTORY_SLOTS = 10;

const VALID_CARRY_MODES = new Set([
  "slot",
  "loose",
  "backpack",
  "bulky"
]);


function emptyInventorySlot() {
  return {
    kind: "empty",
    itemId: "",
    label: ""
  };
}


/**
 * Delver generic Item sheet.
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
          "delver-item"
        ],

        template:
          "systems/delver/templates/item-sheet.html",

        width: 560,
        height: 600,

        resizable: true
      }
    );
  }


  /* ======================================================== */
  /* SHEET DATA                                               */
  /* ======================================================== */

  async getData(options) {

    const context =
      await super.getData(
        options
      );


    const system =
      this.document.system ?? {};


    const category =
      system.category ??
      "misc";


    const carryMode =
      this._normalizeCarryMode(
        system.carryMode
      );


    const inherentlyEquippable =
      (
        category === "weapon" ||
        category === "armor"
      );


    const equippable =
      inherentlyEquippable ||
      Boolean(
        system.equippable
      );


    const actor =
      this.document.parent;


    const ownedByCharacter =
      actor?.documentName === "Actor" &&
      actor.type === "character";


    const assignedToSlot =
      ownedByCharacter
        ? this._itemIsAssignedToSlot(
            actor
          )
        : false;


    const canEquipHere =
      ownedByCharacter &&
      equippable &&
      carryMode === "slot" &&
      assignedToSlot;


    context.item =
      this.document;


    /*
     * Normalize the carryMode for display immediately,
     * even before an old "large" Item is persisted as
     * "bulky".
     */
    context.systemData = {
      ...system,
      carryMode
    };


    context.isWeapon =
      category === "weapon";


    context.isArmor =
      category === "armor";


    context.isSpellVessel =
      category ===
      "spell-vessel";


    context.hasCharges =
      Boolean(
        system.charges?.enabled
      );


    context.isInherentlyEquippable =
      inherentlyEquippable;


    context.isEquippable =
      equippable;


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
    super.activateListeners(html);


    if (!this.isEditable) {
      return;
    }


    html
      .find(
        '[name="system.category"]'
      )
      .on(
        "change",
        this._onCategoryChange.bind(this)
      );


    html
      .find(
        '[name="system.charges.enabled"]'
      )
      .on(
        "change",
        this._onChargesToggle.bind(this)
      );


    html
      .find(
        '[name="system.carryMode"]'
      )
      .on(
        "change",
        this._onCarryModeChange.bind(this)
      );


    html
      .find(
        '[name="system.equippable"]'
      )
      .on(
        "change",
        this._onEquippableChange.bind(this)
      );


    /*
     * Cleanup legacy or impossible state whenever
     * an Item is opened.
     */
    void this._ensureItemIntegrity();
  }


  /* ======================================================== */
  /* CATEGORY                                                 */
  /* ======================================================== */

  async _onCategoryChange(event) {
    event.preventDefault();


    await this.submit({
      preventClose: true,
      preventRender: true
    });


    await this._ensureItemIntegrity();


    this.render(false);


    this.document.parent
      ?.sheet
      ?.render(false);
  }


  /* ======================================================== */
  /* CHARGES                                                  */
  /* ======================================================== */

  async _onChargesToggle(event) {
    event.preventDefault();


    await this.submit({
      preventClose: true,
      preventRender: true
    });


    this.render(false);
  }


  /* ======================================================== */
  /* EQUIPPABLE                                               */
  /* ======================================================== */

  async _onEquippableChange(event) {
    event.preventDefault();


    await this.submit({
      preventClose: true,
      preventRender: true
    });


    await this._ensureItemIntegrity();


    this.render(false);


    this.document.parent
      ?.sheet
      ?.render(false);
  }


  /* ======================================================== */
  /* CARRY MODE                                               */
  /* ======================================================== */

  async _onCarryModeChange(event) {
    event.preventDefault();


    const oldCarryMode =
      this._normalizeCarryMode(
        this.document.system
          ?.carryMode
      );


    const newCarryMode =
      this._normalizeCarryMode(
        event.currentTarget.value
      );


    /*
     * Save the complete Item form first.
     *
     * SimpleItem._preUpdate will automatically clear
     * Equipped if the new location cannot support it.
     */
    await this.submit({
      preventClose: true,
      preventRender: true
    });


    const success =
      await this._syncCharacterCarryMode(
        oldCarryMode,
        newCarryMode
      );


    /*
     * Moving TO numbered inventory may fail if every
     * available slot is occupied.
     */
    if (!success) {

      await this.document.update({
        "system.carryMode":
          oldCarryMode
      });
    }


    await this._ensureItemIntegrity();


    this.render(false);


    const actor =
      this.document.parent;


    if (
      actor?.documentName ===
      "Actor"
    ) {

      actor.sheet?.render(false);
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


    /*
     * World Items are templates and do not have
     * Character inventory slots to synchronize.
     */
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

      /*
       * Equipped state is already cleared by the
       * Item document integrity rule.
       */
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
      currentIndices.length > 0
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
          slot.kind === "empty"
      );


    if (
      emptyIndex === -1
    ) {

      ui.notifications.warn(
        "No available inventory slot. Move or drop something before changing this Item to Inventory Slot."
      );


      return false;
    }


    slots[emptyIndex] = {
      kind: "item",
      itemId: this.document.id,
      label: ""
    };


    await actor.update({
      "system.inventory.slots":
        slots
    });


    /*
     * Returning an Item to inventory does NOT
     * automatically re-equip it.
     */
    return true;
  }


  /* ======================================================== */
  /* ITEM INTEGRITY                                           */
  /* ======================================================== */

  async _ensureItemIntegrity() {

    const system =
      this.document.system ?? {};


    const updates =
      {};


    /* ------------------------------------------------------ */
    /* Legacy Large -> Bulky                                  */
    /* ------------------------------------------------------ */

    const normalizedCarryMode =
      this._normalizeCarryMode(
        system.carryMode
      );


    if (
      system.carryMode !==
      normalizedCarryMode
    ) {

      updates[
        "system.carryMode"
      ] =
        normalizedCarryMode;
    }


    /* ------------------------------------------------------ */
    /* Equipment State                                        */
    /* ------------------------------------------------------ */

    const equippable =
      this._isItemEquippable();


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


    const mayBeEquipped =
      equippable &&
      ownedByCharacter &&
      normalizedCarryMode ===
        "slot" &&
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
      ).length === 0
    ) {

      return;
    }


    await this.document.update(
      updates,
      {
        render: false
      }
    );
  }


  /* ======================================================== */
  /* INVENTORY HELPERS                                        */
  /* ======================================================== */

  _itemIsAssignedToSlot(actor) {

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
        slot?.kind ===
          "item" &&
        slot?.itemId ===
          this.document.id
    );
  }


  _isItemEquippable() {

    const category =
      this.document.system
        ?.category ??
      "misc";


    if (
      category === "weapon" ||
      category === "armor"
    ) {

      return true;
    }


    return Boolean(
      this.document.system
        ?.equippable
    );
  }


  _normalizeSlots(rawSlots) {

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

          return emptyInventorySlot();
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


  _normalizeCarryMode(value) {

    /*
     * Migration from the old name.
     */
    if (
      value === "large"
    ) {

      return "bulky";
    }


    return VALID_CARRY_MODES.has(
      value
    )
      ? value
      : "slot";
  }
}