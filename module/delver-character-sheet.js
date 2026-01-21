export class DelverCharacterSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["delver", "sheet", "actor", "character"],
      template: "systems/delver/templates/delver-character-sheet.html",
      width: 860,
      height: 900,
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
    const baseSpeed =
      (sys.speed?.baseOverride ?? null) === null ? computedSpeed : Number(sys.speed.baseOverride);

    const totalSlots = Math.max(0, 10 + (a.con ?? 0));
    const slots = Array.from(
      { length: totalSlots },
      (_, i) => sys.inventory?.slots?.[i] ?? { kind: "empty", label: "", value: "" }
    );

    context.systemData = sys;
    context.derived = { fort, reflex, will, defense, computedSpeed, baseSpeed, totalSlots };
    context.inventorySlots = slots;

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Ensure actor.system.inventory.slots exists + correct length when sheet is used
    this._ensureInventorySize();

    // Existing number steppers (abilities)
    html.find(".num-step").on("click", (ev) => this._onNumStep(ev));

    // Luck vertical +/- (no visible inputs in col 7)
    html.find(".luck-step").on("click", (ev) => this._onLuckStep(ev));

    // Live resize when CON changes
    html.find('input[name="system.abilities.con"]').on("change", (ev) => this._onConChanged(ev));

    // Slot change handlers (INCLUDING DC/value)
    html
      .find(".inv-slot .slot-kind, .inv-slot .slot-label, .inv-slot .slot-value")
      .on("change", (ev) => this._onSlotChange(ev));

    // Initialize slot visuals on render
    html.find(".inv-slot").each((_, el) => this._applySlotVisual(el));

    // Quick-add fatigue/wound buttons
    html.find("[data-add-kind]").on("click", (ev) => this._onQuickAdd(ev));

    // Wound DC +/- controls
    html.find("[data-wound-step]").on("click", (ev) => this._onWoundDcStep(ev));

    // Slot remove (X)
    html.find(".slot-remove").on("click", (ev) => this._onSlotRemove(ev));
  }

  async _onSlotRemove(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const slotEl = btn?.closest(".inv-slot");
    if (!slotEl) return;

    const index = Number(slotEl.dataset.index);
    if (!Number.isFinite(index)) return;

    // Persist any unsaved DOM edits first (so we don't nuke changes in other slots)
    await this._commitSlotsFromDOM();

    const sys = this.actor.system ?? {};
    const slots = Array.isArray(sys.inventory?.slots) ? [...sys.inventory.slots] : [];
    if (!slots[index]) return;

    slots[index] = { kind: "empty", label: "", value: "" };
    await this.actor.update({ "system.inventory.slots": slots });
  }

  _applySlotVisual(slotEl) {
    if (!slotEl) return;
    const kind = slotEl.querySelector(".slot-kind")?.value ?? "empty";
    slotEl.classList.remove("kind-empty", "kind-item", "kind-fatigue", "kind-wound");
    slotEl.classList.add(`kind-${kind}`);
  }

  async _ensureInventorySize() {
    const sys = this.actor.system ?? {};
    const con = sys.abilities?.con ?? 0;
    const totalSlots = Math.max(0, 10 + con);

    const existing = Array.isArray(sys.inventory?.slots) ? sys.inventory.slots : [];
    if (existing.length === totalSlots) return;

    const next = Array.from(
      { length: totalSlots },
      (_, i) => existing[i] ?? { kind: "empty", label: "", value: "" }
    );

    await this.actor.update({ "system.inventory.slots": next });
  }

  async _commitSlotsFromDOM() {
    const root = this.element?.[0];
    if (!root) return;

    const slotEls = root.querySelectorAll(".inv-slot");
    const slots = Array.from(slotEls).map((el) => {
      const kind = el.querySelector(".slot-kind")?.value ?? "empty";
      const label = el.querySelector(".slot-label")?.value ?? "";
      const value = el.querySelector(".slot-value")?.value ?? "";
      return { kind, label, value };
    });

    await this.actor.update({ "system.inventory.slots": slots });
  }

  async _onConChanged(event) {
    // Persist any unsaved slot edits from the DOM BEFORE resizing
    await this._commitSlotsFromDOM();

    const con = Number(event.currentTarget.value);
    const safeCon = Number.isFinite(con) ? con : 0;
    const totalSlots = Math.max(0, 10 + safeCon);

    const sys = this.actor.system ?? {};
    const existing = Array.isArray(sys.inventory?.slots) ? [...sys.inventory.slots] : [];

    // If shrinking, preserve overflow
    if (existing.length > totalSlots) {
      const overflow = existing.slice(totalSlots);

      const meaningful = overflow.filter((s) => {
        const kind = (s?.kind ?? "empty");
        const label = (s?.label ?? "").trim();
        const value = (s?.value ?? "").toString().trim();
        return kind !== "empty" || label.length > 0 || value.length > 0;
      });

      if (meaningful.length > 0) {
        const lines = meaningful.map((s) => {
          const kind = (s?.kind ?? "empty");
          const label = (s?.label ?? "").trim();
          const value = (s?.value ?? "").toString().trim();

          if (kind === "wound") {
            if (label && value) return `wound: ${label} (${value})`;
            if (value) return `wound(${value})`;
            return label ? `wound: ${label}` : `wound`;
          }

          if (kind === "fatigue") return label ? `fatigue: ${label}` : `fatigue`;
          if (kind === "item") return label ? `item: ${label}` : `item`;
          return label ? `${kind}: ${label}` : `${kind}`;
        });

        const prev = (sys.carriedLoosely ?? "");
        const appended = (prev ? `${prev}\n` : "") + lines.join("\n");
        await this.actor.update({ "system.carriedLoosely": appended });
      }
    }

    // Resize slots (truncate or extend, preserving existing)
    const next = Array.from(
      { length: totalSlots },
      (_, i) => existing[i] ?? { kind: "empty", label: "", value: "" }
    );

    await this.actor.update({ "system.inventory.slots": next });
  }

  async _onSlotChange(event) {
    const slotEl = event.currentTarget.closest(".inv-slot");
    const index = Number(slotEl.dataset.index);

    const kind = slotEl.querySelector(".slot-kind")?.value ?? "empty";
    const label = slotEl.querySelector(".slot-label")?.value ?? "";
    const value = slotEl.querySelector(".slot-value")?.value ?? "";

    this._applySlotVisual(slotEl);

    const sys = this.actor.system ?? {};
    const slots = Array.isArray(sys.inventory?.slots) ? [...sys.inventory.slots] : [];
    slots[index] = { kind, label, value };

    await this.actor.update({ "system.inventory.slots": slots });
  }

  async _onQuickAdd(event) {
    event.preventDefault();
    const kind = event.currentTarget?.dataset?.addKind;
    if (!kind) return;

    // If wound, pull DC from the wound control input
    let woundDc = "";
    if (kind === "wound") {
      const root = this.element?.[0];
      const dcEl = root?.querySelector(".inv-wound-dc");
      woundDc = dcEl ? String(dcEl.value ?? "").trim() : "";
    }

    await this._addToFirstEmptySlot(kind, woundDc);
  }

  async _addToFirstEmptySlot(kind, woundDc = "") {
    await this._commitSlotsFromDOM();

    const sys = this.actor.system ?? {};
    const slots = Array.isArray(sys.inventory?.slots) ? [...sys.inventory.slots] : [];

    const idx = slots.findIndex((s) => (s?.kind ?? "empty") === "empty" && !(s?.label ?? "").trim());
    if (idx === -1) {
      ui.notifications?.warn("Inventory is full.");
      return;
    }

    const next = [...slots];
    next[idx] = { kind, label: "", value: kind === "wound" ? woundDc : "" };

    await this.actor.update({ "system.inventory.slots": next });

    // Focus label after quick-add (DC is inline now)
    const root = this.element?.[0];
    const target = root?.querySelector(`.inv-slot[data-index="${idx}"] .slot-label`);
    if (target) target.focus();
  }

  _onWoundDcStep(event) {
    event.preventDefault();
    const step = Number(event.currentTarget?.dataset?.woundStep ?? 0);
    if (!Number.isFinite(step) || step === 0) return;

    const root = this.element?.[0];
    const dcEl = root?.querySelector(".inv-wound-dc");
    if (!dcEl) return;

    const cur = Number(dcEl.value);
    const next = (Number.isFinite(cur) ? cur : 0) + step;
    dcEl.value = String(Math.max(0, next));
  }

  async _onLuckStep(event) {
    event.preventDefault();

    const btn = event.currentTarget;
    const field = btn?.dataset?.luckField;
    const step = Number(btn?.dataset?.step ?? 0);
    if (!field || !Number.isFinite(step) || step === 0) return;

    const sys = this.actor.system ?? {};
    const cur = Number(sys.luck?.current ?? 0);
    const max = Number(sys.luck?.max ?? 0);

    let nextCur = Number.isFinite(cur) ? cur : 0;
    let nextMax = Number.isFinite(max) ? max : 0;

    if (field === "current") {
      nextCur = nextCur + step;
      nextCur = Math.max(0, Math.min(nextCur, nextMax));
      await this.actor.update({ "system.luck.current": nextCur });
      return;
    }

    if (field === "max") {
      nextMax = Math.max(0, nextMax + step);
      // Clamp current if max decreased
      nextCur = Math.max(0, Math.min(nextCur, nextMax));
      await this.actor.update({
        "system.luck.max": nextMax,
        "system.luck.current": nextCur
      });
    }
  }

  _onNumStep(event) {
    event.preventDefault();

    const btn = event.currentTarget;
    const step = Number(btn?.dataset?.step ?? 0);
    if (!Number.isFinite(step) || step === 0) return;

    // Find sibling number input inside the same stepper
    const stepper = btn.closest(".num-stepper");
    const input = stepper?.querySelector('input[type="number"]');
    if (!input) return;

    const cur = Number(input.value);
    let next = (Number.isFinite(cur) ? cur : 0) + step;

    const minAttr = input.getAttribute("min");
    const maxAttr = input.getAttribute("max");
    const min = minAttr !== null && minAttr !== "" ? Number(minAttr) : null;
    const max = maxAttr !== null && maxAttr !== "" ? Number(maxAttr) : null;

    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);

    input.value = String(next);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
