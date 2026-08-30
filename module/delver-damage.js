const DELVER_MAX_INVENTORY_SLOTS = 20;
const DELVER_BASE_INVENTORY_SLOTS = 10;


/* ========================================================== */
/* BASIC HELPERS                                              */
/* ========================================================== */

function emptyInventorySlot() {
  return {
    kind: "empty",
    itemId: "",
    label: ""
  };
}


function woundInventorySlot() {
  return {
    kind: "wound",
    itemId: "",
    label: ""
  };
}


function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


function integerOr(
  value,
  fallback = 0
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(
      number
    )
  ) {

    return fallback;
  }


  return Math.trunc(
    number
  );
}


function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function normalizeInventorySlots(
  rawSlots
) {

  const existing =
    Array.isArray(
      rawSlots
    )
      ? rawSlots
      : [];


  return Array.from(
    {
      length:
        DELVER_MAX_INVENTORY_SLOTS
    },

    (_, index) => {

      const oldSlot =
        existing[index];


      if (!oldSlot) {

        return (
          emptyInventorySlot()
        );
      }


      const kind =
        [
          "empty",
          "item",
          "reserved",
          "wound",
          "fatigue"
        ].includes(
          oldSlot.kind
        )
          ? oldSlot.kind
          : "empty";


      return {
        kind,

        itemId:
          (
            kind === "item" ||
            kind === "reserved"
          )
            ? oldSlot.itemId ?? ""
            : "",

        label:
          kind === "item"
            ? oldSlot.label ?? ""
            : ""
      };
    }
  );
}


/* ========================================================== */
/* DAMAGE SNAPSHOT                                            */
/* ========================================================== */

function buildDamageSnapshot(actor) {

  const hp = Math.max(
    0,
    integerOr(
      actor.system?.resources?.hp?.current,
      0
    )
  );

  const luck = Math.max(
    0,
    integerOr(
      actor.system?.resources?.luck?.current,
      0
    )
  );

  const con = integerOr(
    actor.system?.abilities?.con,
    0
  );

  const capacity = clamp(
    DELVER_BASE_INVENTORY_SLOTS + con,
    0,
    DELVER_MAX_INVENTORY_SLOTS
  );

  const slots = normalizeInventorySlots(
    actor.system?.inventory?.slots
  );


  /*
   * Missing Item references, including their reservations,
   * behave like empty space during damage resolution.
   */
  for (
    let index = 0;
    index < slots.length;
    index++
  ) {

    const slot = slots[index];

    if (
      (
        slot.kind === "item" ||
        slot.kind === "reserved"
      ) &&
      (
        !slot.itemId ||
        !actor.items.get(slot.itemId)
      )
    ) {

      slots[index] =
        emptyInventorySlot();
    }
  }


  const emptyIndices = [];
  const itemEntries = [];
  const seenItemIds = new Set();


  /*
   * Multi-slot Items appear ONCE in the damage dialog.
   *
   * freedSlots records how many usable Character inventory
   * spaces dropping that Item will actually release.
   */
  for (
    let index = 0;
    index < capacity;
    index++
  ) {

    const slot = slots[index];


    if (slot.kind === "empty") {

      emptyIndices.push(index);

      continue;
    }


    if (
      slot.kind !== "item" ||
      !slot.itemId ||
      seenItemIds.has(slot.itemId)
    ) {

      continue;
    }


    const item =
      actor.items.get(slot.itemId);


    if (!item) {
      continue;
    }


    seenItemIds.add(item.id);


    const freedSlots =
      slots
        .slice(
          0,
          capacity
        )
        .filter(candidate =>
          (
            candidate.kind === "item" ||
            candidate.kind === "reserved"
          ) &&
          candidate.itemId === item.id
        )
        .length;


    itemEntries.push({
      itemId:
        item.id,

      slotIndex:
        index,

      slotNumber:
        index + 1,

      freedSlots:
        Math.max(
          1,
          freedSlots
        ),

      name:
        item.name,

      img:
        item.img,

      category:
        item.system?.category ??
        "misc",

      equipped:
        Boolean(
          item.system?.equipped
        )
    });
  }


  const droppableSlotCount =
    itemEntries.reduce(
      (total, entry) =>
        total +
        entry.freedSlots,

      0
    );


  const woundCapacity =
    emptyIndices.length +
    droppableSlotCount;


  /*
   * Internal lethal-detection value.
   */
  const maxSurvivable =
    hp +
    luck +
    woundCapacity;


  return {
    hp,
    luck,

    capacity,
    slots,

    emptyIndices,
    itemEntries,

    emptyCount:
      emptyIndices.length,

    woundCapacity,

    maxSurvivable
  };
}


/* ========================================================== */
/* ALLOCATION CALCULATION                                     */
/* ========================================================== */

function evaluateAllocation(
  snapshot,
  raw
) {

  const incoming =
    Math.max(
      0,

      integerOr(
        raw.incoming,
        0
      )
    );


  const hpSpent =
    Math.max(
      0,

      integerOr(
        raw.hpSpent,
        0
      )
    );


  const luckSpent =
    Math.max(
      0,

      integerOr(
        raw.luckSpent,
        0
      )
    );


  const overAllocated =
    hpSpent +
    luckSpent >
    incoming;


  const exceedsHP =
    hpSpent >
    snapshot.hp;


  const exceedsLuck =
    luckSpent >
    snapshot.luck;


  /*
   * Wounds are the automatic remainder of damage.
   */
  const wounds =
    Math.max(
      0,

      incoming -
      hpSpent -
      luckSpent
    );


  /*
   * No possible distribution of HP, Luck, or Wounds
   * can survive this hit.
   */
  const inherentlyLethal =
    incoming >
    snapshot.maxSurvivable;


  /*
   * The hit itself can be survived, but THIS allocation
   * is demanding more Wounds than the inventory can hold.
   */
  const allocationLethal =
    !inherentlyLethal &&
    wounds >
      snapshot.woundCapacity;


  /*
   * Existing empty slots become Wounds first.
   *
   * Anything beyond that requires dropping Items.
   */
  const requiredDrops =
    Math.max(
      0,

      wounds -
      snapshot.emptyCount
    );


  const valid =
    incoming > 0 &&
    !overAllocated &&
    !exceedsHP &&
    !exceedsLuck &&
    !inherentlyLethal &&
    !allocationLethal;


  return {
    incoming,

    hpSpent,
    luckSpent,

    wounds,

    requiredDrops,

    overAllocated,
    exceedsHP,
    exceedsLuck,

    inherentlyLethal,
    allocationLethal,

    valid
  };
}


/* ========================================================== */
/* DAMAGE ALLOCATION DIALOG                                   */
/* ========================================================== */

async function promptDamageAllocation(
  actor,
  snapshot,
  seed = null
) {

  const initialIncoming =
    Math.max(
      1,

      integerOr(
        seed?.incoming,
        1
      )
    );


  /*
   * First opening defaults to HP absorbing whatever
   * portion of the hit it can.
   *
   * Returning from the Item-drop screen preserves
   * whatever allocation the player previously chose.
   */
  const initialHP =
    seed
      ? integerOr(
          seed.hpSpent,
          0
        )

      : Math.min(
          snapshot.hp,
          initialIncoming
        );


  const initialLuck =
    seed
      ? integerOr(
          seed.luckSpent,
          0
        )

      : 0;


  const content = `
    <div class="delver-damage-dialog">

            <div class="damage-incoming-row">

        <label for="delver-damage-incoming">
          Incoming Damage
        </label>

        <input
          id="delver-damage-incoming"
          name="incoming"
          type="number"
          min="1"
          step="1"
          value="${initialIncoming}"
          autofocus
        />

      </div>


      <div class="damage-allocation-grid">


        <!-- HP -->

        <div class="damage-allocation-row">

          <div class="damage-resource-name">
            HP
          </div>


          <div class="damage-stepper">

            <button
              type="button"
              data-damage-step-target="hpSpent"
              data-damage-step="-1"
            >
              −
            </button>


            <input
              name="hpSpent"
              type="number"
              min="0"
              max="${snapshot.hp}"
              step="1"
              value="${initialHP}"
            />


            <button
              type="button"
              data-damage-step-target="hpSpent"
              data-damage-step="1"
            >
              +
            </button>

          </div>


          <div class="damage-resource-available">
            / ${snapshot.hp}
          </div>

        </div>


        <!-- LUCK -->

        <div class="damage-allocation-row">

          <div class="damage-resource-name">
            Luck
          </div>


          <div class="damage-stepper">

            <button
              type="button"
              data-damage-step-target="luckSpent"
              data-damage-step="-1"
            >
              −
            </button>


            <input
              name="luckSpent"
              type="number"
              min="0"
              max="${snapshot.luck}"
              step="1"
              value="${initialLuck}"
            />


            <button
              type="button"
              data-damage-step-target="luckSpent"
              data-damage-step="1"
            >
              +
            </button>

          </div>


          <div class="damage-resource-available">
            / ${snapshot.luck}
          </div>

        </div>


        <!-- WOUNDS -->

        <div class="damage-wound-row">

          <div>

            <span class="damage-resource-name">
              Wounds
            </span>

            <small>
              automatic remainder
            </small>

          </div>


          <strong
            class="damage-wound-value"
            data-damage-wounds
          >
            0
          </strong>

        </div>

      </div>


      <div class="damage-capacity-readout">

        <span>
          Empty Slots:
          <strong>
            ${snapshot.emptyCount}
          </strong>
        </span>

        <span>
          Maximum Wound Capacity:
          <strong>
            ${snapshot.woundCapacity}
          </strong>
        </span>

      </div>


      <!--
        Hidden during ordinary valid allocations.

        This only appears when the player actually needs
        information: Make Room, invalid allocation, lethal,
        etc.
      -->

      <div
        class="damage-status"
        data-damage-status
        hidden
      ></div>

    </div>
  `;


  const initialState =
    evaluateAllocation(
      snapshot,
      {
        incoming:
          initialIncoming,

        hpSpent:
          initialHP,

        luckSpent:
          initialLuck
      }
    );


  return foundry
    .applications
    .api
    .DialogV2
    .wait({

      classes: [
        "delver-damage-window"
      ],


      window: {
        title:
          `Take Damage — ${actor.name}`
      },


      content,


      buttons: [

        {
          action:
            "cancel",

          label:
            "Cancel"
        },


        {
          action:
            "apply",

          label:
            "Apply Damage",

          icon:
            "fa-solid fa-heart-crack",

          class:
            "delver-damage-apply",

          default:
            true,

          disabled:
            !initialState.valid,

          callback:
            async (
              event,
              button
            ) => {

              const form =
                button.form;


              if (!form) {
                return null;
              }


              const state =
                evaluateAllocation(
                  snapshot,
                  {
                    incoming:
                      form.elements
                        .namedItem(
                          "incoming"
                        )
                        ?.value,

                    hpSpent:
                      form.elements
                        .namedItem(
                          "hpSpent"
                        )
                        ?.value,

                    luckSpent:
                      form.elements
                        .namedItem(
                          "luckSpent"
                        )
                        ?.value
                  }
                );


              if (!state.valid) {
                return null;
              }


              return state;
            }
        }
      ],


      /*
       * Foundry v13 DialogV2 render callback:
       *
       *   (event, dialog)
       *
       * dialog is the actual DialogV2 instance.
       *
       * This is the correction from the previous pass.
       */
      render:
        (event, dialog) => {

          const root =
            dialog.element;


          if (!root) {
            return;
          }


          const incomingInput =
            root.querySelector(
              '[name="incoming"]'
            );


          const hpInput =
            root.querySelector(
              '[name="hpSpent"]'
            );


          const luckInput =
            root.querySelector(
              '[name="luckSpent"]'
            );


          const woundsOutput =
            root.querySelector(
              "[data-damage-wounds]"
            );


          const status =
            root.querySelector(
              "[data-damage-status]"
            );


          const applyButton =
            root.querySelector(
              '[data-action="apply"]'
            );


          /* ---------------------------------------------- */
          /* READ CURRENT UI STATE                          */
          /* ---------------------------------------------- */

          const readState =
            () => {

              return evaluateAllocation(
                snapshot,
                {
                  incoming:
                    incomingInput
                      ?.value,

                  hpSpent:
                    hpInput
                      ?.value,

                  luckSpent:
                    luckInput
                      ?.value
                }
              );
            };


          /* ---------------------------------------------- */
          /* HIDE STATUS                                    */
          /* ---------------------------------------------- */

          const hideStatus =
            () => {

              if (!status) {
                return;
              }


              status.hidden =
                true;


              status.innerHTML =
                "";


              status.classList.remove(
                "damage-status-ready",
                "damage-status-warning",
                "damage-status-lethal"
              );
            };


          /* ---------------------------------------------- */
          /* SHOW STATUS                                    */
          /* ---------------------------------------------- */

          const showStatus =
            (
              className,
              html
            ) => {

              if (!status) {
                return;
              }


              status.classList.remove(
                "damage-status-ready",
                "damage-status-warning",
                "damage-status-lethal"
              );


              status.classList.add(
                className
              );


              status.innerHTML =
                html;


              status.hidden =
                false;
            };


          /* ---------------------------------------------- */
          /* REFRESH EVERYTHING                             */
          /* ---------------------------------------------- */

          const refresh =
            () => {

              const state =
                readState();


              /*
               * Wound counter updates immediately whenever
               * Incoming / HP / Luck changes.
               */
              if (woundsOutput) {

                woundsOutput.textContent =
                  String(
                    state.wounds
                  );
              }


              /*
               * Apply becomes legal/illegal live.
               */
              if (applyButton) {

                applyButton.disabled =
                  !state.valid;
              }


              /* ------------------------------------------ */
              /* NO DAMAGE                                  */
              /* ------------------------------------------ */

              if (
                state.incoming <= 0
              ) {

                showStatus(
                  "damage-status-warning",

                  `
                    <strong>
                      ENTER DAMAGE
                    </strong>

                    <span>
                      Incoming damage must be at least 1.
                    </span>
                  `
                );


                return;
              }


              /* ------------------------------------------ */
              /* INHERENTLY LETHAL                          */
              /* ------------------------------------------ */

              if (
                state.inherentlyLethal
              ) {

                const overflow =
                  state.incoming -
                  snapshot.maxSurvivable;


                showStatus(
                  "damage-status-lethal",

                  `
                    <strong class="damage-lethal-title">
                      LETHAL
                    </strong>

                    <span>
                      No possible allocation can survive this hit.
                      Maximum survivable damage is
                      ${snapshot.maxSurvivable}.
                      This exceeds it by ${overflow}.
                    </span>
                  `
                );


                return;
              }


              /* ------------------------------------------ */
              /* TOO MUCH HP + LUCK                         */
              /* ------------------------------------------ */

              if (
                state.overAllocated
              ) {

                showStatus(
                  "damage-status-warning",

                  `
                    <strong>
                      OVER-ALLOCATED
                    </strong>

                    <span>
                      HP + Luck cannot exceed incoming damage.
                    </span>
                  `
                );


                return;
              }


              /* ------------------------------------------ */
              /* RESOURCE VALUE INVALID                     */
              /* ------------------------------------------ */

              if (
                state.exceedsHP ||
                state.exceedsLuck
              ) {

                showStatus(
                  "damage-status-warning",

                  `
                    <strong>
                      INVALID ALLOCATION
                    </strong>

                    <span>
                      You cannot spend more HP or Luck than
                      ${escapeHTML(actor.name)} currently has.
                    </span>
                  `
                );


                return;
              }


              /* ------------------------------------------ */
              /* CURRENT ALLOCATION IS LETHAL               */
              /* ------------------------------------------ */

              if (
                state.requiredDrops > 0
              ) {

                showStatus(
                  "damage-status-warning",

                  `
                    <strong>
                      MAKE ROOM
                    </strong>

                    <span>
                      Free at least ${state.requiredDrops}
                      inventory
                      ${
                        state.requiredDrops === 1
                          ? "slot"
                          : "slots"
                      }
                      by dropping Items to make room for
                      ${state.wounds}
                      ${
                        state.wounds === 1
                          ? "Wound"
                          : "Wounds"
                      }.
                      You will choose what to drop next.
                    </span>
                  `
                );


                return;
              }


              /*
               * A normal legal allocation needs no giant
               * box telling the player everything is okay.
               */
              hideStatus();
            };


          /* ---------------------------------------------- */
          /* LIVE INPUT EVENTS                              */
          /* ---------------------------------------------- */

          for (
            const input of
              [
                incomingInput,
                hpInput,
                luckInput
              ]
          ) {

            if (!input) {
              continue;
            }


            /*
             * "input" fires every time the number changes
             * while typing.
             */
            input.addEventListener(
              "input",
              refresh
            );


            /*
             * "change" catches browser number-control
             * interactions / blur as well.
             */
            input.addEventListener(
              "change",
              refresh
            );
          }


          /* ---------------------------------------------- */
          /* +/- BUTTONS                                    */
          /* ---------------------------------------------- */

          for (
            const button of
              root.querySelectorAll(
                "[data-damage-step-target]"
              )
          ) {

            button.addEventListener(
              "click",

              event => {

                event.preventDefault();


                const targetName =
                  button.dataset
                    .damageStepTarget;


                const delta =
                  integerOr(
                    button.dataset
                      .damageStep,

                    0
                  );


                const input =
                  root.querySelector(
                    `[name="${targetName}"]`
                  );


                if (!input) {
                  return;
                }


                const maximum =
                  targetName ===
                    "hpSpent"
                    ? snapshot.hp
                    : snapshot.luck;


                const nextValue =
                  clamp(
                    integerOr(
                      input.value,
                      0
                    ) +
                    delta,

                    0,
                    maximum
                  );


                input.value =
                  String(
                    nextValue
                  );


                /*
                 * Stepper changes are programmatic, so
                 * call refresh directly.
                 */
                refresh();
              }
            );
          }


          /*
           * Initialize the entire live UI immediately.
           */
          refresh();
        },


      rejectClose:
        false,

      modal:
        true
    });
}


/* ========================================================== */
/* DROP ITEM DIALOG                                           */
/* ========================================================== */

async function promptDamageDrops(
  actor,
  snapshot,
  allocation
) {

  /*
   * In B6, requiredDrops means INVENTORY SLOTS that must
   * be freed. Keeping the existing property name minimizes
   * release-night changes.
   */
  const required =
    allocation.requiredDrops;


  if (required <= 0) {

    return {
      action: "apply",
      itemIds: []
    };
  }


  const itemRows =
    snapshot.itemEntries
      .map(entry => {

        const equippedLabel =
          entry.equipped
            ? `
                <span class="damage-drop-equipped">
                  Equipped
                </span>
              `
            : "";


        const freedLabel =
          entry.freedSlots === 1
            ? "1 slot"
            : `${entry.freedSlots} slots`;


        return `
          <label class="damage-drop-item">

            <input
              type="checkbox"
              name="dropItem"
              value="${escapeHTML(entry.itemId)}"
              data-freed-slots="${entry.freedSlots}"
            />

            <img
              src="${escapeHTML(entry.img)}"
              alt=""
            />

            <span class="damage-drop-item-info">

              <strong>
                ${escapeHTML(entry.name)}
              </strong>

              <small>
                Inventory Slot ${entry.slotNumber}
                · Frees ${freedLabel}
              </small>

            </span>

            ${equippedLabel}

          </label>
        `;
      })
      .join("");


  const content = `
    <div class="delver-damage-drop-dialog">

      <div class="damage-drop-intro">

        <strong>
          ${allocation.wounds}
          ${
            allocation.wounds === 1
              ? "Wound"
              : "Wounds"
          }
          required
        </strong>

        <span>
          Only ${snapshot.emptyCount}
          empty
          ${
            snapshot.emptyCount === 1
              ? "slot is"
              : "slots are"
          }
          currently available.
        </span>

        <span>
          Drop one or more Items that free at least
          <strong>${required}</strong>
          inventory
          ${
            required === 1
              ? "slot"
              : "slots"
          }.
        </span>

      </div>


      <div class="damage-drop-list">

        ${itemRows}

      </div>


      <div
        class="damage-drop-count"
        data-damage-drop-count
      >
        0 / ${required} slots freed
      </div>


      <div class="damage-drop-note">
        Dropped Items remain attached to the Character for now,
        but lose their inventory slots and appear under
        Dropped / Unassigned Items.
      </div>

    </div>
  `;


  return foundry
    .applications
    .api
    .DialogV2
    .wait({

      classes: [
        "delver-damage-window",
        "delver-damage-drop-window"
      ],


      window: {
        title:
          `Make Room for Wounds — ${actor.name}`
      },


      content,


      buttons: [

        {
          action:
            "cancel",

          label:
            "Cancel"
        },


        {
          action:
            "back",

          label:
            "Back",

          icon:
            "fa-solid fa-arrow-left",

          callback:
            async () => ({
              action:
                "back"
            })
        },


        {
          action:
            "apply",

          label:
            "Confirm & Apply Damage",

          icon:
            "fa-solid fa-heart-crack",

          class:
            "delver-damage-apply",

          default:
            true,

          disabled:
            true,


          callback:
            async (
              event,
              button
            ) => {

              const form =
                button.form;


              if (!form) {
                return null;
              }


              const selectedInputs =
                Array.from(
                  form.querySelectorAll(
                    'input[name="dropItem"]:checked'
                  )
                );


              const freedSlots =
                selectedInputs.reduce(
                  (total, input) =>
                    total +
                    Math.max(
                      1,

                      integerOr(
                        input.dataset
                          .freedSlots,

                        1
                      )
                    ),

                  0
                );


              if (
                freedSlots <
                required
              ) {

                return null;
              }


              return {
                action:
                  "apply",

                itemIds:
                  selectedInputs.map(
                    input =>
                      input.value
                  )
              };
            }
        }
      ],


      render:
        (event, dialog) => {

          const root =
            dialog.element;


          if (!root) {
            return;
          }


          const count =
            root.querySelector(
              "[data-damage-drop-count]"
            );


          const applyButton =
            root.querySelector(
              '[data-action="apply"]'
            );


          const checkboxes =
            Array.from(
              root.querySelectorAll(
                'input[name="dropItem"]'
              )
            );


          const refresh =
            () => {

              const selected =
                checkboxes.filter(
                  checkbox =>
                    checkbox.checked
                );


              const freedSlots =
                selected.reduce(
                  (total, checkbox) =>
                    total +
                    Math.max(
                      1,

                      integerOr(
                        checkbox.dataset
                          .freedSlots,

                        1
                      )
                    ),

                  0
                );


              if (count) {

                count.textContent =
                  `${freedSlots} / ${required} slots freed`;


                count.classList.toggle(
                  "damage-drop-count-ready",

                  freedSlots >=
                    required
                );


                count.classList.toggle(
                  "damage-drop-count-over",

                  freedSlots >
                    required
                );
              }


              if (applyButton) {

                applyButton.disabled =
                  freedSlots <
                  required;
              }
            };


          for (
            const checkbox of
              checkboxes
          ) {

            checkbox.addEventListener(
              "change",
              refresh
            );
          }


          refresh();
        },


      rejectClose:
        false,

      modal:
        true
    });
}


/* ========================================================== */
/* COMMIT DAMAGE                                              */
/* ========================================================== */

async function commitDamage(
  sheet,
  allocation,
  dropItemIds
) {

  const actor =
    sheet.actor;


  const snapshot =
    buildDamageSnapshot(
      actor
    );


  const state =
    evaluateAllocation(
      snapshot,
      allocation
    );


  if (!state.valid) {

    ui.notifications.warn(
      `${actor.name}'s state changed while damage was being allocated. Damage was not applied.`
    );

    return false;
  }


  /*
   * B6 interpretation:
   * requiredDrops = inventory spaces that must be freed.
   */
  const requiredSlots =
    state.requiredDrops;


  const uniqueDropIds = [
    ...new Set(
      dropItemIds ?? []
    )
  ];


  const dropSet =
    new Set(
      uniqueDropIds
    );


  const selectedEntries =
    snapshot.itemEntries.filter(
      entry =>
        dropSet.has(
          entry.itemId
        )
    );


  /*
   * Every supplied Item must still exist in a valid
   * Character inventory anchor.
   */
  if (
    selectedEntries.length !==
    uniqueDropIds.length
  ) {

    ui.notifications.warn(
      "One or more selected Items are no longer in a valid inventory slot. Damage was not applied."
    );

    return false;
  }


  const freedSlots =
    selectedEntries.reduce(
      (total, entry) =>
        total +
        entry.freedSlots,

      0
    );


  if (
    freedSlots <
    requiredSlots
  ) {

    ui.notifications.warn(
      "The selected Items no longer free enough inventory space. Damage was not applied."
    );

    return false;
  }


  const slots =
    snapshot.slots.map(
      slot => ({
        ...slot
      })
    );


  /* -------------------------------------------------------- */
  /* DROP SELECTED ITEMS                                      */
  /* -------------------------------------------------------- */

  /*
   * One selected embedded Item clears BOTH its anchor and
   * every reserved slot belonging to it.
   */
  for (
    let index = 0;
    index < slots.length;
    index++
  ) {

    const slot =
      slots[index];


    if (
      (
        slot.kind === "item" ||
        slot.kind === "reserved"
      ) &&
      dropSet.has(
        slot.itemId
      )
    ) {

      slots[index] =
        emptyInventorySlot();
    }
  }


  /* -------------------------------------------------------- */
  /* FIND WOUND TARGETS                                       */
  /* -------------------------------------------------------- */

  const woundTargets = [];


  for (
    let index = 0;
    index < snapshot.capacity;
    index++
  ) {

    if (
      slots[index].kind ===
      "empty"
    ) {

      woundTargets.push(
        index
      );
    }
  }


  if (
    woundTargets.length <
    state.wounds
  ) {

    ui.notifications.warn(
      "There is no longer enough inventory space for the required Wounds. Damage was not applied."
    );

    return false;
  }


  /* -------------------------------------------------------- */
  /* CREATE WOUNDS                                            */
  /* -------------------------------------------------------- */

  for (
    let wound = 0;
    wound < state.wounds;
    wound++
  ) {

    slots[
      woundTargets[wound]
    ] =
      woundInventorySlot();
  }


  const newHP =
    snapshot.hp -
    state.hpSpent;


  const newLuck =
    snapshot.luck -
    state.luckSpent;


  try {

    await actor.update(
      {
        "system.resources.hp.current":
          newHP,

        "system.resources.luck.current":
          newLuck,

        "system.inventory.slots":
          slots
      },

      {
        render:
          false
      }
    );

  }

  catch (error) {

    console.error(
      "Delver | Take Damage actor update failed:",
      error
    );


    ui.notifications.error(
      "Delver could not apply the damage."
    );


    return false;
  }


  /* -------------------------------------------------------- */
  /* UNEQUIP DROPPED ITEMS                                    */
  /* -------------------------------------------------------- */

  const equipmentUpdates =
    selectedEntries
      .map(
        entry =>
          actor.items.get(
            entry.itemId
          )
      )
      .filter(
        item =>
          item &&
          Boolean(
            item.system?.equipped
          )
      )
      .map(
        item => ({
          _id:
            item.id,

          "system.equipped":
            false
        })
      );


  if (
    equipmentUpdates.length >
    0
  ) {

    try {

      await actor
        .updateEmbeddedDocuments(
          "Item",
          equipmentUpdates,

          {
            render:
              false
          }
        );

    }

    catch (error) {

      console.error(
        "Delver | Damage applied, but dropped Item unequip cleanup failed:",
        error
      );


      ui.notifications.warn(
        "Damage was applied, but Delver could not immediately clean one or more dropped equipment states."
      );
    }
  }


  console.debug(
    "Delver | Take Damage committed:",
    {
      actor:
        actor.name,

      incoming:
        state.incoming,

      hpSpent:
        state.hpSpent,

      luckSpent:
        state.luckSpent,

      wounds:
        state.wounds,

      freedSlots,

      droppedItems:
        selectedEntries.map(
          entry => ({
            id:
              entry.itemId,

            name:
              entry.name,

            oldSlot:
              entry.slotNumber,

            freedSlots:
              entry.freedSlots,

            wasEquipped:
              entry.equipped
          })
        ),

      resultingHP:
        newHP,

      resultingLuck:
        newLuck
    }
  );


  sheet.render(
    false
  );


  const dropText =
    selectedEntries.length > 0
      ? ` · ${selectedEntries.length} ${
          selectedEntries.length === 1
            ? "Item dropped"
            : "Items dropped"
        }`
      : "";


  ui.notifications.info(
    `${actor.name} took ${state.incoming} damage: ${state.hpSpent} HP · ${state.luckSpent} Luck · ${state.wounds} ${
      state.wounds === 1
        ? "Wound"
        : "Wounds"
    }${dropText}`
  );


  return true;
}


/* ========================================================== */
/* PUBLIC TAKE DAMAGE ACTION                                  */
/* ========================================================== */

export async function runTakeDamage(
  sheet
) {

  const actor =
    sheet.actor;


  if (
    !actor ||
    actor.type !==
      "character" ||
    !sheet.isEditable
  ) {

    return;
  }


  /*
   * Save anything typed into the Character sheet before
   * beginning gameplay resolution.
   */
  await sheet.submit({
    preventClose:
      true,

    preventRender:
      true
  });


  let seed =
    null;


  /*
   * Loop allows:
   *
   * Allocation
   *     ↓
   * Drop Items
   *     ↓
   * Back
   *     ↓
   * Same Allocation
   */
  while (true) {

    const snapshot =
      buildDamageSnapshot(
        actor
      );


    const allocation =
      await promptDamageAllocation(
        actor,
        snapshot,
        seed
      );


    if (
      !allocation ||
      allocation ===
        "cancel"
    ) {

      return;
    }


    /*
     * Revalidate before proceeding.
     */
    const freshSnapshot =
      buildDamageSnapshot(
        actor
      );


    const freshAllocation =
      evaluateAllocation(
        freshSnapshot,
        allocation
      );


    if (
      !freshAllocation.valid
    ) {

      ui.notifications.warn(
        `${actor.name}'s resources or inventory changed. Please review the damage allocation again.`
      );


      seed =
        allocation;


      continue;
    }


    /* ------------------------------------------------------ */
    /* NO DROPS REQUIRED                                      */
    /* ------------------------------------------------------ */

    if (
      freshAllocation
        .requiredDrops ===
      0
    ) {

      await commitDamage(
        sheet,
        freshAllocation,
        []
      );


      return;
    }


    /* ------------------------------------------------------ */
    /* ITEM DROP SELECTION                                    */
    /* ------------------------------------------------------ */

    const dropResult =
      await promptDamageDrops(
        actor,
        freshSnapshot,
        freshAllocation
      );


    if (
      !dropResult ||
      dropResult ===
        "cancel"
    ) {

      return;
    }


    if (
      dropResult.action ===
      "back"
    ) {

      seed =
        freshAllocation;


      continue;
    }


    if (
      dropResult.action !==
      "apply"
    ) {

      return;
    }


    await commitDamage(
      sheet,
      freshAllocation,
      dropResult.itemIds
    );


    return;
  }
}