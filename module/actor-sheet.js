import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SimpleActorSheet extends ActorSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor"],
      template: "systems/delver/templates/actor-sheet.html",
      width: 600,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      scrollY: [".biography", ".items", ".attributes"],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
async getData(options) {
  const context = await super.getData(options);
  const actor = this.actor;

  context.actor = actor;
  context.systemData = actor.system;
  context.items = actor.items.contents;
  context.dtypes = ATTRIBUTE_TYPES;
  context.shorthand = !!game.settings.get("delver", "macroShorthand");
  context.biographyHTML = await TextEditor.enrichHTML(actor.system.biography ?? "", {
    secrets: actor.isOwner,
    async: true
  });

  // ⚠️ Appel corrigé ici
  EntitySheetHelper.getAttributeData({
    system: actor.system,
    items: actor.items.contents
  });

  return context;
}


  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
    html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
    html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));

    html.find(".item-control").click(this._onItemControl.bind(this));
    html.find(".items .rollable").on("click", this._onItemRoll.bind(this));

    html.find(".attributes a.attribute-roll").each((i, a) => {
      a.setAttribute("draggable", true);
      a.addEventListener("dragstart", ev => {
        const dragData = ev.currentTarget.dataset;
        ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      }, false);
    });
  }

  /* -------------------------------------------- */

  _onItemControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.document.items.get(li?.dataset.itemId);

    switch (button.dataset.action) {
      case "create": {
        const cls = getDocumentClass("Item");
        return cls.create({ name: game.i18n.localize("SIMPLE.ItemNew"), type: "item" }, { parent: this.document });
      }
      case "edit":
        return item.sheet.render(true);
      case "delete":
        return item.delete();
    }
  }

  /* -------------------------------------------- */

  _onItemRoll(event) {
    const button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.document.items.get(li.data("itemId"));
    const roll = new Roll(button.data("roll"), this.document.getRollData());
    return roll.toMessage({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `<h2>${item.name}</h2><h3>${button.text()}</h3>`
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData) {
    let formData = super._getSubmitData(updateData);
    formData = EntitySheetHelper.updateAttributes(formData, this.document);
    formData = EntitySheetHelper.updateGroups(formData, this.document);
    return formData;
  }
}
