import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mediaForgeDataDirectory } from "./storage-paths.mjs";

const dataDir = mediaForgeDataDirectory();
const statePath = join(dataDir, "state.json");
const lockPath = join(dataDir, "state.lock");

function defaults() {
  return {
    settings: {
      passwordHash: null,
      sessionSecret: randomBytes(32).toString("hex"),
      workerTokenHash: null,
      pluginTokenHash: null
    },
    oauth: {
      clients: {},
      requests: {},
      codes: {},
      access: {},
      refresh: {},
      limits: {}
    }
  };
}

function mergeDefaults(value) {
  const base = defaults();
  const state = value && typeof value === "object" ? value : {};
  return {
    ...base,
    ...state,
    settings: { ...base.settings, ...(state.settings ?? {}) },
    oauth: {
      ...base.oauth,
      ...(state.oauth ?? {}),
      clients: { ...base.oauth.clients, ...(state.oauth?.clients ?? {}) },
      requests: { ...base.oauth.requests, ...(state.oauth?.requests ?? {}) },
      codes: { ...base.oauth.codes, ...(state.oauth?.codes ?? {}) },
      access: { ...base.oauth.access, ...(state.oauth?.access ?? {}) },
      refresh: { ...base.oauth.refresh, ...(state.oauth?.refresh ?? {}) },
      limits: { ...base.oauth.limits, ...(state.oauth?.limits ?? {}) }
    }
  };
}

export function hashSecret(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function verifySecret(value, digest) {
  if (!value || !digest) return false;
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(String(digest), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(String(password), salt, 32).toString("base64url");
  return "scrypt$" + salt + "$" + derived;
}

export function verifyPassword(password, encoded) {
  const parts = String(encoded ?? "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const actual = scryptSync(String(password), parts[1], 32);
    const expected = Buffer.from(parts[2], "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + signature;
}

export function verifySession(cookie, secret) {
  const parts = String(cookie ?? "").split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock() {
  await mkdir(dirname(statePath), { recursive: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await open(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await sleep(25);
    }
  }
  const error = new Error("STATE_LOCK_TIMEOUT");
  error.code = "STATE_LOCK_TIMEOUT";
  throw error;
}

export async function readState() {
  try {
    const raw = await readFile(statePath, "utf8");
    return mergeDefaults(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return mergeDefaults(null);
  }
}

export async function updateState(mutator) {
  const lock = await acquireLock();
  try {
    const state = await readState();
    const result = await mutator(state);
    const temporary = statePath + "." + randomToken(8) + ".tmp";
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, statePath);
    return result;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
