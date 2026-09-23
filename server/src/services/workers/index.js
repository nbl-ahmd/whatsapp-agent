/**
 * Workers module.
 *
 * Background processing entrypoints. Webhook handling persists and enqueues;
 * workers consume queue topics (see `server/src/lib/constants.js` QUEUE_TOPIC) and run
 * automation, AI inference and outbound sending outside the request cycle.
 */
export const descriptor = Object.freeze({
  name: "workers",
  phase: 4,
  description: "Background queue consumers for automation, AI and outbound sending.",
});
