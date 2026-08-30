import { DelverStatblockSheet } from "./delver-statblock-sheet.js";

/**
 * Delver Enemy sheet.
 *
 * B1 keeps Enemy data directly editable and deliberately avoids inventing
 * unconfirmed monster-only derivations or automation.
 */
export class DelverEnemySheet extends DelverStatblockSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor", "statblock", "enemy"],
      template: "systems/delver/templates/delver-enemy-sheet.html",
      width: 720,
      height: 760,
      resizable: true
    });
  }
}