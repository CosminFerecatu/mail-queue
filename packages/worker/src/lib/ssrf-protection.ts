import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { URL } from 'node:url';

/**
 * SSRF Protection utilities for webhook delivery
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks by:
 * - Blocking private/internal IP ranges
 * - Blocking cloud metadata endpoints
 * - Blocking dangerous protocols
 * - Resolving DNS and validating resolved IPs
 */

// Allowed protocols
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Blocked hostnames (case-insensitive)
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.gcp.internal',
  'metadata',
  'kubernetes.default.svc',
  'kubernetes.default',
  'kubernetes',
]);

// Private/blocked IPv4 CIDR ranges
const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8', // Current network
  '10.0.0.0/8', // Private network (Class A)
  '100.64.0.0/10', // Carrier-grade NAT
  '127.0.0.0/8', // Localhost
  '169.254.0.0/16', // Link-local (includes cloud metadata 169.254.169.254)
  '172.16.0.0/12', // Private network (Class B)
  '192.0.0.0/24', // IETF Protocol Assignments
  '192.0.2.0/24', // TEST-NET-1 (documentation)
  '192.168.0.0/16', // Private network (Class C)
  '198.18.0.0/15', // Benchmarking
  '198.51.100.0/24', // TEST-NET-2 (documentation)
  '203.0.113.0/24', // TEST-NET-3 (documentation)
  '224.0.0.0/4', // Multicast
  '240.0.0.0/4', // Reserved for future use
  '255.255.255.255/32', // Broadcast
];

/**
 * Convert IPv4 address to 32-bit unsigned integer
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/**
 * Check if IPv4 address is in a CIDR range
 */
function isInCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.split('/');
  if (!rangeIp || !prefixStr) return false;

  const prefix = Number.parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(rangeIp);

  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Check if an IPv4 address is in a blocked range
 */
function isBlockedIPv4(ip: string): boolean {
  for (const cidr of BLOCKED_IPV4_CIDRS) {
    if (isInCidr(ip, cidr)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an IPv6 address is blocked
 */
function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Localhost (::1)
  if (normalized === '::1') {
    return true;
  }

  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const ipv4MappedMatch = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch?.[1]) {
    return isBlockedIPv4(ipv4MappedMatch[1]);
  }

  // Unique local addresses (fc00::/7 - starts with fc or fd)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // Link-local addresses (fe80::/10)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an IP address (v4 or v6) is blocked
 */
function isBlockedIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    return isBlockedIPv6(ip);
  }
  // Unknown format - block it for safety
  return true;
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  resolvedIps?: string[];
}

/**
 * Validate a webhook URL for SSRF protection
 *
 * This function:
 * 1. Validates the protocol (only http/https allowed)
 * 2. Checks for blocked hostnames (localhost, cloud metadata, etc.)
 * 3. Resolves DNS and validates all resolved IPs are public
 *
 * @param webhookUrl - The URL to validate
 * @returns Validation result with error message if invalid
 */
export async function validateWebhookUrl(webhookUrl: string): Promise<UrlValidationResult> {
  // Parse URL
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { valid: false, error: `Protocol not allowed: ${url.protocol}` };
  }

  // Check for blocked hostnames
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }

  // If hostname is already an IP address, validate it directly
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    if (isBlockedIP(hostname)) {
      return { valid: false, error: `IP address not allowed: ${hostname}` };
    }
    return { valid: true, resolvedIps: [hostname] };
  }

  // Resolve DNS and validate all resolved IPs
  try {
    // Try to resolve both A (IPv4) and AAAA (IPv6) records
    const [ipv4Results, ipv6Results] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);

    const addresses: string[] = [];

    if (ipv4Results.status === 'fulfilled') {
      addresses.push(...ipv4Results.value);
    }
    if (ipv6Results.status === 'fulfilled') {
      addresses.push(...ipv6Results.value);
    }

    if (addresses.length === 0) {
      return { valid: false, error: 'DNS resolution returned no addresses' };
    }

    // Check all resolved IPs
    for (const ip of addresses) {
      if (isBlockedIP(ip)) {
        return { valid: false, error: `Resolved IP not allowed: ${ip}` };
      }
    }

    return { valid: true, resolvedIps: addresses };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: `DNS resolution failed: ${message}` };
  }
}
