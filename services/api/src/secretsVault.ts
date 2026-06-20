import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { IntegrationSecretEncryptedEntry, IntegrationSecretsVaultRecord } from "@open-feedback-factory/db";
import type { ApiConfig } from "./config.js";

const algorithm = "aes-256-gcm" as const;
const ivBytes = 12;
const maxSecretBytes = 20_000;
const vaultSegmentPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/;

export interface IntegrationSecretMetadata {
  configured: true;
  createdAt: string;
  fingerprint: string;
  name: string;
  provider: string;
  scopes: string[];
  updatedAt: string;
}

export interface SecretsVaultStatus {
  configured: boolean;
  secretCount: number;
  status: "missing_key" | "ready";
  summary: string;
}

export function secretsVaultConfigured(config: ApiConfig): boolean {
  return typeof config.secretsVaultKey === "string" && config.secretsVaultKey.trim().length > 0;
}

export function buildSecretsVaultStatus(config: ApiConfig, vault: IntegrationSecretsVaultRecord): SecretsVaultStatus {
  const configured = secretsVaultConfigured(config);
  return {
    configured,
    secretCount: vault.secrets.length,
    status: configured ? "ready" : "missing_key",
    summary: configured
      ? "Integration secrets vault key is configured. Stored secrets are returned as metadata only."
      : "Set SECRETS_VAULT_KEY before saving provider credentials for agent work.",
  };
}

export function encryptedSecretMetadata(entry: IntegrationSecretEncryptedEntry): IntegrationSecretMetadata {
  return {
    configured: true,
    createdAt: entry.createdAt,
    fingerprint: entry.fingerprint,
    name: entry.name,
    provider: entry.provider,
    scopes: entry.scopes,
    updatedAt: entry.updatedAt,
  };
}

export function encryptIntegrationSecret(
  config: ApiConfig,
  input: {
    name: string;
    provider: string;
    scopes?: unknown;
    secret: string;
  },
): IntegrationSecretEncryptedEntry {
  const vaultKey = normalizedVaultKey(config);
  if (!vaultKey) {
    throw new SecretsVaultConfigurationError("secrets vault key missing");
  }

  const secret = input.secret.trim();
  if (Buffer.byteLength(secret, "utf8") < 8) {
    throw new SecretsVaultValidationError("secret must be at least 8 characters");
  }
  if (Buffer.byteLength(secret, "utf8") > maxSecretBytes) {
    throw new SecretsVaultValidationError("secret is too large");
  }

  const provider = normalizeVaultSegment(input.provider);
  const name = normalizeVaultSegment(input.name);
  if (!provider || !name) {
    throw new SecretsVaultValidationError("provider and name must use lowercase letters, numbers, dot, underscore, colon, or dash");
  }

  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, deriveVaultKey(vaultKey), iv);
  cipher.setAAD(Buffer.from(`${provider}:${name}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const now = new Date().toISOString();

  return {
    algorithm,
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    createdAt: now,
    fingerprint: fingerprintSecret(vaultKey, secret),
    iv: iv.toString("base64"),
    name,
    provider,
    scopes: normalizeSecretScopes(input.scopes),
    updatedAt: now,
    version: 1,
  };
}

export function decryptIntegrationSecret(config: ApiConfig, entry: IntegrationSecretEncryptedEntry): string {
  const vaultKey = normalizedVaultKey(config);
  if (!vaultKey) {
    throw new SecretsVaultConfigurationError("secrets vault key missing");
  }
  const decipher = createDecipheriv(algorithm, deriveVaultKey(vaultKey), Buffer.from(entry.iv, "base64"));
  decipher.setAAD(Buffer.from(`${entry.provider}:${entry.name}`, "utf8"));
  decipher.setAuthTag(Buffer.from(entry.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(entry.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function upsertIntegrationSecret(
  vault: IntegrationSecretsVaultRecord,
  entry: IntegrationSecretEncryptedEntry,
): IntegrationSecretsVaultRecord {
  const existing = vault.secrets.find(
    (secret) => secret.provider === entry.provider && secret.name === entry.name,
  );
  const createdAt = existing?.createdAt ?? entry.createdAt;
  const nextEntry = { ...entry, createdAt, updatedAt: entry.updatedAt };
  return {
    secrets: [
      ...vault.secrets.filter((secret) => secret.provider !== entry.provider || secret.name !== entry.name),
      nextEntry,
    ].sort((left, right) => `${left.provider}/${left.name}`.localeCompare(`${right.provider}/${right.name}`)),
    version: 1,
  };
}

export function removeIntegrationSecret(
  vault: IntegrationSecretsVaultRecord,
  provider: string,
  name: string,
): { nextVault: IntegrationSecretsVaultRecord; removed: boolean } {
  const normalizedProvider = normalizeVaultSegment(provider);
  const normalizedName = normalizeVaultSegment(name);
  const nextSecrets = vault.secrets.filter(
    (secret) => secret.provider !== normalizedProvider || secret.name !== normalizedName,
  );
  return {
    nextVault: { secrets: nextSecrets, version: 1 },
    removed: nextSecrets.length !== vault.secrets.length,
  };
}

export function normalizeSecretScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter((item) => item.length > 0 && item.length <= 80),
    ),
  ).sort();
}

export function normalizeVaultSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return vaultSegmentPattern.test(normalized) ? normalized : null;
}

export class SecretsVaultConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsVaultConfigurationError";
  }
}

export class SecretsVaultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsVaultValidationError";
  }
}

function normalizedVaultKey(config: ApiConfig): string | null {
  const key = config.secretsVaultKey?.trim();
  return key ? key : null;
}

function deriveVaultKey(secretKey: string): Buffer {
  return createHash("sha256").update(secretKey, "utf8").digest();
}

function fingerprintSecret(vaultKey: string, secret: string): string {
  return `sha256:${createHmac("sha256", vaultKey).update(secret, "utf8").digest("hex").slice(0, 12)}`;
}
