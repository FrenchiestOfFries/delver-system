import { DelverStatblockSheet } from "./delver-statblock-sheet.js";

/**
 * Delver NPC sheet.
 *
 * NPCs intentionally remain lightweight for the manual-playable milestone.
 * Type-specific social/relationship tooling can be layered on later without
 * coupling NPCs to Enemy behavior.
 */
export class DelverNpcSheet extends DelverStatblockSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor", "statblock", "npc"],
      template: "systems/delver/templates/delver-npc-sheet.html",
      width: 720,
      height: 760,
      resizable: true
    });
  }
}