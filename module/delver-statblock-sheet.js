import {
  getItemDerivedData
} from "./delver-item-rules.js";


/**
 * Shared base sheet for lightweight Delver NPC and Enemy statblocks.
 *
 * NPCs and Enemies intentionally keep their stats directly editable, but
 * their inventory is made of real Actor-owned Item documents so the GM can
 * drag, open, transfer, and delete actual Delver Items rather than tracking
 * equipment in free-text notes.
 */
export class DelverStatblockSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor", "statblock"],
      width: 720,
      height: 760,
      resizable: true,
      dragDrop: [
        {
          dragSelector: ".delver-statblock-owned-item",
          dropSelector: ".delver-statblock-inventory"
        }
      ]
    });
  }


  getData() {
    const context = super.getData();
    const sys = this.actor.system ?? {};

    const abilities = {
      str: this._numberOr(sys.abilities?.str, 0),
      dex: this._numberOr(sys.abilities?.dex, 0),
      con: this._numberOr(sys.abilities?.con, 0),
      int: this._numberOr(sys.abilities?.int, 0),
      wis: this._numberOr(sys.abilities?.wis, 0),
      cha: this._numberOr(sys.abilities?.cha, 0)
    };

    const hp = {
      current: Math.max(
        0,
        this._numberOr(
          sys.hp?.current,
          1
        )
      ),

      max: Math.max(
        0,
        this._numberOr(
          sys.hp?.max,
          1
        )
      )
    };

    const luck = {
      current: Math.max(
        0,
        this._numberOr(
          sys.luck?.current,
          0
        )
      ),

      max: Math.max(
        0,
        this._numberOr(
          sys.luck?.max,
          0
        )
      )
    };

    const defense =
      this._numberOr(
        sys.defense?.value,
        10
      );

    /*
     * v0.1.5A stored NPC/Enemy speed in speed.baseOverride
     * because the old statblock derived speed from DEX.
     *
     * B1 retained the path but changed its meaning to a
     * directly editable Speed value so existing test Actors
     * stay valid.
     */
    const speed =
      this._numberOr(
        sys.speed?.baseOverride,
        30
      );



    /* ====================================================== */
    /* OWNED ITEMS                                             */
    /* ====================================================== */

    const inventoryItems =
      Array.from(
        this.actor.items
      ).map(
        item => {

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

            slotCost:
              derived.slotCost,

            magical:
              derived.magical,

            keyItem:
              derived.traits.keyItem,

            bulky:
              derived.bulky
          };
        }
      );



    /* ====================================================== */
    /* TEMPLATE DATA                                           */
    /* ====================================================== */

    context.systemData = {
      ...sys,

      abilities,

      hp,

      luck,

      defense: {
        ...(sys.defense ?? {}),

        value:
          defense
      },

      speed: {
        ...(sys.speed ?? {}),

        baseOverride:
          speed
      },

      notes:
        sys.notes ?? ""
    };


    context.statblock = {
      hp,
      luck,
      defense,
      speed
    };


    context.inventoryItems =
      inventoryItems;


    context.hasInventoryItems =
      inventoryItems.length > 0;




    return context;
  }


  /* ======================================================== */
  /* LISTENERS                                                 */
  /* ======================================================== */

  activateListeners(html) {
    super.activateListeners(
      html
    );


    html.find(
      ".delver-statblock-owned-item"
    ).on(
      "dblclick",
      this._onInventoryItemOpen.bind(
        this
      )
    );


    html.find(
      ".delver-statblock-inventory"
    ).on(
      "dragleave",
      event => {

        event.currentTarget
          .classList
          .remove(
            "statblock-inventory-drop-valid"
          );
      }
    );


    this._createItemContextMenu(
      html
    );
  }


  /* ======================================================== */
  /* ITEM CONTEXT MENU                                        */
  /* ======================================================== */

  _createItemContextMenu(
    html
  ) {

    const ContextMenu =
      foundry.applications
        .ux
        .ContextMenu;


    let itemMenu;


    itemMenu =
      new ContextMenu(
        html[0],

        ".delver-statblock-owned-item",

        this._getItemContextOptions(),

        {
          fixed:
            true,

          jQuery:
            false,

          onOpen: () => {

            const element =
              itemMenu?.element;


            if (!element) {
              return;
            }


            element.classList.add(
              "delver-context-menu",
              "delver-context-item"
            );
          }
        }
      );


    this._delverItemContextMenu =
      itemMenu;
  }


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

            this
              ._getItemFromContextTarget(
                target
              )
              ?.sheet
              ?.render(
                true
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


            await item
              .deleteDialog();
          }
      }
    ];
  }


  _getItemFromContextTarget(
    target
  ) {

    const itemId =
      target?.dataset
        ?.itemId;


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


  _onInventoryItemOpen(
    event
  ) {

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


  /* ======================================================== */
  /* DRAG / DROP                                              */
  /* ======================================================== */

  _canDragStart() {
    return this.isEditable;
  }


  _canDragDrop() {
    return this.isEditable;
  }


  _onDragStart(
    event
  ) {

    const element =
      event.target.closest(
        ".delver-statblock-owned-item"
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


  _onDragOver(
    event
  ) {

    const inventory =
      event.target.closest(
        ".delver-statblock-inventory"
      );


    if (!inventory) {
      return;
    }


    event.preventDefault();


    inventory.classList.add(
      "statblock-inventory-drop-valid"
    );
  }


  async _onDrop(
    event
  ) {

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

      return super._onDrop(
        event
      );
    }


    event.preventDefault();


    const inventory =
      event.target.closest(
        ".delver-statblock-inventory"
      );


    if (!inventory) {

      ui.notifications.warn(
        "Drop Items into the NPC/Enemy Inventory section."
      );


      return false;
    }


    inventory.classList.remove(
      "statblock-inventory-drop-valid"
    );


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
        "Delver | Failed to resolve dropped statblock Item:",
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


    /*
     * Dragging an Item already owned by this Actor back onto
     * its own inventory is a no-op.
     *
     * Dragging from another Actor or the Items sidebar creates
     * a new owned copy on this Actor.
     */
    if (
      sourceItem.parent ===
      this.actor
    ) {

      return true;
    }


    /*
     * Preserve anything the GM has typed elsewhere on the
     * sheet before creating the owned Item.
     */
    await this.submit({
      preventClose:
        true,

      preventRender:
        true
    });


    await this
      ._createEmbeddedItemCopy(
        sourceItem
      );


    return true;
  }


  async _createEmbeddedItemCopy(
    sourceItem
  ) {

    const itemData =
      sourceItem.toObject();


    delete itemData._id;
    delete itemData.folder;
    delete itemData.sort;
    delete itemData.ownership;


    /*
     * NPC/Enemy inventory is presently one manual inventory
     * location.
     *
     * Normalize imported copies to normal Inventory carrying
     * so Character-specific Loose / Backpack state does not
     * accidentally leak across Actors.
     */
    foundry.utils.setProperty(
      itemData,

      "system.carryMode",

      "slot"
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
        "Delver | Failed to embed statblock Item:",
        error
      );


      ui.notifications.error(
        "Delver could not add the Item to this Actor."
      );


      return null;
    }
  }


  /* ======================================================== */
  /* HELPERS                                                   */
  /* ======================================================== */

  _numberOr(
    value,
    fallback = 0
  ) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {

      return fallback;
    }


    const number =
      Number(
        value
      );


    return Number.isFinite(
      number
    )
      ? number
      : fallback;
  }
}