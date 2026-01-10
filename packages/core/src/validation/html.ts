/**
 * HTML content validation for emails
 * Checks for common issues that could affect deliverability
 */

export interface HtmlValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    sizeBytes: number;
    imageCount: number;
    linkCount: number;
    hasPlainTextFallback: boolean;
  };
}

export interface HtmlValidationOptions {
  maxSizeBytes?: number;
  maxImages?: number;
  maxLinks?: number;
  requirePlainText?: boolean;
  checkSpamTriggers?: boolean;
}

const DEFAULT_OPTIONS: Required<HtmlValidationOptions> = {
  maxSizeBytes: 5_000_000, // 5MB
  maxImages: 50,
  maxLinks: 100,
  requirePlainText: false,
  checkSpamTriggers: true,
};

// Common spam trigger words/phrases (simplified list)
const SPAM_TRIGGERS = [
  'click here',
  'act now',
  'limited time',
  'free offer',
  'winner',
  'congratulations',
  'urgent',
  'make money',
  'no obligation',
  '100% free',
  'cash bonus',
  'credit card',
  'double your',
  'earn extra',
  'free gift',
  'guarantee',
  'incredible deal',
  'order now',
  'risk free',
  'special promotion',
];

// Dangerous HTML patterns
const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i, // onclick, onload, etc.
  /<iframe\b[^>]*>/i,
  /<object\b[^>]*>/i,
  /<embed\b[^>]*>/i,
  /<form\b[^>]*>/i,
  /expression\s*\(/i, // CSS expression
  /url\s*\(\s*["']?\s*javascript/i,
];

/**
 * Count occurrences of a pattern in a string
 */
function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Validate HTML content for email
 */
export function validateHtml(
  html: string,
  plainText: string | null,
  options: HtmlValidationOptions = {}
): HtmlValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];

  const sizeBytes = new TextEncoder().encode(html).length;
  const imageCount = countMatches(html, /<img\b/gi);
  const linkCount = countMatches(html, /<a\b[^>]*href/gi);
  const hasPlainTextFallback = !!plainText && plainText.trim().length > 0;

  // Size check
  if (sizeBytes > opts.maxSizeBytes) {
    errors.push(`HTML content exceeds maximum size of ${opts.maxSizeBytes} bytes`);
  }

  // Image count check
  if (imageCount > opts.maxImages) {
    warnings.push(`HTML contains ${imageCount} images, which may trigger spam filters`);
  }

  // Link count check
  if (linkCount > opts.maxLinks) {
    warnings.push(`HTML contains ${linkCount} links, which may trigger spam filters`);
  }

  // Plain text check
  if (opts.requirePlainText && !hasPlainTextFallback) {
    warnings.push('Email should have a plain text version for better deliverability');
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      errors.push('HTML contains potentially dangerous content (scripts, event handlers, etc.)');
      break;
    }
  }

  // Check for spam triggers
  if (opts.checkSpamTriggers) {
    const lowerHtml = html.toLowerCase();
    const foundTriggers: string[] = [];

    for (const trigger of SPAM_TRIGGERS) {
      if (lowerHtml.includes(trigger.toLowerCase())) {
        foundTriggers.push(trigger);
      }
    }

    if (foundTriggers.length > 3) {
      warnings.push(
        `HTML contains multiple spam trigger phrases: ${foundTriggers.slice(0, 5).join(', ')}`
      );
    }
  }

  // Check for missing alt attributes on images
  const imagesWithoutAlt = countMatches(html, /<img(?![^>]*\balt\s*=)[^>]*>/gi);
  if (imagesWithoutAlt > 0) {
    warnings.push(
      `${imagesWithoutAlt} image(s) missing alt attribute, which may affect accessibility and deliverability`
    );
  }

  // Check for all-caps text (excluding HTML tags)
  const textContent = html.replace(/<[^>]+>/g, ' ');
  const words = textContent.split(/\s+/).filter((w) => w.length > 3);
  const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  if (words.length > 0 && capsWords.length / words.length > 0.3) {
    warnings.push('Email contains excessive uppercase text, which may trigger spam filters');
  }

  // Check image-to-text ratio
  if (imageCount > 0 && textContent.trim().length < 100) {
    warnings.push(
      'Email appears to be mostly images with little text, which may affect deliverability'
    );
  }

  // Check for external images
  const externalImages = countMatches(html, /<img[^>]+src\s*=\s*["']https?:\/\//gi);
  if (externalImages > 5) {
    warnings.push('Email contains many external images, consider using embedded images');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      sizeBytes,
      imageCount,
      linkCount,
      hasPlainTextFallback,
    },
  };
}

/**
 * Quick check if HTML is valid
 */
export function isValidHtml(html: string): boolean {
  return validateHtml(html, null).isValid;
}

/**
 * Estimate spam score (0-100, higher = more likely spam)
 * This is a simplified heuristic, not a replacement for proper spam checking
 */
export function estimateSpamScore(html: string, plainText: string | null): number {
  let score = 0;
  const lowerHtml = html.toLowerCase();

  // Check spam triggers
  for (const trigger of SPAM_TRIGGERS) {
    if (lowerHtml.includes(trigger.toLowerCase())) {
      score += 5;
    }
  }

  // Check for excessive caps
  const textContent = html.replace(/<[^>]+>/g, ' ');
  const words = textContent.split(/\s+/).filter((w) => w.length > 3);
  const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  if (words.length > 0 && capsWords.length / words.length > 0.3) {
    score += 15;
  }

  // Check for missing plain text
  if (!plainText || plainText.trim().length === 0) {
    score += 10;
  }

  // Check for too many images
  const imageCount = countMatches(html, /<img\b/gi);
  if (imageCount > 10) {
    score += Math.min((imageCount - 10) * 2, 20);
  }

  // Check for too many links
  const linkCount = countMatches(html, /<a\b[^>]*href/gi);
  if (linkCount > 20) {
    score += Math.min(linkCount - 20, 15);
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      score += 25;
      break;
    }
  }

  return Math.min(score, 100);
}
