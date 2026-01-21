/**
 * Create a Macro from an attribute drop.
 * Get an existing Delver macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
export async function createDelverMacro(data, slot) {
  if (!data.roll || !data.label) return false;

  const command = `const speaker = ChatMessage.getSpeaker();
const roll = new Roll("${data.roll}", speaker.actor ? game.actors.get(speaker.actor)?.getRollData?.() : {});
roll.toMessage({ speaker, flavor: "${data.label}" });`;

  let macro = game.macros.find(m => (m.name === data.label) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: data.label,
      type: "script",
      command: command,
      flags: { "delver.attrMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}
