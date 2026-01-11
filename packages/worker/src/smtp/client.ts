import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter, SentMessageInfo } from 'nodemailer';
import type { SmtpConfigRow } from '@mail-queue/db';
import { decrypt, deserialize } from '@mail-queue/core';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  pool?: boolean;
  maxConnections?: number;
}

interface SmtpConnection {
  transporter: Transporter;
  lastUsed: number;
  inUse: boolean;
}

// Connection pool per SMTP config
const connectionPools = new Map<string, SmtpConnection[]>();

const POOL_SIZE = 5;
const CONNECTION_TIMEOUT = 30000; // 30 seconds
const IDLE_TIMEOUT = 60000; // 1 minute

export interface SmtpClientConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  poolSize?: number;
  timeout?: number;
}

function createTransporter(smtpConfig: SmtpClientConfig): Transporter<SentMessageInfo> {
  const options: SmtpTransportOptions = {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth:
      smtpConfig.user && smtpConfig.pass
        ? {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
          }
        : undefined,
    connectionTimeout: smtpConfig.timeout ?? CONNECTION_TIMEOUT,
    greetingTimeout: 10000,
    socketTimeout: smtpConfig.timeout ?? CONNECTION_TIMEOUT,
    pool: false, // We manage our own pool
    maxConnections: 1,
  };
  return nodemailer.createTransport(options);
}

/**
 * Generate a pool key for SMTP connection pooling
 *
 * Uses a hash of the connection parameters to avoid exposing
 * usernames in logs while still providing unique keys per config.
 */
function getPoolKey(smtpConfig: SmtpClientConfig): string {
  const keyData = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.user ?? 'anonymous'}`;
  const hash = createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  return `smtp-${smtpConfig.host}:${smtpConfig.port}-${hash}`;
}

async function getConnection(smtpConfig: SmtpClientConfig): Promise<SmtpConnection> {
  const poolKey = getPoolKey(smtpConfig);
  let pool = connectionPools.get(poolKey);

  if (!pool) {
    pool = [];
    connectionPools.set(poolKey, pool);
  }

  // Find an available connection
  const available = pool.find((c) => !c.inUse);
  if (available) {
    available.inUse = true;
    available.lastUsed = Date.now();
    return available;
  }

  // Create new connection if pool not full
  const poolSize = smtpConfig.poolSize ?? POOL_SIZE;
  if (pool.length < poolSize) {
    const transporter = createTransporter(smtpConfig);

    // Verify connection
    try {
      await transporter.verify();
    } catch (error) {
      logger.error({ error, host: smtpConfig.host }, 'Failed to verify SMTP connection');
      throw error;
    }

    const connection: SmtpConnection = {
      transporter,
      lastUsed: Date.now(),
      inUse: true,
    };

    pool.push(connection);
    logger.debug({ poolKey, poolSize: pool.length }, 'Created new SMTP connection');

    return connection;
  }

  // Wait for available connection
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for SMTP connection'));
    }, CONNECTION_TIMEOUT);

    const checkInterval = setInterval(() => {
      const available = pool?.find((c) => !c.inUse);
      if (available) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        available.inUse = true;
        available.lastUsed = Date.now();
        resolve(available);
      }
    }, 100);
  });
}

function releaseConnection(_smtpConfig: SmtpClientConfig, connection: SmtpConnection): void {
  connection.inUse = false;
  connection.lastUsed = Date.now();
}

export interface SendMailOptions {
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export async function sendMail(
  smtpConfig: SmtpClientConfig,
  options: SendMailOptions
): Promise<SendMailResult> {
  const connection = await getConnection(smtpConfig);

  try {
    const result = await connection.transporter.sendMail({
      from: options.from.name
        ? `"${options.from.name}" <${options.from.email}>`
        : options.from.email,
      to: options.to.map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email)).join(', '),
      cc: options.cc?.map((c) => (c.name ? `"${c.name}" <${c.email}>` : c.email)).join(', '),
      bcc: options.bcc?.map((b) => (b.name ? `"${b.name}" <${b.email}>` : b.email)).join(', '),
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      text: options.text,
      headers: options.headers,
    });

    return {
      messageId: result.messageId,
      accepted: result.accepted as string[],
      rejected: result.rejected as string[],
      response: result.response,
    };
  } finally {
    releaseConnection(smtpConfig, connection);
  }
}

export function smtpConfigFromRow(row: SmtpConfigRow, encryptionKey: Buffer): SmtpClientConfig {
  let password: string | undefined;

  if (row.password) {
    try {
      const encrypted = deserialize(row.password);
      password = decrypt(encrypted, encryptionKey);
    } catch (error) {
      logger.error({ error, configId: row.id }, 'Failed to decrypt SMTP password');
    }
  }

  return {
    host: row.host,
    port: row.port,
    secure: row.encryption === 'tls',
    user: row.username ?? undefined,
    pass: password,
    poolSize: row.poolSize,
    timeout: row.timeoutMs,
  };
}

export function getDefaultSmtpConfig(): SmtpClientConfig | null {
  if (!config.smtpHost) {
    return null;
  }

  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    user: config.smtpUser,
    pass: config.smtpPass,
  };
}

// Cleanup idle connections periodically
setInterval(() => {
  const now = Date.now();

  for (const [poolKey, pool] of connectionPools) {
    const activeConnections = pool.filter((c) => {
      if (!c.inUse && now - c.lastUsed > IDLE_TIMEOUT) {
        c.transporter.close();
        logger.debug({ poolKey }, 'Closed idle SMTP connection');
        return false;
      }
      return true;
    });

    if (activeConnections.length === 0) {
      connectionPools.delete(poolKey);
    } else {
      connectionPools.set(poolKey, activeConnections);
    }
  }
}, IDLE_TIMEOUT);

export async function closeAllConnections(): Promise<void> {
  for (const [poolKey, pool] of connectionPools) {
    for (const connection of pool) {
      connection.transporter.close();
    }
    logger.debug({ poolKey }, 'Closed SMTP connection pool');
  }
  connectionPools.clear();
}
