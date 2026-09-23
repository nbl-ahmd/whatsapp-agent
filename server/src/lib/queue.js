import { logger } from "./logger";

/**
 * Queue abstraction.
 *
 * The default driver is in-memory so local development needs no Redis. When
 * background workers are enabled (Phase 4+), a Redis/BullMQ driver can be added
 * behind this same interface without touching callers.
 *
 * Driver contract:
 *   enqueue(topic, payload) -> Promise<void>
 *   subscribe(listener)     -> void          // listener({ topic, payload })
 */

function createMemoryDriver() {
  const listeners = new Set();
  return {
    async enqueue(topic, payload) {
      const job = { topic, payload, enqueuedAt: Date.now() };
      for (const listener of listeners) {
        setImmediate(() => listener(job));
      }
    },
    subscribe(listener) {
      listeners.add(listener);
    },
  };
}

class QueueService {
  constructor(driver) {
    this.driver = driver;
    this.handlers = new Map();
    this.driver.subscribe((job) => this.dispatch(job));
  }

  /** Register the handler for a topic. One handler per topic. */
  register(topic, handler) {
    this.handlers.set(topic, handler);
    return this;
  }

  async enqueue(topic, payload) {
    await this.driver.enqueue(topic, payload);
  }

  async dispatch(job) {
    const handler = this.handlers.get(job.topic);
    if (!handler) {
      logger.warn("No queue handler registered", { topic: job.topic });
      return;
    }
    try {
      await handler(job.payload);
    } catch (error) {
      logger.error("Queue handler failed", {
        topic: job.topic,
        error: error?.message,
      });
    }
  }
}

export const queue = new QueueService(createMemoryDriver());

export { QueueService };
