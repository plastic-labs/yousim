import fs from "fs";
import os from "os";
import path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".yousim");
const ENV_PATH = path.join(CONFIG_DIR, ".env");
const JSON_PATH = path.join(CONFIG_DIR, "config.json");

const ensureConfigDir = () => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

const setEnvIfMissing = (key: string, value: unknown) => {
  if (!key) {
    return;
  }
  if (value === undefined || value === null) {
    return;
  }
  if (process.env[key]) {
    return;
  }
  process.env[key] = String(value);
};

const normalizeKey = (key: string) => key.trim().toUpperCase();

const parseEnv = (content: string) => {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const rawKey = trimmed.slice(0, equalsIndex).trim();
    let rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      rawValue = rawValue.slice(1, -1);
    }
    result[rawKey] = rawValue;
  }
  return result;
};

const loadEnvFile = () => {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }
  try {
    const content = fs.readFileSync(ENV_PATH, "utf8");
    const parsed = parseEnv(content);
    for (const [key, value] of Object.entries(parsed)) {
      setEnvIfMissing(normalizeKey(key), value);
    }
  } catch (error) {
    console.warn("Failed to read ~/.yousim/.env:", error);
  }
};

const loadJsonFile = () => {
  if (!fs.existsSync(JSON_PATH)) {
    return;
  }
  try {
    const content = fs.readFileSync(JSON_PATH, "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      setEnvIfMissing(normalizeKey(key), value);
    }
  } catch (error) {
    console.warn("Failed to read ~/.yousim/config.json:", error);
  }
};

export const loadUserConfig = () => {
  ensureConfigDir();
  loadEnvFile();
  loadJsonFile();
  return {
    configDir: CONFIG_DIR,
    envPath: ENV_PATH,
    jsonPath: JSON_PATH,
  };
};
