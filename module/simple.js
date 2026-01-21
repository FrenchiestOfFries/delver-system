/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos (V13-compatible patch)
 */

// Import Modules
import { DelverCharacterSheet } from "./delver-character-sheet.js";
import { DelverStatblockSheet } from "./delver-statblock-sheet.js";
import { SimpleActor } from "./actor.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";
import { SimpleActorSheet } from "./actor-sheet.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { createDelverMacro } from "./macro.js";
import { SimpleToken, SimpleTokenDocument } from "./token.js";

Hooks.once("init", async function () {
  console.log("Initializing Delver System");

  // Define initial Actor model (if needed by UI tools)
  game.system.model = game.system.model || {};
  game.system.model.Actor = {
    character: {
      attributes: {
        bar1: { type: "Resource", label: "Santé", value: 100, min: 0, max: 100 },
        bar2: { type: "Resource", label: "Mana", value: 50, min: 0, max: 50 }
      }
    }
  };

  // Initiative settings
  CONFIG.Combat.initiative = { formula: "1d20", decimals: 2 };

  // Expose helpers globally
  game.Delver = {
    SimpleActor,
    createDelverMacro
  };

  // Register document classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;
  CONFIG.Token.documentClass = SimpleTokenDocument;
  CONFIG.Token.objectClass = SimpleToken;

  // Register custom sheets
  Actors.unregisterSheet("core", ActorSheet);

  // Character sheet (with inventory)
  Actors.registerSheet("Delver", DelverCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Delver Character Sheet"
  });

  // NPC/Enemy statblock sheet (no inventory)
  Actors.registerSheet("Delver", DelverStatblockSheet, {
    types: ["npc", "enemy"],
    makeDefault: true,
    label: "Delver Statblock"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("delver", SimpleItemSheet, { makeDefault: true });

  // Settings
  game.settings.register("delver", "macroShorthand", {
    name: "SETTINGS.SimpleMacroShorthandN",
    hint: "SETTINGS.SimpleMacroShorthandL",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("delver", "initFormula", {
    name: "SETTINGS.SimpleInitFormulaN",
    hint: "SETTINGS.SimpleInitFormulaL",
    scope: "world",
    config: true,
    type: String,
    default: "1d20",
    onChange: formula => _simpleUpdateInit(formula, true)
  });

  // Init initiative from setting
  const initFormula = game.settings.get("delver", "initFormula");
  _simpleUpdateInit(initFormula);

  function _simpleUpdateInit(formula, notify = false) {
    const isValid = Roll.validate(formula);
    if (!isValid) {
      if (notify) ui.notifications.error(`${game.i18n.localize("SIMPLE.NotifyInitFormulaInvalid")}: ${formula}`);
      return;
    }
    CONFIG.Combat.initiative.formula = formula;
  }

  Handlebars.registerHelper("slugify", function (value) {
    return value?.slugify({ strict: true });
  });

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });


  await preloadHandlebarsTemplates();
});

Hooks.on("hotbarDrop", (bar, data, slot) => createDelverMacro(data, slot));

Hooks.on("getActorDirectoryEntryContext", (html, options) => {
  options.push({
    name: game.i18n.localize("SIMPLE.DefineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => !game.actors.get(li.data("documentId")).getFlag("delver", "isTemplate"),
    callback: li => game.actors.get(li.data("documentId")).setFlag("delver", "isTemplate", true)
  });

  options.push({
    name: game.i18n.localize("SIMPLE.UnsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => game.actors.get(li.data("documentId")).getFlag("delver", "isTemplate"),
    callback: li => game.actors.get(li.data("documentId")).setFlag("delver", "isTemplate", false)
  });
});

Hooks.on("getItemDirectoryEntryContext", (html, options) => {
  options.push({
    name: game.i18n.localize("SIMPLE.DefineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => !game.items.get(li.data("documentId")).getFlag("delver", "isTemplate"),
    callback: li => game.items.get(li.data("documentId")).setFlag("delver", "isTemplate", true)
  });

  options.push({
    name: game.i18n.localize("SIMPLE.UnsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => game.items.get(li.data("documentId")).getFlag("delver", "isTemplate"),
    callback: li => game.items.get(li.data("documentId")).setFlag("delver", "isTemplate", false)
  });
});

