/**
 * Automation engine.
 *
 * Event-driven workflow execution over the normalized internal event model.
 * Workflows are JSON definitions; execution logic stays independent from the UI.
 * Event, action and condition vocabulary lives in `server/src/lib/constants.js`.
 */
export const descriptor = Object.freeze({
  name: "automation",
  phase: 4,
  description: "Event-driven JSON workflow engine.",
});
