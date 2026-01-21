/**
 * Extend the base TokenDocument to support resource type attributes.
 * @extends {TokenDocument}
 */
export class SimpleTokenDocument extends TokenDocument {

  /** @inheritdoc */
  getBarAttribute(barName, { alternative } = {}) {
    const attrPath = alternative || this[barName]?.attribute;
    const actor = this.actor;
    if (!attrPath || !actor) return null;

    const value = foundry.utils.getProperty(actor.system, attrPath);
    if (value === undefined) return null;

    const attr = {
      type: "bar",
      attribute: attrPath,
      value: value.value ?? value,
      max: value.max ?? null,
      editable: true
    };

    if (value.min !== undefined) {
      attr.min = value.min;
    }

    return attr;
  }
}

/* -------------------------------------------- */

/**
 * Extend the base Token class to implement additional system-specific logic.
 * @extends {Token}
 */
export class SimpleToken extends Token {

  /** @inheritdoc */
  _drawBar(number, bar, data) {
    if (data.min !== undefined) {
      const max = data.max - data.min;
      const value = data.value - data.min;
      data = { ...data, max, value };
    }
    super._drawBar(number, bar, data);
  }
}
