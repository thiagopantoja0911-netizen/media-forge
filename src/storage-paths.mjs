import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function resolveStoragePath(value, options = {}) {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Storage path must not be empty");
  if (raw === "~") return resolve(home);
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return resolve(join(home, raw.slice(2)));
  return isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
}
export function defaultDataDirectory({ production = process.env.NODE_ENV === "production", home = homedir() } = {}) {
  return production ? join(home, ".mediaforge-runtime") : ".mediaforge";
}

export function mediaForgeDataDirectory({
  configured = process.env.MEDIAFORGE_DATA_DIR,
  production = process.env.NODE_ENV === "production",
  home = homedir(),
  cwd = process.cwd()
} = {}) {
  return resolveStoragePath(configured || defaultDataDirectory({ production, home }), { home, cwd });
}
