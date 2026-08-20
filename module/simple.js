/**
 * Delver
 *
 * A lightweight Foundry VTT system for the Delver tabletop ruleset.
 */

// Document classes
import { SimpleActor } from "./actor.js";
import { SimpleItem } from "./item.js";
import { SimpleToken, SimpleTokenDocument } from "./token.js";

// Sheets
import { DelverCharacterSheet } from "./delver-character-sheet.js";
import { DelverStatblockSheet } from "./delver-statblock-sheet.js";
import { SimpleItemSheet } from "./item-sheet.js";

// System utilities
import { preloadHandlebarsTemplates } from "./templates.js";
import { createDelverMacro } from "./macro.js";


Hooks.once("init", async function () {
  console.log("Initializing Delver System");

  /* -------------------------------------------- */
  /*  Document Classes                            */
  /* -------------------------------------------- */

  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;

  CONFIG.Token.documentClass = SimpleTokenDocument;
  CONFIG.Token.objectClass = SimpleToken;


  /* -------------------------------------------- */
  /*  Sheets                                      */
  /* -------------------------------------------- */

  Actors.unregisterSheet("core", ActorSheet);

  Actors.registerSheet("delver", DelverCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Delver Character Sheet"
  });

  Actors.registerSheet("delver", DelverStatblockSheet, {
    types: ["npc", "enemy"],
    makeDefault: true,
    label: "Delver Statblock"
  });


  Items.unregisterSheet("core", ItemSheet);

  Items.registerSheet("delver", SimpleItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "Delver Item Sheet"
  });


  /* -------------------------------------------- */
  /*  Initiative                                  */
  /* -------------------------------------------- */

  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2
  };

  game.settings.register("delver", "initFormula", {
    name: "Initiative Formula",
    hint: "The dice formula used when rolling initiative.",
    scope: "world",
    config: true,
    type: String,
    default: "1d20",
    onChange: formula => updateInitiativeFormula(formula, true)
  });

  const initiativeFormula = game.settings.get(
    "delver",
    "initFormula"
  );

  updateInitiativeFormula(initiativeFormula);


  /* -------------------------------------------- */
  /*  Handlebars Helpers                          */
  /* -------------------------------------------- */

  Handlebars.registerHelper("slugify", function (value) {
    return value?.slugify({ strict: true });
  });

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });


  /* -------------------------------------------- */
  /*  Public Delver API                           */
  /* -------------------------------------------- */

  game.Delver = {
    SimpleActor,
    SimpleItem,
    createDelverMacro
  };


  /* -------------------------------------------- */
  /*  Templates                                   */
  /* -------------------------------------------- */

  await preloadHandlebarsTemplates();
});


/* -------------------------------------------- */
/*  Initiative Helpers                          */
/* -------------------------------------------- */

function updateInitiativeFormula(formula, notify = false) {
  const valid = Roll.validate(formula);

  if (!valid) {
    if (notify) {
      ui.notifications.error(
        `Invalid initiative formula: ${formula}`
      );
    }

    return;
  }

  CONFIG.Combat.initiative.formula = formula;
}


/* -------------------------------------------- */
/*  Hotbar                                      */
/* -------------------------------------------- */

Hooks.on("hotbarDrop", (bar, data, slot) => {
  return createDelverMacro(data, slot);
});