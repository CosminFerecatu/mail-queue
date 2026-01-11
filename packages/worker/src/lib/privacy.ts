import { isIP } from 'node:net';

/**
 * Privacy utilities for GDPR compliance and data protection
 */

// Maximum length for stored error messages
const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Sanitize an error message before storing in the database
 *
 * Removes or masks potentially sensitive information:
 * - Internal hostnames and IP addresses
 * - File system paths
 * - Stack traces
 * - Connection strings
 * - Credentials that may have leaked into error messages
 *
 * @param error - The error message to sanitize
 * @returns A sanitized error message safe for storage and display
 */
export function sanitizeErrorMessage(error: string | null | undefined): string | null {
  if (!error) {
    return null;
  }

  let sanitized = error;

  // Remove stack traces (lines starting with "at " after the first line)
  sanitized = sanitized.replace(/\n\s*at\s+.*/g, '');

  // Remove file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/[\w.-]+)+\/[\w.-]+/g, '[path]');
  sanitized = sanitized.replace(/(?:[A-Za-z]:\\[\w\\.-]+)+/g, '[path]');

  // Remove internal IP addresses (private ranges) but keep error context
  sanitized = sanitized.replace(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[internal-ip]');
  sanitized = sanitized.replace(/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g, '[internal-ip]');
  sanitized = sanitized.replace(/\b192\.168\.\d{1,3}\.\d{1,3}\b/g, '[internal-ip]');
  sanitized = sanitized.replace(/\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[localhost]');

  // Remove connection strings (postgres://, redis://, etc.)
  sanitized = sanitized.replace(
    /\b(postgres|postgresql|redis|mysql|mongodb|amqp):\/\/[^\s"']+/gi,
    '[$1-connection]'
  );

  // Remove anything that looks like a password or secret in the message
  sanitized = sanitized.replace(/password[=:]\s*['"]?[^\s'"]+['"]?/gi, 'password=[redacted]');
  sanitized = sanitized.replace(/secret[=:]\s*['"]?[^\s'"]+['"]?/gi, 'secret=[redacted]');
  sanitized = sanitized.replace(/api[_-]?key[=:]\s*['"]?[^\s'"]+['"]?/gi, 'api_key=[redacted]');
  sanitized = sanitized.replace(/token[=:]\s*['"]?[^\s'"]+['"]?/gi, 'token=[redacted]');

  // Truncate to maximum length
  if (sanitized.length > MAX_ERROR_MESSAGE_LENGTH) {
    sanitized = `${sanitized.substring(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
  }

  // Clean up any multiple spaces or newlines
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized || null;
}

/**
 * Anonymize an IP address for privacy compliance
 *
 * - IPv4: Zeros the last octet (e.g., 192.168.1.123 → 192.168.1.0)
 * - IPv6: Zeros the last 80 bits, keeping the /48 network prefix
 *   (e.g., 2001:db8:85a3::8a2e:370:7334 → 2001:db8:85a3::)
 *
 * This approach follows Google Analytics' IP anonymization standard
 * and is generally considered GDPR-compliant for analytics purposes.
 *
 * @param ip - The IP address to anonymize
 * @returns The anonymized IP address, or the original if parsing fails
 */
export function anonymizeIpAddress(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }

  const trimmedIp = ip.trim();
  const ipVersion = isIP(trimmedIp);

  if (ipVersion === 4) {
    return anonymizeIPv4(trimmedIp);
  }

  if (ipVersion === 6) {
    return anonymizeIPv6(trimmedIp);
  }

  // If we can't parse it, return null for safety (don't store unrecognized data)
  return null;
}

/**
 * Anonymize IPv4 by zeroing the last octet
 */
function anonymizeIPv4(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return ip;
  }
  parts[3] = '0';
  return parts.join('.');
}

/**
 * Anonymize IPv6 by keeping only the first 48 bits (/48 network)
 *
 * This zeros the last 80 bits, which is more aggressive than IPv4
 * but appropriate given IPv6's larger address space and the fact
 * that /48 allocations are common for organizations.
 */
function anonymizeIPv6(ip: string): string {
  // Expand the IPv6 address to full form for easier manipulation
  const expanded = expandIPv6(ip);
  if (!expanded) {
    return ip;
  }

  // Keep first 3 groups (48 bits), zero the rest
  const groups = expanded.split(':');
  const anonymized = [
    groups[0] ?? '0000',
    groups[1] ?? '0000',
    groups[2] ?? '0000',
    '0000',
    '0000',
    '0000',
    '0000',
    '0000',
  ];

  // Compress back to standard form
  return compressIPv6(anonymized.join(':'));
}

/**
 * Expand an IPv6 address to its full 8-group form
 */
function expandIPv6(ip: string): string | null {
  let ipToProcess = ip;
  // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  const ipv4MappedMatch = ipToProcess.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch) {
    const prefix = ipv4MappedMatch[1] ?? '';
    const ipv4 = ipv4MappedMatch[2] ?? '0.0.0.0';
    // Convert IPv4 part to two IPv6 groups
    const ipv4Parts = ipv4.split('.').map(Number);
    const group1 = ((ipv4Parts[0] ?? 0) << 8) | (ipv4Parts[1] ?? 0);
    const group2 = ((ipv4Parts[2] ?? 0) << 8) | (ipv4Parts[3] ?? 0);
    const ipv6Suffix = `${group1.toString(16).padStart(4, '0')}:${group2.toString(16).padStart(4, '0')}`;
    ipToProcess = `${prefix}:${ipv6Suffix}`;
  }

  // Split on :: to find where zeros should be inserted
  const parts = ipToProcess.split('::');

  if (parts.length > 2) {
    return null; // Invalid: more than one ::
  }

  let groups: string[];

  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const zerosNeeded = 8 - left.length - right.length;

    if (zerosNeeded < 0) {
      return null; // Invalid
    }

    groups = [...left, ...Array(zerosNeeded).fill('0000'), ...right];
  } else {
    groups = ip.split(':');
  }

  if (groups.length !== 8) {
    return null;
  }

  // Pad each group to 4 characters
  return groups.map((g) => g.padStart(4, '0')).join(':');
}

/**
 * Compress an IPv6 address by finding the longest run of zeros
 */
function compressIPv6(expanded: string): string {
  const groups = expanded.split(':');

  // Find the longest consecutive run of zero groups
  let longestStart = -1;
  let longestLength = 0;
  let currentStart = -1;
  let currentLength = 0;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0000') {
      if (currentStart === -1) {
        currentStart = i;
        currentLength = 1;
      } else {
        currentLength++;
      }
    } else {
      if (currentLength > longestLength) {
        longestStart = currentStart;
        longestLength = currentLength;
      }
      currentStart = -1;
      currentLength = 0;
    }
  }

  // Check if the last run was the longest
  if (currentLength > longestLength) {
    longestStart = currentStart;
    longestLength = currentLength;
  }

  // Remove leading zeros from each group
  const shortened = groups.map((g) => g.replace(/^0+/, '') || '0');

  // If we have at least 2 consecutive zero groups, compress them
  if (longestLength >= 2) {
    const before = shortened.slice(0, longestStart);
    const after = shortened.slice(longestStart + longestLength);

    if (before.length === 0 && after.length === 0) {
      return '::';
    }
    if (before.length === 0) {
      return `::${after.join(':')}`;
    }
    if (after.length === 0) {
      return `${before.join(':')}::`;
    }
    return `${before.join(':')}::${after.join(':')}`;
  }

  return shortened.join(':');
}
