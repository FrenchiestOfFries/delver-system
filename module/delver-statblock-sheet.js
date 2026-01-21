export class DelverStatblockSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor", "statblock"],
      template: "systems/Delver/templates/delver-statblock-sheet.html",
      width: 720,
      height: 760,
      resizable: true
    });
  }

  getData() {
    const context = super.getData();

    const sys = this.actor.system ?? {};
    const a = sys.abilities ?? { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

    const fort = Math.max(a.str ?? 0, a.con ?? 0);
    const reflex = Math.max(a.dex ?? 0, a.int ?? 0);
    const will = Math.max(a.wis ?? 0, a.cha ?? 0);
    const defense = fort + reflex + will + 10;

    const computedSpeed = 30 + ((a.dex ?? 0) * 5);
    const baseSpeed = (sys.speed?.baseOverride ?? null) === null ? computedSpeed : Number(sys.speed.baseOverride);

    context.systemData = sys;
    context.derived = { fort, reflex, will, defense, computedSpeed, baseSpeed };

    return context;
  }
}
