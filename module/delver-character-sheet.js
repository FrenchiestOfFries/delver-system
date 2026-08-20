import {
  runTakeDamage
} from "./delver-damage.js";


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

    const inventorySlots =
      systemData.inventory.slots.map(
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


          const embeddedItem =
            slot.kind === "item" &&
            slot.itemId
              ? this.actor.items.get(
                  slot.itemId
                )
              : null;


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

            itemImg
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
          item.system
            ?.category ===
            "armor" &&

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


    const category =
      item.system
        ?.category ??
      "misc";


    if (
      category === "weapon" ||
      category === "armor"
    ) {

      return true;
    }


    return Boolean(
      item.system
        ?.equippable
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
          "Clear Wound",

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
            ) === "wound",

        callback:
          async target => {

            await this
              ._confirmClearInventoryCondition(
                this._getSlotIndexFromContext(
                  target
                ),
                "wound"
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


    if (
      carryMode === "slot"
    ) {

      return false;
    }


    await this
      ._dropItemIntoCarryMode(
        sourceItem,
        carryMode
      );


    return true;
  }


  /* ======================================================== */
  /* DROP INTO SLOT                                           */
  /* ======================================================== */

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
        slots
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


    if (
      sourceIndex >= 0 &&
      sourceIndex < capacity
    ) {

      return;
    }


    const targetIndex =
      slots.findIndex(
        (slot, index) =>
          index < capacity &&
          slot.kind === "empty"
      );


    if (
      targetIndex === -1
    ) {

      ui.notifications.warn(
        "No available inventory slot."
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


    if (
      sourceIndex ===
      targetIndex
    ) {

      return;
    }


    const targetSlot =
      slots[targetIndex];


    if (
      targetSlot.kind === "wound" ||
      targetSlot.kind === "fatigue"
    ) {

      ui.notifications.warn(
        "Items cannot replace Wounds or Fatigue."
      );


      return;
    }


    /* NON-SLOT -> SLOT */

    if (
      sourceIndex === -1
    ) {

      if (
        targetSlot.kind !== "empty"
      ) {

        ui.notifications.warn(
          "Move the current Item out of that slot first."
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


      slots[targetIndex] = {
        kind:
          "item",

        itemId:
          item.id,

        label:
          ""
      };


      try {

        await this.actor.update({
          "system.inventory.slots":
            slots
        });

      }

      catch (error) {

        console.error(
          "Delver | Failed to assign owned Item to inventory slot:",
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


      return;
    }


    /* SLOT -> EMPTY */

    if (
      targetSlot.kind === "empty"
    ) {

      slots[targetIndex] = {
        ...slots[sourceIndex]
      };


      slots[sourceIndex] =
        emptyInventorySlot();


      await this.actor.update({
        "system.inventory.slots":
          slots
      });


      return;
    }


    /* SLOT -> ITEM SWAP */

    if (
      targetSlot.kind === "item"
    ) {

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
    }
  }


  async _copyExternalItemToSlot(
    sourceItem,
    targetIndex,
    slots
  ) {

    if (
      slots[targetIndex].kind !==
      "empty"
    ) {

      ui.notifications.warn(
        "That inventory slot is already occupied."
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


    slots[targetIndex] = {
      kind:
        "item",

      itemId:
        embeddedItem.id,

      label:
        ""
    };


    try {

      await this.actor.update({
        "system.inventory.slots":
          slots
      });

    }

    catch (error) {

      console.error(
        "Delver | Item embedded but slot assignment failed:",
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


    let changedSlots =
      false;


    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      if (
        slots[index].kind === "item" &&
        slots[index].itemId ===
          item.id
      ) {

        slots[index] =
          emptyInventorySlot();


        changedSlots =
          true;
      }
    }


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


    let changed =
      false;


    for (
      let index = 0;
      index < slots.length;
      index++
    ) {

      if (
        slots[index].kind === "item" &&
        slots[index].itemId ===
          itemId
      ) {

        slots[index] =
          emptyInventorySlot();


        changed =
          true;
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


    const seenItemIds =
      new Set();


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
        seenItemIds.has(
          item.id
        )
      ) {

        slots[index] =
          emptyInventorySlot();


        changed =
          true;


        continue;
      }


      seenItemIds.add(
        item.id
      );


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

    const category =
      item.system
        ?.category ??
      "misc";


    let categoryLabel =
      "Misc";


    if (
      category === "weapon"
    ) {

      categoryLabel =
        "Weapon";
    }


    if (
      category === "armor"
    ) {

      categoryLabel =
        "Armor";
    }


    if (
      category === "spell-vessel"
    ) {

      categoryLabel =
        "Spell Vessel";
    }


    return {
      id:
        item.id,

      name:
        item.name,

      img:
        item.img,

      category,

      categoryLabel,

      carryMode:
        this._normalizeCarryMode(
          item.system
            ?.carryMode
        ),

      equippable:
        this._isItemEquippable(
          item
        ),

      equipped:
        Boolean(
          item.system
            ?.equipped
        )
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
            oldSlot.itemId ??
            "",

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