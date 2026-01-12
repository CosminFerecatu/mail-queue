import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM encryption utilities for secure secret storage
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const DEFAULT_API_KEY_PREFIX = 'mq_live';

/**
 * Encrypted data format
 */
export interface EncryptedData {
  iv: string; // hex
  authTag: string; // hex
  data: string; // hex
  salt?: string; // hex, only for password-based encryption
}

/**
 * Derive a key from a password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32); // 256 bits
}

/**
 * Parse the encryption key from environment variable
 * Expects a 64-character hex string (32 bytes)
 */
export function parseEncryptionKey(keyHex: string): Buffer {
  if (keyHex.length !== 64) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)');
  }

  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('Encryption key must be a valid hex string');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt data using AES-256-GCM with a key
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

/**
 * Decrypt data using AES-256-GCM with a key
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  const encrypted = Buffer.from(encryptedData.data, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt data using a password (derives key using scrypt)
 */
export function encryptWithPassword(plaintext: string, password: string): EncryptedData {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);

  const result = encrypt(plaintext, key);
  result.salt = salt.toString('hex');

  return result;
}

/**
 * Decrypt data using a password
 */
export function decryptWithPassword(encryptedData: EncryptedData, password: string): string {
  if (!encryptedData.salt) {
    throw new Error('Salt is required for password-based decryption');
  }

  const salt = Buffer.from(encryptedData.salt, 'hex');
  const key = deriveKey(password, salt);

  return decrypt(encryptedData, key);
}

/**
 * Serialize encrypted data to a string for storage
 * Format: iv:authTag:data[:salt]
 */
export function serialize(encryptedData: EncryptedData): string {
  const parts = [encryptedData.iv, encryptedData.authTag, encryptedData.data];

  if (encryptedData.salt) {
    parts.push(encryptedData.salt);
  }

  return parts.join(':');
}

/**
 * Deserialize encrypted data from a string
 */
export function deserialize(serialized: string): EncryptedData {
  const parts = serialized.split(':');

  if (parts.length < 3 || parts.length > 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [iv, authTag, data, salt] = parts;

  if (!iv || !authTag || !data) {
    throw new Error('Invalid encrypted data format: missing required parts');
  }

  const result: EncryptedData = { iv, authTag, data };

  if (salt) {
    result.salt = salt;
  }

  return result;
}

/**
 * Generate a random encryption key
 */
export function generateKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a random secret (for API keys, webhook secrets, etc.)
 */
export function generateSecret(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a prefixed API key
 * Format: prefix_randomSecret
 */
export function generateApiKey(prefix = DEFAULT_API_KEY_PREFIX): {
  key: string;
  prefix: string;
} {
  const secret = generateSecret(32);
  const key = `${prefix}_${secret}`;

  return {
    key,
    prefix: `${prefix}_${secret.substring(0, 4)}`,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
