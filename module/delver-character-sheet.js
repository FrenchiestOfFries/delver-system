import {
  runTakeDamage
} from "./delver-damage.js";

import {
  getItemDerivedData,
  isItemEquippable,
  normalizeItemCategory
} from "./delver-item-rules.js";

const DELVER_MAX_INVENTORY_SLOTS = 20;
const DELVER_BASE_INVENTORY_SLOTS = 10;
const DELVER_BASE_DEFENSE = 10;
const DELVER_BASE_SPEED = 30;
const DELVER_MAX_LUCK = 20;

const ABILITY_KEYS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

const VALID_SLOT_KINDS = new Set([
  "empty",
  "item",
  "reserved",
  "wound",
  "fatigue"
]);

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


function reservedInventorySlot(itemId) {
  return {
    kind: "reserved",
    itemId,
    label: ""
  };
}


function conditionInventorySlot(kind) {
  return {
    kind,
    itemId: "",
    label: ""
  };
}


export class DelverCharacterSheet extends ActorSheet {

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
          "actor",
          "character"
        ],

        template:
          "systems/delver/templates/delver-character-sheet.html",

        width: 900,
        height: 920,

        resizable: true,

        dragDrop: [
          {
            dragSelector:
              ".delver-owned-item",

            dropSelector:
              ".inv-slot, .carry-zone"
          }
        ]
      }
    );
  }


  /* ======================================================== */
  /* SHEET DATA                                               */
  /* ======================================================== */

  getData() {
    const context =
      super.getData();


    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const inventoryCapacity =
      this._clamp(
        DELVER_BASE_INVENTORY_SLOTS +
          systemData.abilities.con,

        0,
        DELVER_MAX_INVENTORY_SLOTS
      );


    const defenseOverride =
      this._nullableNumber(
        systemData.defense.override
      );


    const speedOverride =
      this._nullableNumber(
        systemData.movement.override
      );


    const speed =
      speedOverride === null
        ? DELVER_BASE_SPEED
        : speedOverride;


    /* ------------------------------------------------------ */
    /* INVENTORY SLOTS                                        */
    /* ------------------------------------------------------ */

    const rawInventorySlots =
      systemData.inventory.slots;


    const inventorySlots =
      rawInventorySlots.map(
        (slot, index) => {

          const available =
            index <
            inventoryCapacity;


          const occupied =
            slot.kind !==
            "empty";


          const overCapacity =
            !available &&
            occupied;


          const itemBacked =
            (
              slot.kind === "item" ||
              slot.kind === "reserved"
            ) &&
            Boolean(
              slot.itemId
            );


          const embeddedItem =
            itemBacked
              ? this.actor.items.get(
                  slot.itemId
                )
              : null;


          const anchorIndex =
            embeddedItem
              ? rawInventorySlots
                  .findIndex(
                    candidate =>
                      candidate.kind ===
                        "item" &&
                      candidate.itemId ===
                        embeddedItem.id
                  )
              : -1;


          const itemDerived =
            embeddedItem
              ? getItemDerivedData(
                  embeddedItem.system ?? {}
                )
              : null;


          const bulkySlotCost =
            itemDerived?.bulky
              ? Math.max(
                  2,
                  Math.trunc(
                    Number(
                      itemDerived.slotCost
                    ) || 2
                  )
                )
              : 1;


          const bulkyPosition =
            itemDerived?.bulky &&
            anchorIndex >= 0
              ? (
                  index -
                  anchorIndex +
                  1
                )
              : 0;


          const isBulky =
            Boolean(
              itemDerived?.bulky &&
              bulkyPosition >= 1 &&
              bulkyPosition <=
                bulkySlotCost
            );


          const isBulkyAnchor =
            isBulky &&
            slot.kind === "item" &&
            bulkyPosition === 1;


          const isBulkyReserved =
            isBulky &&
            slot.kind ===
              "reserved";


          let kindLabel =
            "Empty";

          let displayLabel =
            "";

          let itemImg =
            "";


          if (
            slot.kind === "item"
          ) {

            kindLabel =
              "Item";


            displayLabel =
              embeddedItem?.name ??
              slot.label ??
              "Missing Item";


            itemImg =
              embeddedItem?.img ??
              "";
          }


          if (
            slot.kind === "reserved"
          ) {

            kindLabel =
              "Reserved";


            displayLabel =
              embeddedItem?.name ??
              "Reserved";
          }


          if (
            slot.kind === "wound"
          ) {

            kindLabel =
              "Wound";

            displayLabel =
              "Wound";
          }


          if (
            slot.kind === "fatigue"
          ) {

            kindLabel =
              "Fatigue";

            displayLabel =
              "Fatigue";
          }


          return {
            ...slot,

            index,

            number:
              index + 1,

            available,
            occupied,
            overCapacity,

            kindLabel,
            displayLabel,

            hasEmbeddedItem:
              Boolean(
                embeddedItem
              ),

            itemImg,

            isBulky,
            isBulkyAnchor,
            isBulkyReserved,

            bulkySlotCost:
              isBulky
                ? bulkySlotCost
                : 1,

            bulkyPosition:
              isBulky
                ? bulkyPosition
                : 0,

            bulkyStart:
              isBulky &&
              bulkyPosition === 1,

            bulkyEnd:
              isBulky &&
              bulkyPosition ===
                bulkySlotCost
          };
        }
      );


    /* ------------------------------------------------------ */
    /* SLOTTED ITEM IDS                                       */
    /* ------------------------------------------------------ */

    const slotItemIds =
      new Set(
        inventorySlots
          .filter(
            slot =>
              slot.kind ===
                "item" &&
              slot.itemId
          )
          .map(
            slot =>
              slot.itemId
          )
      );


    /* ------------------------------------------------------ */
    /* ARMOR / DEFENSE                                        */
    /* ------------------------------------------------------ */

    const equippedArmorItems =
      this.actor.items.filter(
        item =>
          normalizeItemCategory(
            item.system
              ?.category
          ) === "armor" &&

          this._isItemEquippable(
            item
          ) &&

          Boolean(
            item.system
              ?.equipped
          ) &&

          this._normalizeCarryMode(
            item.system
              ?.carryMode
          ) === "slot" &&

          slotItemIds.has(
            item.id
          )
      );


    const armorDefense =
      equippedArmorItems.reduce(
        (total, item) => {

          const bonus =
            this._numberOr(
              item.system
                ?.armor
                ?.defense,

              0
            );


          return (
            total +
            bonus
          );
        },

        0
      );


    const defense =
      defenseOverride === null
        ? DELVER_BASE_DEFENSE +
          armorDefense
        : defenseOverride;


    /* ------------------------------------------------------ */
    /* OTHER CARRY LOCATIONS                                  */
    /* ------------------------------------------------------ */

    const carriedLooselyItems =
      [];

    const backpackItems =
      [];

    const bulkyItems =
      [];

    const unassignedSlotItems =
      [];


    for (
      const item of
        this.actor.items
    ) {

      const carryMode =
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        );


      const view =
        this._itemViewData(
          item
        );


      if (
        carryMode === "loose"
      ) {

        carriedLooselyItems.push(
          view
        );

        continue;
      }


      if (
        carryMode === "backpack"
      ) {

        backpackItems.push(
          view
        );

        continue;
      }


      if (
        carryMode === "bulky"
      ) {

        bulkyItems.push(
          view
        );

        continue;
      }


      if (
        carryMode === "slot" &&
        !slotItemIds.has(
          item.id
        )
      ) {

        unassignedSlotItems.push(
          view
        );
      }
    }


    /* ------------------------------------------------------ */
    /* COUNTS                                                 */
    /* ------------------------------------------------------ */

    const usedSlots =
      inventorySlots.filter(
        slot =>
          slot.occupied
      ).length;


    const wounds =
      inventorySlots.filter(
        slot =>
          slot.kind === "wound"
      ).length;


    const fatigue =
      inventorySlots.filter(
        slot =>
          slot.kind === "fatigue"
      ).length;


    const overCapacity =
      inventorySlots.filter(
        slot =>
          slot.overCapacity
      ).length;


    /* ------------------------------------------------------ */
    /* TEMPLATE CONTEXT                                       */
    /* ------------------------------------------------------ */

    context.systemData =
      systemData;


    context.inventorySlots =
      inventorySlots;


    context.carriedLooselyItems =
      carriedLooselyItems;


    context.backpackItems =
      backpackItems;


    context.bulkyItems =
      bulkyItems;


    context.unassignedSlotItems =
      unassignedSlotItems;


    context.hasCarriedLooselyItems =
      carriedLooselyItems.length >
      0;


    context.hasBackpackItems =
      backpackItems.length >
      0;


    context.hasBulkyItems =
      bulkyItems.length >
      0;


    context.hasUnassignedSlotItems =
      unassignedSlotItems.length >
      0;


    context.isEditable =
      this.isEditable;


    context.derived = {
      inventoryCapacity,

      inventoryMax:
        DELVER_MAX_INVENTORY_SLOTS,

      usedSlots,

      wounds,
      fatigue,
      overCapacity,

      defense,

      armorDefense,

      equippedArmorCount:
        equippedArmorItems.length,

      speed,

      baseDefense:
        DELVER_BASE_DEFENSE,

      baseSpeed:
        DELVER_BASE_SPEED,

      hasDefenseOverride:
        defenseOverride !==
        null,

      hasSpeedOverride:
        speedOverride !==
        null
    };


    return context;
  }


  /* ======================================================== */
  /* LISTENERS                                                */
  /* ======================================================== */

  activateListeners(html) {
    super.activateListeners(
      html
    );


    /* ------------------------------------------------------ */
    /* DOUBLE CLICK -> PROPERTIES                              */
    /* ------------------------------------------------------ */

    html.find(
      ".delver-owned-item"
    ).on(
      "dblclick",
      this._onInventoryItemOpen.bind(
        this
      )
    );


    /* ------------------------------------------------------ */
    /* DROP HOVER CLEANUP                                     */
    /* ------------------------------------------------------ */

    html.find(
      ".inv-slot, .carry-zone"
    ).on(
      "dragleave",
      event => {

        event.currentTarget
          .classList
          .remove(
            "slot-drop-valid",
            "slot-drop-invalid",
            "carry-drop-valid"
          );
      }
    );


    /* ------------------------------------------------------ */
    /* CONTEXT MENUS                                          */
    /* ------------------------------------------------------ */

    this._createDelverContextMenus(
      html
    );


    if (
      !this.isEditable
    ) {

      return;
    }


    /* ------------------------------------------------------ */
    /* GAME ACTIONS                                           */
    /* ------------------------------------------------------ */

    html.find(
      ".take-damage-action"
    ).on(
      "click",
      this._onTakeDamage.bind(
        this
      )
    );

    html.find(
      ".spend-luck-action"
    ).on(
      "click",
      this._onSpendLuck.bind(
        this
      )
    );

    html.find(
      ".level-up-action"
    ).on(
      "click",
      this._onLevelUp.bind(
        this
      )
    );


    /* ------------------------------------------------------ */
    /* INTEGRITY                                              */
    /* ------------------------------------------------------ */

    void this
      ._ensureDelverIntegrity();
  }


  /* ======================================================== */
  /* TAKE DAMAGE                                              */
  /* ======================================================== */

  async _onTakeDamage(event) {
    event.preventDefault();


    await runTakeDamage(
      this
    );
  }


  /* ======================================================== */
  /* SPEND LUCK                                               */
  /* ======================================================== */

  async _onSpendLuck(event) {
    event.preventDefault();


    if (
      !this.isEditable
    ) {

      return;
    }


    /*
    * Preserve anything currently typed elsewhere on the
    * Character sheet before changing the Actor.
    */
    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    const currentLuck =
      this._clamp(
        this._numberOr(
          this.actor.system
            ?.resources
            ?.luck
            ?.current,

          0
        ),

        0,
        DELVER_MAX_LUCK
      );


    if (
      currentLuck <= 0
    ) {

      return;
    }


    const newLuck =
      currentLuck - 1;


    await this.actor.update({
      "system.resources.luck.current":
        newLuck
    });


    console.debug(
      "Delver | Luck spent:",
      {
        actor:
          this.actor.name,

        previousLuck:
          currentLuck,

        resultingLuck:
          newLuck
      }
    );
  }

  /* ======================================================== */
  /* FULL INTEGRITY PASS                                      */
  /* ======================================================== */

  async _ensureDelverIntegrity() {

    await this
      ._ensureCharacterV2Data();


    await this
      ._ensureOwnedItemIntegrity();


    await this
      ._ensureInventoryIntegrity();
  }

  /* ======================================================== */
  /* LEVEL UP                                                 */
  /* ======================================================== */

  async _onLevelUp(event) {
    event.preventDefault();


    if (
      !this.isEditable
    ) {

      return;
    }


    /*
     * Direct Level editing remains available for GM correction.
     * This button is the actual Delver level-up workflow.
     */
    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const currentLevel =
      Math.max(
        0,
        Math.trunc(
          this._numberOr(
            systemData.identity
              ?.level,
            1
          )
        )
      );


    const currentScars =
      Math.max(
        0,
        Math.trunc(
          this._numberOr(
            systemData.resources
              ?.scars,
            0
          )
        )
      );


    const currentMaxHp =
      Math.max(
        0,
        Math.trunc(
          this._numberOr(
            systemData.resources
              ?.hp
              ?.max,
            1
          )
        )
      );


    const slots =
      this._normalizeInventorySlots(
        systemData.inventory
          ?.slots
      );


    const woundCount =
      slots.filter(
        slot =>
          slot.kind ===
          "wound"
      ).length;


    /*
     * Level-up lifecycle:
     *
     * Wounds -> Scars
     * All Scars -> Max HP
     *
     * Therefore every existing Scar plus every current
     * Wound becomes +1 Max HP during this level-up.
     */
    const hpGain =
      currentScars +
      woundCount;


    const newLevel =
      currentLevel + 1;


    const newMaxHp =
      currentMaxHp +
      hpGain;


    const confirmed =
      await foundry
        .applications
        .api
        .DialogV2
        .confirm({

          window: {
            title:
              `Level Up to ${newLevel}`
          },

          content:
            `<p>Advance to Level <strong>${newLevel}</strong>?</p>` +
            `<p>Current Wounds become Scars, then all ` +
            `Scars convert into Max HP.</p>` +
            `<ul>` +
            `<li>Wounds converted: <strong>${woundCount}</strong></li>` +
            `<li>Existing Scars converted: <strong>${currentScars}</strong></li>` +
            `<li>Max HP: <strong>${currentMaxHp}</strong> → <strong>${newMaxHp}</strong></li>` +
            `</ul>`,

          yes: {
            label:
              "Level Up"
          },

          no: {
            label:
              "Cancel"
          },

          rejectClose:
            false,

          modal:
            true
        });


    if (!confirmed) {
      return;
    }


    const leveledSlots =
      slots.map(
        slot =>
          slot.kind ===
          "wound"
            ? emptyInventorySlot()
            : slot
      );


    await this.actor.update({
      "system.identity.level":
        newLevel,

      "system.resources.scars":
        0,

      "system.resources.hp.max":
        newMaxHp,

      "system.inventory.slots":
        leveledSlots
    });


    ui.notifications.info(
      hpGain > 0
        ? `Level ${newLevel}: +${hpGain} Max HP.`
        : `Advanced to Level ${newLevel}.`
    );
  }

  /* ======================================================== */
  /* CONTEXT MENUS                                            */
  /* ======================================================== */

  _createDelverContextMenus(html) {

    const ContextMenu =
      foundry.applications
        .ux
        .ContextMenu;


    let itemMenu;


    itemMenu =
      new ContextMenu(
        html[0],

        ".delver-owned-item",

        this._getItemContextOptions(),

        {
          fixed:
            true,

          jQuery:
            false,

          onOpen: () => {

            this._styleDelverContextMenu(
              itemMenu,
              "item"
            );
          }
        }
      );


    let slotMenu;


    slotMenu =
      new ContextMenu(
        html[0],

        [
          ".inv-slot.kind-empty:not(.slot-unavailable)",
          ".inv-slot.kind-wound",
          ".inv-slot.kind-fatigue"
        ].join(", "),

        this._getSlotContextOptions(),

        {
          fixed:
            true,

          jQuery:
            false,

          onOpen: () => {

            this._styleDelverContextMenu(
              slotMenu,
              "slot"
            );
          }
        }
      );


    this._delverContextMenus = {
      item:
        itemMenu,

      slot:
        slotMenu
    };
  }


  _styleDelverContextMenu(
    menu,
    type
  ) {

    const element =
      menu?.element;


    if (!element) {
      return;
    }


    element.classList.add(
      "delver-context-menu",
      `delver-context-${type}`
    );
  }


  /* ======================================================== */
  /* ITEM CONTEXT OPTIONS                                     */
  /* ======================================================== */

  _getItemContextOptions() {

    return [

      /* OPEN */

      {
        name:
          "Open / Properties",

        icon:
          '<i class="fa-solid fa-folder-open"></i>',

        group:
          "primary",

        condition:
          target =>
            Boolean(
              this._getItemFromContextTarget(
                target
              )
            ),

        callback:
          target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            item?.sheet?.render(
              true
            );
          }
      },


      /* EQUIP */

      {
        name:
          "Equip",

        icon:
          '<i class="fa-solid fa-hand"></i>',

        group:
          "equipment",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            return (
              this._canEquipItemNow(
                item
              ) &&
              !Boolean(
                item?.system
                  ?.equipped
              )
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await item.update({
              "system.equipped":
                true
            });


            this.render(false);
          }
      },


      /* UNEQUIP */

      {
        name:
          "Unequip",

        icon:
          '<i class="fa-solid fa-hand-back-fist"></i>',

        group:
          "equipment",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            return (
              this._isItemEquippable(
                item
              ) &&
              Boolean(
                item?.system
                  ?.equipped
              )
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await item.update({
              "system.equipped":
                false
            });


            this.render(false);
          }
      },


      /* MOVE TO INVENTORY */

      {
        name:
          "Move to Inventory",

        icon:
          '<i class="fa-solid fa-box-open"></i>',

        group:
          "move",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return false;
            }


            return (
              !this
                ._itemIsAssignedToSlot(
                  item.id
                )
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await this
              ._moveOwnedItemToFirstAvailableSlot(
                item
              );
          }
      },


      /* LOOSE */

      {
        name:
          "Move to Carried Loosely",

        icon:
          '<i class="fa-solid fa-coins"></i>',

        group:
          "move",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            return (
              item &&
              this._normalizeCarryMode(
                item.system
                  ?.carryMode
              ) !== "loose"
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await this
              ._moveOwnedItemToCarryMode(
                item,
                "loose"
              );
          }
      },


      /* BACKPACK */

      {
        name:
          "Move to Backpack",

        icon:
          '<i class="fa-solid fa-suitcase"></i>',

        group:
          "move",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            return (
              item &&
              this._normalizeCarryMode(
                item.system
                  ?.carryMode
              ) !==
              "backpack"
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await this
              ._moveOwnedItemToCarryMode(
                item,
                "backpack"
              );
          }
      },


      /* BULKY */

      {
        name:
          "Move to Bulky / In Hands",

        icon:
          '<i class="fa-solid fa-box"></i>',

        group:
          "move",

        condition:
          target => {

            if (
              !this.isEditable
            ) {

              return false;
            }


            const item =
              this._getItemFromContextTarget(
                target
              );


            return (
              item &&
              this._normalizeCarryMode(
                item.system
                  ?.carryMode
              ) !==
              "bulky"
            );
          },

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await this
              ._moveOwnedItemToCarryMode(
                item,
                "bulky"
              );
          }
      },


      /* DELETE */

      {
        name:
          "Delete",

        icon:
          '<i class="fa-solid fa-trash"></i>',

        classes:
          "delver-context-danger",

        group:
          "danger",

        condition:
          target =>
            this.isEditable &&
            Boolean(
              this._getItemFromContextTarget(
                target
              )
            ),

        callback:
          async target => {

            const item =
              this._getItemFromContextTarget(
                target
              );


            if (!item) {
              return;
            }


            await this
              ._deleteOwnedItem(
                item
              );
          }
      }
    ];
  }


  _getItemFromContextTarget(
    target
  ) {

    const itemId =
      target?.dataset?.itemId;


    if (!itemId) {
      return null;
    }


    return (
      this.actor.items.get(
        itemId
      ) ??
      null
    );
  }


  /* ======================================================== */
  /* EQUIPMENT RULES                                          */
  /* ======================================================== */

  _isItemEquippable(item) {

    if (!item) {
      return false;
    }


    return isItemEquippable(
      item.system ?? {}
    );
  }


  _canEquipItemNow(item) {

    if (
      !this._isItemEquippable(
        item
      )
    ) {

      return false;
    }


    if (
      this._normalizeCarryMode(
        item.system
          ?.carryMode
      ) !== "slot"
    ) {

      return false;
    }


    return this
      ._itemIsAssignedToSlot(
        item.id
      );
  }


  _itemIsAssignedToSlot(
    itemId
  ) {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    return slots.some(
      slot =>
        slot.kind === "item" &&
        slot.itemId === itemId
    );
  }


  /* ======================================================== */
  /* SLOT CONTEXT OPTIONS                                     */
  /* ======================================================== */

  _getSlotContextOptions() {

    return [

      {
        name:
          "Add Wound",

        icon:
          '<i class="fa-solid fa-droplet"></i>',

        group:
          "condition",

        condition:
          target =>
            this.isEditable &&
            this._getSlotKindFromContext(
              target
            ) === "empty" &&
            this._slotContextIsAvailable(
              target
            ),

        callback:
          async target => {

            await this
              ._setInventoryCondition(
                this._getSlotIndexFromContext(
                  target
                ),
                "wound"
              );
          }
      },


      {
        name:
          "Add Fatigue",

        icon:
          '<i class="fa-solid fa-bolt"></i>',

        group:
          "condition",

        condition:
          target =>
            this.isEditable &&
            this._getSlotKindFromContext(
              target
            ) === "empty" &&
            this._slotContextIsAvailable(
              target
            ),

        callback:
          async target => {

            await this
              ._setInventoryCondition(
                this._getSlotIndexFromContext(
                  target
                ),
                "fatigue"
              );
          }
      },


      {
        name:
          "Recover Wound",

        icon:
          '<i class="fa-solid fa-bandage"></i>',

        classes:
          "delver-context-condition-clear",

        group:
          "clear",

        condition:
          target =>
            this.isEditable &&
            this._getSlotKindFromContext(
              target
            ) === "wound",

        callback:
          async target => {

            await this
              ._confirmRecoverInventoryWound(
                this._getSlotIndexFromContext(
                  target
                )
              );
          }
      },


      {
        name:
          "Clear Fatigue",

        icon:
          '<i class="fa-solid fa-xmark"></i>',

        classes:
          "delver-context-condition-clear",

        group:
          "clear",

        condition:
          target =>
            this.isEditable &&
            this._getSlotKindFromContext(
              target
            ) === "fatigue",

        callback:
          async target => {

            await this
              ._confirmClearInventoryCondition(
                this._getSlotIndexFromContext(
                  target
                ),
                "fatigue"
              );
          }
      }
    ];
  }


  _getSlotIndexFromContext(target) {
    return Number(
      target?.dataset?.index
    );
  }


  _getSlotKindFromContext(target) {
    return (
      target?.dataset?.kind ??
      ""
    );
  }


  _slotContextIsAvailable(target) {
    return (
      target?.dataset?.available ===
      "true"
    );
  }


  /* ======================================================== */
  /* WOUND / FATIGUE                                          */
  /* ======================================================== */

  async _setInventoryCondition(
    index,
    kind
  ) {

    if (
      kind !== "wound" &&
      kind !== "fatigue"
    ) {

      return;
    }


    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const capacity =
      this._clamp(
        DELVER_BASE_INVENTORY_SLOTS +
          systemData.abilities.con,

        0,
        DELVER_MAX_INVENTORY_SLOTS
      );


    if (
      index < 0 ||
      index >= capacity
    ) {

      ui.notifications.warn(
        `Inventory slot ${index + 1} is unavailable.`
      );


      return;
    }


    const slots =
      this._normalizeInventorySlots(
        systemData.inventory.slots
      );


    if (
      slots[index].kind !==
      "empty"
    ) {

      ui.notifications.warn(
        "That inventory slot is already occupied."
      );


      return;
    }


    slots[index] =
      conditionInventorySlot(
        kind
      );


    await this.actor.update({
      "system.inventory.slots":
        slots
    });
  }

    async _confirmRecoverInventoryWound(
    index
  ) {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    if (
      index < 0 ||
      index >= slots.length ||
      slots[index].kind !==
        "wound"
    ) {

      return;
    }


    const confirmed =
      await foundry
        .applications
        .api
        .DialogV2
        .confirm({

          window: {
            title:
              "Recover Wound"
          },

          content:
            `<p>Recover the Wound in inventory slot ${index + 1}?</p>` +
            `<p>The Wound is removed and becomes <strong>1 Scar</strong>.</p>`,

          yes: {
            label:
              "Recover Wound"
          },

          no: {
            label:
              "Cancel"
          },

          rejectClose:
            false,

          modal:
            true
        });


    if (!confirmed) {
      return;
    }


    await this
      ._recoverInventoryWound(
        index
      );
  }


  async _recoverInventoryWound(
    index
  ) {

    /*
     * Preserve edits currently typed elsewhere on the
     * Character sheet before applying recovery.
     */
    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const slots =
      this._normalizeInventorySlots(
        systemData.inventory
          ?.slots
      );


    if (
      index < 0 ||
      index >= slots.length ||
      slots[index].kind !==
        "wound"
    ) {

      return;
    }


    const scars =
      Math.max(
        0,
        Math.trunc(
          this._numberOr(
            systemData.resources
              ?.scars,
            0
          )
        )
      );


    slots[index] =
      emptyInventorySlot();


    await this.actor.update({
      "system.inventory.slots":
        slots,

      "system.resources.scars":
        scars + 1
    });
  }

  async _confirmClearInventoryCondition(
    index,
    kind
  ) {

    if (
      kind !== "wound" &&
      kind !== "fatigue"
    ) {

      return;
    }


    const name =
      kind === "wound"
        ? "Wound"
        : "Fatigue";


    const confirmed =
      await foundry
        .applications
        .api
        .DialogV2
        .confirm({

          window: {
            title:
              `Clear ${name}`
          },

          content:
            `<p>Remove this ${name.toLowerCase()} from inventory slot ${index + 1}?</p>`,

          yes: {
            label:
              `Clear ${name}`
          },

          no: {
            label:
              "Cancel"
          },

          rejectClose:
            false,

          modal:
            true
        });


    if (!confirmed) {
      return;
    }


    await this
      ._clearInventoryCondition(
        index
      );
  }


  async _clearInventoryCondition(
    index
  ) {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    if (
      index < 0 ||
      index >= slots.length
    ) {

      return;
    }


    if (
      slots[index].kind !== "wound" &&
      slots[index].kind !== "fatigue"
    ) {

      return;
    }


    slots[index] =
      emptyInventorySlot();


    await this.actor.update({
      "system.inventory.slots":
        slots
    });
  }


  /* ======================================================== */
  /* DRAG / DROP                                              */
  /* ======================================================== */

  _canDragStart() {
    return this.isEditable;
  }


  _canDragDrop() {
    return this.isEditable;
  }


  _onDragStart(event) {

    const element =
      event.target.closest(
        ".delver-owned-item"
      );


    if (!element) {
      return;
    }


    const item =
      this.actor.items.get(
        element.dataset.itemId
      );


    if (!item) {
      return;
    }


    event.dataTransfer.setData(
      "text/plain",

      JSON.stringify(
        item.toDragData()
      )
    );


    event.dataTransfer.effectAllowed =
      "copyMove";
  }


  _onDragOver(event) {
    event.preventDefault();


    const slotElement =
      event.target.closest(
        ".inv-slot"
      );


    if (slotElement) {

      const targetIndex =
        Number(
          slotElement.dataset.index
        );


      const systemData =
        this._buildCharacterData(
          this.actor.system ?? {}
        );


      const capacity =
        this._clamp(
          DELVER_BASE_INVENTORY_SLOTS +
            systemData.abilities.con,

          0,
          DELVER_MAX_INVENTORY_SLOTS
        );


      const slot =
        systemData
          .inventory
          .slots[
            targetIndex
          ];


      /*
       * Lightweight hover feedback only.
       *
       * Exact multi-slot validation happens on drop because
       * external Foundry Item drags are not guaranteed to
       * expose the complete source Item during dragover.
       */
      const valid =
        Number.isInteger(
          targetIndex
        ) &&
        targetIndex >= 0 &&
        targetIndex < capacity &&
        (
          slot?.kind === "empty" ||
          slot?.kind === "item"
        );


      slotElement.classList.toggle(
        "slot-drop-valid",
        valid
      );


      slotElement.classList.toggle(
        "slot-drop-invalid",
        !valid
      );


      return;
    }


    const carryZone =
      event.target.closest(
        ".carry-zone"
      );


    if (carryZone) {

      carryZone.classList.add(
        "carry-drop-valid"
      );
    }
  }


  async _onDrop(event) {
    event.preventDefault();


    const slotElement =
      event.target.closest(
        ".inv-slot"
      );


    const carryZone =
      event.target.closest(
        ".carry-zone"
      );


    if (
      !slotElement &&
      !carryZone
    ) {

      return super._onDrop(
        event
      );
    }


    const data =
      foundry.applications
        .ux
        .TextEditor
        .getDragEventData(
          event
        );


    if (
      !data ||
      data.type !== "Item"
    ) {

      ui.notifications.warn(
        "Only Items can be dropped here."
      );


      return false;
    }


    let sourceItem;


    try {

      sourceItem =
        await Item
          .implementation
          .fromDropData(
            data
          );

    }

    catch (error) {

      console.error(
        "Delver | Failed to resolve dropped Item:",
        error
      );


      ui.notifications.error(
        "Delver could not resolve the dropped Item."
      );


      return false;
    }


    if (!sourceItem) {
      return false;
    }


    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    if (slotElement) {

      slotElement.classList.remove(
        "slot-drop-valid",
        "slot-drop-invalid"
      );


      await this
        ._dropItemIntoSlot(
          sourceItem,

          Number(
            slotElement.dataset.index
          )
        );


      return true;
    }


    carryZone.classList.remove(
      "carry-drop-valid"
    );


    const carryMode =
      this._normalizeCarryMode(
        carryZone.dataset
          .carryTarget
      );


    await this
      ._dropItemIntoCarryMode(
        sourceItem,
        carryMode
      );


    return true;
  }


  async _dropItemIntoSlot(
    sourceItem,
    targetIndex
  ) {

    if (
      !Number.isInteger(
        targetIndex
      ) ||
      targetIndex < 0 ||
      targetIndex >=
        DELVER_MAX_INVENTORY_SLOTS
    ) {

      return;
    }


    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const capacity =
      this._clamp(
        DELVER_BASE_INVENTORY_SLOTS +
          systemData.abilities.con,

        0,
        DELVER_MAX_INVENTORY_SLOTS
      );


    if (
      targetIndex >= capacity
    ) {

      ui.notifications.warn(
        `Inventory slot ${targetIndex + 1} is unavailable.`
      );


      return;
    }


    const slots =
      this._normalizeInventorySlots(
        systemData.inventory.slots
      );


    if (
      sourceItem.parent ===
      this.actor
    ) {

      await this
        ._moveOwnedItemToSlot(
          sourceItem,
          targetIndex,
          slots,
          capacity
        );


      return;
    }


    await this
      ._copyExternalItemToSlot(
        sourceItem,
        targetIndex,
        slots,
        capacity
      );
  }


  async _moveOwnedItemToFirstAvailableSlot(
    item
  ) {

    const systemData =
      this._buildCharacterData(
        this.actor.system ?? {}
      );


    const capacity =
      this._clamp(
        DELVER_BASE_INVENTORY_SLOTS +
          systemData.abilities.con,

        0,
        DELVER_MAX_INVENTORY_SLOTS
      );


    const slots =
      this._normalizeInventorySlots(
        systemData.inventory.slots
      );


    const sourceIndex =
      slots.findIndex(
        slot =>
          slot.kind === "item" &&
          slot.itemId === item.id
      );


    const sourceSlotCost =
      this._getItemSlotCost(
        item
      );


    if (
      sourceIndex >= 0 &&
      sourceIndex +
        sourceSlotCost <=
        capacity &&
      this._itemAllocationIsComplete(
        item,
        sourceIndex,
        slots
      )
    ) {

      return;
    }


    let targetIndex =
      -1;


    for (
      let index = 0;
      index < capacity;
      index++
    ) {

      const test =
        this._canAllocateItemAtSlot(
          item,
          index,
          slots,
          capacity,
          item.id
        );


      if (test.valid) {

        targetIndex =
          index;

        break;
      }
    }


    if (
      targetIndex === -1
    ) {

      const slotCost =
        this._getItemSlotCost(
          item
        );


      ui.notifications.warn(
        slotCost > 1
          ? `No run of ${slotCost} available inventory slots can hold ${item.name}.`
          : "No available inventory slot."
      );


      return;
    }


    await this
      ._moveOwnedItemToSlot(
        item,
        targetIndex,
        slots,
        capacity
      );
  }


  async _moveOwnedItemToSlot(
    item,
    targetIndex,
    slots,
    inventoryCapacity
  ) {

    const sourceIndex =
      slots.findIndex(
        slot =>
          slot.kind === "item" &&
          slot.itemId === item.id
      );


    const sourceSlotCost =
      this._getItemSlotCost(
        item
      );


    const targetSlot =
      slots[targetIndex];


    if (!targetSlot) {
      return;
    }


    if (
      targetSlot.kind === "wound" ||
      targetSlot.kind === "fatigue"
    ) {

      ui.notifications.warn(
        "Items cannot replace Wounds or Fatigue."
      );


      return;
    }


    if (
      targetSlot.kind === "reserved" &&
      targetSlot.itemId !== item.id
    ) {

      ui.notifications.warn(
        "That slot is reserved by a multi-slot Item."
      );


      return;
    }


    /* ------------------------------------------------------ */
    /* SIMPLE 1-SLOT SWAP                                     */
    /* ------------------------------------------------------ */

    if (
      sourceIndex >= 0 &&
      sourceSlotCost === 1 &&
      targetSlot.kind === "item" &&
      targetSlot.itemId !== item.id
    ) {

      const targetItem =
        this.actor.items.get(
          targetSlot.itemId
        );


      const targetSlotCost =
        targetItem
          ? this._getItemSlotCost(
              targetItem
            )
          : 1;


      if (
        targetSlotCost > 1
      ) {

        ui.notifications.warn(
          "Move the multi-slot Item out of that space first."
        );


        return;
      }


      if (
        sourceIndex >=
        inventoryCapacity
      ) {

        ui.notifications.warn(
          "Move the over-capacity Item into an empty available slot first."
        );


        return;
      }


      const sourceSlot = {
        ...slots[sourceIndex]
      };


      slots[sourceIndex] = {
        ...targetSlot
      };


      slots[targetIndex] =
        sourceSlot;


      await this.actor.update({
        "system.inventory.slots":
          slots
      });


      return;
    }


    /* ------------------------------------------------------ */
    /* MULTI-SLOT / EMPTY DESTINATION                         */
    /* ------------------------------------------------------ */

    if (
      targetSlot.kind === "item" &&
      targetSlot.itemId !== item.id
    ) {

      ui.notifications.warn(
        "Move the current Item out of that slot first."
      );


      return;
    }


    const workingSlots =
      slots.map(
        slot => ({
          ...slot
        })
      );


    this._clearItemAllocation(
      workingSlots,
      item.id
    );


    const allocation =
      this._canAllocateItemAtSlot(
        item,
        targetIndex,
        workingSlots,
        inventoryCapacity
      );


    if (!allocation.valid) {

      ui.notifications.warn(
        allocation.reason
      );


      return;
    }


    const previousCarryMode =
      this._normalizeCarryMode(
        item.system
          ?.carryMode
      );


    if (
      previousCarryMode !== "slot"
    ) {

      await item.update({
        "system.carryMode":
          "slot",

        "system.equipped":
          false
      });
    }


    this._allocateItemAtSlot(
      workingSlots,
      item,
      targetIndex
    );


    try {

      await this.actor.update({
        "system.inventory.slots":
          workingSlots
      });

    }

    catch (error) {

      console.error(
        "Delver | Failed to assign owned Item to inventory slots:",
        error
      );


      if (
        previousCarryMode !==
        "slot"
      ) {

        await item.update({
          "system.carryMode":
            previousCarryMode,

          "system.equipped":
            false
        });
      }
    }
  }


  async _copyExternalItemToSlot(
    sourceItem,
    targetIndex,
    slots,
    inventoryCapacity
  ) {

    const allocation =
      this._canAllocateItemAtSlot(
        sourceItem,
        targetIndex,
        slots,
        inventoryCapacity
      );


    if (!allocation.valid) {

      ui.notifications.warn(
        allocation.reason
      );


      return;
    }


    const embeddedItem =
      await this
        ._createEmbeddedItemCopy(
          sourceItem,
          "slot"
        );


    if (!embeddedItem) {
      return;
    }


    this._allocateItemAtSlot(
      slots,
      embeddedItem,
      targetIndex
    );


    try {

      await this.actor.update({
        "system.inventory.slots":
          slots
      });

    }

    catch (error) {

      console.error(
        "Delver | Item embedded but multi-slot assignment failed:",
        error
      );


      await this.actor
        .deleteEmbeddedDocuments(
          "Item",
          [
            embeddedItem.id
          ]
        );
    }
  }

  /* ======================================================== */
  /* OTHER CARRY LOCATIONS                                    */
  /* ======================================================== */

  async _dropItemIntoCarryMode(
    sourceItem,
    carryMode
  ) {

    if (
      !VALID_CARRY_MODES.has(
        carryMode
      ) ||
      carryMode === "slot"
    ) {

      return;
    }


    if (
      sourceItem.parent ===
      this.actor
    ) {

      await this
        ._moveOwnedItemToCarryMode(
          sourceItem,
          carryMode
        );


      return;
    }


    await this
      ._createEmbeddedItemCopy(
        sourceItem,
        carryMode
      );
  }


  async _moveOwnedItemToCarryMode(
    item,
    carryMode
  ) {

    const currentCarryMode =
      this._normalizeCarryMode(
        item.system
          ?.carryMode
      );


    if (
      currentCarryMode ===
      carryMode
    ) {

      return;
    }


    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    const changedSlots =
      this._clearItemAllocation(
        slots,
        item.id
      );


    await item.update({
      "system.carryMode":
        carryMode,

      "system.equipped":
        false
    });


    if (changedSlots) {

      await this.actor.update({
        "system.inventory.slots":
          slots
      });
    }
  }


  async _createEmbeddedItemCopy(
    sourceItem,
    carryMode
  ) {

    const itemData =
      sourceItem.toObject();


    delete itemData._id;
    delete itemData.folder;
    delete itemData.sort;
    delete itemData.ownership;


    foundry.utils.setProperty(
      itemData,
      "system.carryMode",
      carryMode
    );


    foundry.utils.setProperty(
      itemData,
      "system.equipped",
      false
    );


    try {

      const created =
        await this.actor
          .createEmbeddedDocuments(
            "Item",
            [
              itemData
            ]
          );


      return (
        created?.[0] ??
        null
      );

    }

    catch (error) {

      console.error(
        "Delver | Failed to embed Item:",
        error
      );


      return null;
    }
  }


  /* ======================================================== */
  /* OPEN / DELETE ITEM                                       */
  /* ======================================================== */

  _onInventoryItemOpen(event) {
    event.preventDefault();


    const item =
      this.actor.items.get(
        event.currentTarget
          ?.dataset
          ?.itemId
      );


    item?.sheet?.render(
      true
    );
  }


  async _deleteOwnedItem(item) {

    if (!item) {
      return;
    }


    const itemId =
      item.id;


    await item.deleteDialog();


    if (
      this.actor.items.has(
        itemId
      )
    ) {

      return;
    }


    await this
      ._removeItemFromSlots(
        itemId
      );


    this.render(false);
  }


  async _removeItemFromSlots(
    itemId
  ) {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    const changed =
      this._clearItemAllocation(
        slots,
        itemId
      );


    if (!changed) {
      return;
    }


    await this.actor.update(
      {
        "system.inventory.slots":
          slots
      },
      {
        render:
          false
      }
    );
  }


  /* ======================================================== */
  /* OWNED ITEM INTEGRITY                                     */
  /* ======================================================== */

  async _ensureOwnedItemIntegrity() {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    const slottedItemIds =
      new Set(
        slots
          .filter(
            slot =>
              slot.kind === "item" &&
              slot.itemId
          )
          .map(
            slot =>
              slot.itemId
          )
      );


    const updates =
      [];


    for (
      const item of
        this.actor.items
    ) {

      const update = {
        _id:
          item.id
      };


      let changed =
        false;


      const normalizedCarryMode =
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        );


      if (
        item.system
          ?.carryMode !==
        normalizedCarryMode
      ) {

        update[
          "system.carryMode"
        ] =
          normalizedCarryMode;


        changed =
          true;
      }


      const mayBeEquipped =
        this._isItemEquippable(
          item
        ) &&
        normalizedCarryMode ===
          "slot" &&
        slottedItemIds.has(
          item.id
        );


      if (
        Boolean(
          item.system
            ?.equipped
        ) &&
        !mayBeEquipped
      ) {

        update[
          "system.equipped"
        ] =
          false;


        changed =
          true;
      }


      if (changed) {

        updates.push(
          update
        );
      }
    }


    if (
      updates.length === 0
    ) {

      return;
    }


    await this.actor
      .updateEmbeddedDocuments(
        "Item",
        updates,
        {
          render:
            false
        }
      );
  }


  /* ======================================================== */
  /* INVENTORY INTEGRITY                                      */
  /* ======================================================== */

  async _ensureInventoryIntegrity() {

    const slots =
      this._normalizeInventorySlots(
        this.actor.system
          ?.inventory
          ?.slots
      );


    let changed =
      false;


    const anchorByItemId =
      new Map();


    /* ------------------------------------------------------ */
    /* VALIDATE ANCHORS                                       */
    /* ------------------------------------------------------ */

    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      const slot =
        slots[index];


      if (
        slot.kind !== "item"
      ) {

        continue;
      }


      const item =
        slot.itemId
          ? this.actor.items.get(
              slot.itemId
            )
          : null;


      if (!item) {

        slots[index] =
          emptyInventorySlot();

        changed =
          true;

        continue;
      }


      if (
        anchorByItemId.has(
          item.id
        )
      ) {

        slots[index] =
          emptyInventorySlot();

        changed =
          true;

        continue;
      }


      if (
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        ) !== "slot"
      ) {

        slots[index] =
          emptyInventorySlot();

        changed =
          true;

        continue;
      }


      anchorByItemId.set(
        item.id,
        index
      );
    }


    /* ------------------------------------------------------ */
    /* CLEAN ORPHAN RESERVATIONS                              */
    /* ------------------------------------------------------ */

    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      const slot =
        slots[index];


      if (
        slot.kind !==
        "reserved"
      ) {

        continue;
      }


      const item =
        slot.itemId
          ? this.actor.items.get(
              slot.itemId
            )
          : null;


      if (
        !item ||
        !anchorByItemId.has(
          item.id
        ) ||
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        ) !== "slot"
      ) {

        slots[index] =
          emptyInventorySlot();

        changed =
          true;
      }
    }


    /* ------------------------------------------------------ */
    /* REBUILD EACH ITEM'S EXACT SLOT FOOTPRINT               */
    /* ------------------------------------------------------ */

    for (
      const [
        itemId,
        anchorIndex
      ] of
        anchorByItemId.entries()
    ) {

      const item =
        this.actor.items.get(
          itemId
        );


      if (!item) {
        continue;
      }


      const slotCost =
        this._getItemSlotCost(
          item
        );


      const lastIndex =
        anchorIndex +
        slotCost -
        1;


      let footprintBlocked =
        lastIndex >=
        DELVER_MAX_INVENTORY_SLOTS;


      if (!footprintBlocked) {

        for (
          let index =
            anchorIndex;
          index <= lastIndex;
          index++
        ) {

          const slot =
            slots[index];


          const belongsToItem =
            (
              slot.kind === "item" ||
              slot.kind === "reserved"
            ) &&
            slot.itemId === itemId;


          if (
            slot.kind !== "empty" &&
            !belongsToItem
          ) {

            footprintBlocked =
              true;

            break;
          }
        }
      }


      if (footprintBlocked) {

        if (
          this._clearItemAllocation(
            slots,
            itemId
          )
        ) {

          changed =
            true;
        }


        continue;
      }


      /*
       * If slot cost was reduced in Item Properties,
       * clean reservations that are no longer required.
       */
      for (
        let index = 0;
        index < slots.length;
        index++
      ) {

        if (
          index >= anchorIndex &&
          index <= lastIndex
        ) {

          continue;
        }


        if (
          slots[index].kind ===
            "reserved" &&
          slots[index].itemId ===
            itemId
        ) {

          slots[index] =
            emptyInventorySlot();

          changed =
            true;
        }
      }


      const desiredAnchor = {
        kind:
          "item",

        itemId,

        label:
          ""
      };


      if (
        slots[anchorIndex].kind !==
          desiredAnchor.kind ||
        slots[anchorIndex].itemId !==
          desiredAnchor.itemId ||
        slots[anchorIndex].label !==
          desiredAnchor.label
      ) {

        slots[anchorIndex] =
          desiredAnchor;

        changed =
          true;
      }


      for (
        let index =
          anchorIndex + 1;
        index <= lastIndex;
        index++
      ) {

        if (
          slots[index].kind !==
            "reserved" ||
          slots[index].itemId !==
            itemId ||
          slots[index].label !==
            ""
        ) {

          slots[index] =
            reservedInventorySlot(
              itemId
            );

          changed =
            true;
        }
      }
    }


    if (!changed) {
      return;
    }


    await this.actor.update(
      {
        "system.inventory.slots":
          slots
      },
      {
        render:
          false
      }
    );


    this.render(false);
  }

  /* ======================================================== */
  /* ITEM VIEW DATA                                           */
  /* ======================================================== */

  _itemViewData(item) {

    const derived =
      getItemDerivedData(
        item.system ?? {}
      );


    return {
      id:
        item.id,

      name:
        item.name,

      img:
        item.img,

      category:
        derived.category,

      categoryLabel:
        derived.categoryLabel,

      carryMode:
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        ),

      equippable:
        derived.equippable,

      equipped:
        Boolean(
          item.system
            ?.equipped
        ),

      magical:
        derived.magical,

      keyItem:
        derived.traits.keyItem,

      bulky:
        derived.bulky,

      slotCost:
        derived.slotCost,

      quality:
        derived.quality,

      decay:
        derived.decay
    };
  }


  /* ======================================================== */
  /* CHARACTER DATA                                           */
  /* ======================================================== */

  _buildCharacterData(
    rawSystem
  ) {

    const sys =
      foundry.utils.deepClone(
        rawSystem ?? {}
      );


    const existingIdentity =
      foundry.utils.deepClone(
        sys.identity ?? {}
      );


    delete existingIdentity.xp;


    const identity = {
      ...existingIdentity,

      level:
        this._numberOr(
          sys.identity
            ?.level,
          1
        ),

      background:
        sys.identity
          ?.background ??
        "",

      race:
        sys.identity
          ?.race ??
        "",

      uniqueAbility: {
        ...(
          sys.identity
            ?.uniqueAbility ??
          {}
        ),

        name:
          sys.identity
            ?.uniqueAbility
            ?.name ??
          "",

        description:
          sys.identity
            ?.uniqueAbility
            ?.description ??
          ""
      }
    };


    const abilities =
      {};


    for (
      const key of
        ABILITY_KEYS
    ) {

      abilities[key] =
        this._clamp(
          this._numberOr(
            sys.abilities
              ?.[key],

            0
          ),

          -10,
          10
        );
    }


    const luckCurrent =
      this._clamp(
        this._numberOr(
          sys.resources
            ?.luck
            ?.current,

          this._numberOr(
            sys.luck
              ?.current,

            0
          )
        ),

        0,
        DELVER_MAX_LUCK
      );


    const hp = {
      ...(
        sys.resources
          ?.hp ??
        {}
      ),

      current:
        Math.max(
          0,

          this._numberOr(
            sys.resources
              ?.hp
              ?.current,

            1
          )
        ),

      max:
        Math.max(
          0,

          this._numberOr(
            sys.resources
              ?.hp
              ?.max,

            1
          )
        )
    };


    const luck = {
      ...(
        sys.resources
          ?.luck ??
        {}
      ),

      current:
        luckCurrent,

      max:
        DELVER_MAX_LUCK
    };


    const actionPoints = {
      ...(
        sys.resources
          ?.actionPoints ??
        {}
      ),

      current:
        Math.max(
          0,

          this._numberOr(
            sys.resources
              ?.actionPoints
              ?.current,

            3
          )
        ),

      base:
        Math.max(
          0,

          this._numberOr(
            sys.resources
              ?.actionPoints
              ?.base,

            3
          )
        )
    };


    const resources = {
      ...(
        sys.resources ??
        {}
      ),

      hp,
      luck,

      scars:
        Math.max(
          0,

          this._numberOr(
            sys.resources
              ?.scars,

            0
          )
        ),

      actionPoints
    };


    const defense = {
      ...(
        sys.defense ??
        {}
      ),

      override:
        this._nullableNumber(
          sys.defense
            ?.override
        )
    };


    const movement = {
      ...(
        sys.movement ??
        {}
      ),

      override:
        this._nullableNumber(
          sys.movement
            ?.override ??
          sys.speed
            ?.baseOverride
        )
    };


    const inventory = {
      ...(
        sys.inventory ??
        {}
      ),

      slots:
        this._normalizeInventorySlots(
          sys.inventory
            ?.slots
        )
    };


    return {
      ...sys,

      identity,
      abilities,
      resources,
      defense,
      movement,
      inventory,

      notes:
        sys.notes ?? ""
    };
  }


  /* ======================================================== */
  /* MULTI-SLOT INVENTORY HELPERS                             */
  /* ======================================================== */

  _getItemSlotCost(item) {

    if (!item) {
      return 1;
    }


    const derived =
      getItemDerivedData(
        item.system ?? {}
      );


    return Math.max(
      1,
      Math.trunc(
        Number(
          derived.slotCost
        ) || 1
      )
    );
  }


  _clearItemAllocation(
    slots,
    itemId
  ) {

    if (!itemId) {
      return false;
    }


    let changed =
      false;


    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      const slot =
        slots[index];


      if (
        (
          slot.kind === "item" ||
          slot.kind === "reserved"
        ) &&
        slot.itemId === itemId
      ) {

        slots[index] =
          emptyInventorySlot();

        changed =
          true;
      }
    }


    return changed;
  }


  _canAllocateItemAtSlot(
    item,
    targetIndex,
    slots,
    inventoryCapacity,
    ignoreItemId = ""
  ) {

    const slotCost =
      this._getItemSlotCost(
        item
      );


    if (
      !Number.isInteger(
        targetIndex
      ) ||
      targetIndex < 0 ||
      targetIndex >=
        inventoryCapacity
    ) {

      return {
        valid:
          false,

        slotCost,

        reason:
          `Inventory slot ${targetIndex + 1} is unavailable.`
      };
    }


    if (
      targetIndex +
        slotCost >
        inventoryCapacity
    ) {

      return {
        valid:
          false,

        slotCost,

        reason:
          slotCost > 1
            ? `${item.name} needs ${slotCost} consecutive available inventory slots.`
            : "No available inventory slot."
      };
    }


    for (
      let index = targetIndex;
      index <
        targetIndex +
        slotCost;
      index++
    ) {

      const slot =
        slots[index];


      const belongsToIgnoredItem =
        Boolean(
          ignoreItemId
        ) &&
        (
          slot?.kind === "item" ||
          slot?.kind === "reserved"
        ) &&
        slot?.itemId ===
          ignoreItemId;


      if (
        slot?.kind !== "empty" &&
        !belongsToIgnoredItem
      ) {

        return {
          valid:
            false,

          slotCost,

          reason:
            slot?.kind === "wound" ||
            slot?.kind === "fatigue"
              ? "Items cannot replace Wounds or Fatigue."
              : slot?.kind === "reserved"
                ? "One or more required slots are reserved by another multi-slot Item."
                : slotCost > 1
                  ? `${item.name} needs ${slotCost} consecutive empty inventory slots.`
                  : "That inventory slot is already occupied."
        };
      }
    }


    return {
      valid:
        true,

      slotCost,

      reason:
        ""
    };
  }


  _allocateItemAtSlot(
    slots,
    item,
    targetIndex
  ) {

    const slotCost =
      this._getItemSlotCost(
        item
      );


    this._clearItemAllocation(
      slots,
      item.id
    );


    slots[targetIndex] = {
      kind:
        "item",

      itemId:
        item.id,

      label:
        ""
    };


    for (
      let offset = 1;
      offset < slotCost;
      offset++
    ) {

      slots[
        targetIndex +
        offset
      ] =
        reservedInventorySlot(
          item.id
        );
    }
  }


  _itemAllocationIsComplete(
    item,
    anchorIndex,
    slots
  ) {

    const slotCost =
      this._getItemSlotCost(
        item
      );


    if (
      anchorIndex < 0 ||
      anchorIndex +
        slotCost >
        slots.length
    ) {

      return false;
    }


    if (
      slots[anchorIndex].kind !==
        "item" ||
      slots[anchorIndex].itemId !==
        item.id
    ) {

      return false;
    }


    for (
      let offset = 1;
      offset < slotCost;
      offset++
    ) {

      const slot =
        slots[
          anchorIndex +
          offset
        ];


      if (
        slot.kind !== "reserved" ||
        slot.itemId !== item.id
      ) {

        return false;
      }
    }


    return true;
  }


  /* ======================================================== */
  /* SLOT NORMALIZATION                                       */
  /* ======================================================== */

  _normalizeInventorySlots(
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

        const oldSlot =
          existing[index];


        if (!oldSlot) {
          return emptyInventorySlot();
        }


        const requestedKind =
          oldSlot.kind ??
          "empty";


        const kind =
          VALID_SLOT_KINDS.has(
            requestedKind
          )
            ? requestedKind
            : "empty";


        return {
          kind,

          itemId:
            (
              kind === "item" ||
              kind === "reserved"
            )
              ? oldSlot.itemId ?? ""
              : "",

          label:
            kind === "item"
              ? oldSlot.label ?? ""
              : ""
        };
      }
    );
  }
  
  /* ======================================================== */
  /* CHARACTER MIGRATION                                      */
  /* ======================================================== */

  async _ensureCharacterV2Data() {

    const rawSystem =
      this.actor.system ?? {};


    const normalized =
      this._buildCharacterData(
        rawSystem
      );


    const updates =
      {};


    const rawIdentityWithoutXp =
      foundry.utils.deepClone(
        rawSystem.identity ?? {}
      );


    delete rawIdentityWithoutXp.xp;


    if (
      !this._sameData(
        rawIdentityWithoutXp,
        normalized.identity
      )
    ) {

      updates[
        "system.identity"
      ] =
        normalized.identity;
    }


    if (
      Object.prototype.hasOwnProperty.call(
        rawSystem.identity ?? {},
        "xp"
      )
    ) {

      updates[
        "system.identity.-=xp"
      ] =
        null;
    }


    if (
      !this._sameData(
        rawSystem.abilities,
        normalized.abilities
      )
    ) {

      updates[
        "system.abilities"
      ] =
        normalized.abilities;
    }


    if (
      !this._sameData(
        rawSystem.resources,
        normalized.resources
      )
    ) {

      updates[
        "system.resources"
      ] =
        normalized.resources;
    }


    if (
      !this._sameData(
        rawSystem.defense,
        normalized.defense
      )
    ) {

      updates[
        "system.defense"
      ] =
        normalized.defense;
    }


    if (
      !this._sameData(
        rawSystem.movement,
        normalized.movement
      )
    ) {

      updates[
        "system.movement"
      ] =
        normalized.movement;
    }


    if (
      !this._sameData(
        rawSystem.inventory,
        normalized.inventory
      )
    ) {

      updates[
        "system.inventory"
      ] =
        normalized.inventory;
    }


    if (
      (
        rawSystem.notes ??
        ""
      ) !==
      normalized.notes
    ) {

      updates[
        "system.notes"
      ] =
        normalized.notes;
    }


    if (
      Object.keys(
        updates
      ).length === 0
    ) {

      return;
    }


    await this.actor.update(
      updates,
      {
        render:
          false
      }
    );
  }


  /* ======================================================== */
  /* UTILITIES                                                */
  /* ======================================================== */

  _normalizeCarryMode(value) {

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


  _numberOr(
    value,
    fallback
  ) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {

      return fallback;
    }


    const number =
      Number(value);


    return Number.isFinite(
      number
    )
      ? number
      : fallback;
  }


  _nullableNumber(value) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {

      return null;
    }


    const number =
      Number(value);


    return Number.isFinite(
      number
    )
      ? number
      : null;
  }


  _clamp(
    value,
    min,
    max
  ) {

    return Math.min(
      max,
      Math.max(
        min,
        value
      )
    );
  }


  _sameData(a, b) {
    return (
      JSON.stringify(a) ===
      JSON.stringify(b)
    );
  }
}