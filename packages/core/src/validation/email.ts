/**
 * Email validation utilities
 * Validates email addresses according to RFC 5322 and common best practices
 */

// RFC 5322 compliant email regex (simplified but practical)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common disposable email domains (partial list)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  '10minutemail.com',
  'temp-mail.org',
  'fakeinbox.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
]);

// Common role-based prefixes
const ROLE_BASED_PREFIXES = new Set([
  'admin',
  'administrator',
  'webmaster',
  'hostmaster',
  'postmaster',
  'info',
  'support',
  'sales',
  'marketing',
  'abuse',
  'noreply',
  'no-reply',
  'mailer-daemon',
  'contact',
  'help',
  'service',
  'billing',
  'security',
]);

export interface EmailValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  email: string;
  localPart: string | null;
  domain: string | null;
}

export interface EmailValidationOptions {
  allowDisposable?: boolean;
  allowRoleBased?: boolean;
  maxLength?: number;
}

const DEFAULT_OPTIONS: Required<EmailValidationOptions> = {
  allowDisposable: true,
  allowRoleBased: true,
  maxLength: 254, // RFC 5321
};

/**
 * Validates an email address
 */
export function validateEmail(
  email: string,
  options: EmailValidationOptions = {}
): EmailValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Basic checks
  if (!normalizedEmail) {
    return {
      isValid: false,
      errors: ['Email address is required'],
      warnings: [],
      email: normalizedEmail,
      localPart: null,
      domain: null,
    };
  }

  if (normalizedEmail.length > opts.maxLength) {
    errors.push(`Email address exceeds maximum length of ${opts.maxLength} characters`);
  }

  // Check format
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    errors.push('Invalid email address format');
    return {
      isValid: false,
      errors,
      warnings,
      email: normalizedEmail,
      localPart: null,
      domain: null,
    };
  }

  // Split into local part and domain
  const atIndex = normalizedEmail.lastIndexOf('@');
  const localPart = normalizedEmail.substring(0, atIndex);
  const domain = normalizedEmail.substring(atIndex + 1);

  // Local part checks
  if (localPart.length > 64) {
    errors.push('Local part exceeds maximum length of 64 characters');
  }

  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    errors.push('Local part cannot start or end with a dot');
  }

  if (localPart.includes('..')) {
    errors.push('Local part cannot contain consecutive dots');
  }

  // Domain checks
  if (domain.length > 255) {
    errors.push('Domain exceeds maximum length of 255 characters');
  }

  if (domain.startsWith('-') || domain.endsWith('-')) {
    errors.push('Domain labels cannot start or end with a hyphen');
  }

  // Check for disposable domains
  if (!opts.allowDisposable && DISPOSABLE_DOMAINS.has(domain)) {
    errors.push('Disposable email addresses are not allowed');
  }

  // Check for role-based addresses
  const localPartPrefix = localPart.split(/[+.]/)[0] ?? '';
  if (!opts.allowRoleBased && ROLE_BASED_PREFIXES.has(localPartPrefix)) {
    warnings.push('Role-based email addresses may have lower deliverability');
  }

  // Additional warnings
  if (localPart.includes('+')) {
    warnings.push('Email contains a plus sign (sub-addressing)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    email: normalizedEmail,
    localPart,
    domain,
  };
}

/**
 * Quick check if an email is valid
 */
export function isValidEmail(email: string): boolean {
  return validateEmail(email).isValid;
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  const result = validateEmail(email);
  return result.domain;
}

/**
 * Normalize an email address
 * - Lowercase
 * - Trim whitespace
 * - Optionally remove sub-addressing (+ part)
 */
export function normalizeEmail(email: string, removeSubAddressing = false): string {
  let normalized = email.trim().toLowerCase();

  if (removeSubAddressing) {
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex > 0) {
      const localPart = normalized.substring(0, atIndex);
      const domain = normalized.substring(atIndex + 1);
      const plusIndex = localPart.indexOf('+');
      if (plusIndex > 0) {
        normalized = localPart.substring(0, plusIndex) + '@' + domain;
      }
    }
  }

  return normalized;
}

/**
 * Batch validate multiple email addresses
 */
export function validateEmails(
  emails: string[],
  options: EmailValidationOptions = {}
): Map<string, EmailValidationResult> {
  const results = new Map<string, EmailValidationResult>();

  for (const email of emails) {
    results.set(email, validateEmail(email, options));
  }

  return results;
}

/**
 * Check if a domain is disposable
 */
export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Check if an email is role-based
 */
export function isRoleBasedEmail(email: string): boolean {
  const result = validateEmail(email);
  if (!result.localPart) return false;

  const prefix = result.localPart.split(/[+.]/)[0] ?? '';
  return ROLE_BASED_PREFIXES.has(prefix);
}
