/**
 * Delver Actor document.
 *
 * Keep this class intentionally lightweight.
 * Actor-specific game rules should only be added here when they
 * genuinely belong to the Actor document rather than a sheet.
 */
export class SimpleActor extends Actor {

  /**
   * Prepare derived Actor data.
   *
   * Most Delver derived values are currently calculated by the sheet.
   * This method remains available for system-wide derived values later.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * Supply Actor data for rolls and formulas.
   *
   * Embedded Items are exposed by slugified name so they can eventually
   * participate in Delver rolls without bringing back Simple
   * Worldbuilding's arbitrary attribute/group system.
   */
  getRollData() {
    const data = foundry.utils.deepClone(this.system ?? {});

    data.items = this.items.reduce((items, item) => {
      const key = item.name.slugify({ strict: true });

      items[key] = {
        id: item.id,
        name: item.name,
        type: item.type,
        ...foundry.utils.deepClone(item.system ?? {})
      };

      return items;
    }, {});

    return data;
  }
}