import { env } from "../config/env.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const REDACTED = "[REDACTED]";
const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|cookie)/i;
const MAX_DEPTH = 4;

function redact(value, depth = 0) {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Object]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

function write(level, message, meta) {
  if (LEVELS[level] < (LEVELS[env.logLevel] ?? LEVELS.info)) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
  };
  if (meta !== undefined) entry.meta = redact(meta);

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
