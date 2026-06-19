import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApiConfig } from "./config.js";

export interface CodexApiKeyStatus {
  configured: boolean;
  fingerprint: string | null;
  path: string;
  source: "env" | "local_file" | "missing";
  writable: boolean;
}

export async function getCodexApiKeyStatus(config: ApiConfig): Promise<CodexApiKeyStatus> {
  const envKey = process.env.OPENAI_API_KEY;
  if (isUsableApiKey(envKey)) {
    return {
      configured: true,
      fingerprint: fingerprintApiKey(envKey),
      path: config.codexSecretsPath,
      source: "env",
      writable: true,
    };
  }

  const localKey = await readLocalApiKey(config.codexSecretsPath);
  if (isUsableApiKey(localKey)) {
    process.env.OPENAI_API_KEY = localKey;
    return {
      configured: true,
      fingerprint: fingerprintApiKey(localKey),
      path: config.codexSecretsPath,
      source: "local_file",
      writable: true,
    };
  }

  return {
    configured: false,
    fingerprint: null,
    path: config.codexSecretsPath,
    source: "missing",
    writable: true,
  };
}

export async function saveCodexApiKey(config: ApiConfig, apiKey: string): Promise<CodexApiKeyStatus> {
  const normalized = apiKey.trim();
  if (!isValidApiKeyInput(normalized)) {
    throw new Error("API key must be at least 20 characters and contain no whitespace");
  }

  const secretsPath = path.resolve(config.codexSecretsPath);
  await mkdir(path.dirname(secretsPath), { recursive: true, mode: 0o700 });
  await writeFile(secretsPath, `OPENAI_API_KEY=${quoteEnvValue(normalized)}\n`, { mode: 0o600 });
  process.env.OPENAI_API_KEY = normalized;

  return {
    configured: true,
    fingerprint: fingerprintApiKey(normalized),
    path: config.codexSecretsPath,
    source: "local_file",
    writable: true,
  };
}

export async function removeCodexApiKey(config: ApiConfig): Promise<CodexApiKeyStatus> {
  await rm(path.resolve(config.codexSecretsPath), { force: true });
  if (process.env.OPENAI_API_KEY) delete process.env.OPENAI_API_KEY;
  return getCodexApiKeyStatus(config);
}

function isUsableApiKey(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length >= 20;
}

function isValidApiKeyInput(value: string): boolean {
  return value.length >= 20 && !/\s/.test(value);
}

function fingerprintApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "configured";
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

async function readLocalApiKey(secretsPath: string): Promise<string | undefined> {
  try {
    const contents = await readFile(path.resolve(secretsPath), "utf8");
    return parseEnvValue(contents, "OPENAI_API_KEY");
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function parseEnvValue(contents: string, key: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    if (trimmed.slice(0, separatorIndex).trim() !== key) continue;
    return unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
  }
  return undefined;
}

function quoteEnvValue(value: string): string {
  return JSON.stringify(value);
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
