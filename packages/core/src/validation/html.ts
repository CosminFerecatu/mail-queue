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

export interface HtmlContentAnalysis {
  sizeBytes: number;
  imageCount: number;
  linkCount: number;
  externalImageCount: number;
  imagesWithoutAlt: number;
  textContent: string;
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

// ============================================================================
// Shared Helper Functions
// ============================================================================

/**
 * Analyze HTML content and extract statistics
 */
export function analyzeHtmlContent(html: string): HtmlContentAnalysis {
  return {
    sizeBytes: new TextEncoder().encode(html).length,
    imageCount: countMatches(html, /<img\b/gi),
    linkCount: countMatches(html, /<a\b[^>]*href/gi),
    externalImageCount: countMatches(html, /<img[^>]+src\s*=\s*["']https?:\/\//gi),
    imagesWithoutAlt: countMatches(html, /<img(?![^>]*\balt\s*=)[^>]*>/gi),
    textContent: html.replace(/<[^>]+>/g, ' '),
  };
}

/**
 * Check if HTML content exceeds the maximum size
 * @returns Error message or null if valid
 */
export function checkContentSize(html: string, maxSize: number): string | null {
  const sizeBytes = new TextEncoder().encode(html).length;
  if (sizeBytes > maxSize) {
    return `HTML content exceeds maximum size of ${maxSize} bytes`;
  }
  return null;
}

/**
 * Detect dangerous HTML patterns (scripts, event handlers, etc.)
 * @returns Error message or null if no dangerous patterns found
 */
export function detectDangerousPatterns(html: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      return 'HTML contains potentially dangerous content (scripts, event handlers, etc.)';
    }
  }
  return null;
}

/**
 * Detect spam trigger phrases in HTML content
 * @returns Array of found trigger phrases
 */
export function detectSpamTriggers(html: string): string[] {
  const lowerHtml = html.toLowerCase();
  const foundTriggers: string[] = [];

  for (const trigger of SPAM_TRIGGERS) {
    if (lowerHtml.includes(trigger.toLowerCase())) {
      foundTriggers.push(trigger);
    }
  }

  return foundTriggers;
}

/**
 * Check for images missing alt attributes
 * @returns Warning message or null if all images have alt tags
 */
export function checkImageAccessibility(html: string): string | null {
  const imagesWithoutAlt = countMatches(html, /<img(?![^>]*\balt\s*=)[^>]*>/gi);
  if (imagesWithoutAlt > 0) {
    return `${imagesWithoutAlt} image(s) missing alt attribute, which may affect accessibility and deliverability`;
  }
  return null;
}

/**
 * Calculate the ratio of all-caps words in text content
 * @returns Ratio between 0 and 1
 */
export function calculateCapsRatio(textContent: string): number {
  const words = textContent.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return 0;

  const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  return capsWords.length / words.length;
}

/**
 * Check if email appears to be mostly images with little text
 * @returns Warning message or null if ratio is acceptable
 */
export function checkImageToTextRatio(imageCount: number, textContent: string): string | null {
  if (imageCount > 0 && textContent.trim().length < 100) {
    return 'Email appears to be mostly images with little text, which may affect deliverability';
  }
  return null;
}

// ============================================================================
// Main Validation Functions
// ============================================================================

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

  const analysis = analyzeHtmlContent(html);
  const hasPlainTextFallback = !!plainText && plainText.trim().length > 0;

  // Collect errors
  const sizeError = checkContentSize(html, opts.maxSizeBytes);
  if (sizeError) errors.push(sizeError);

  const dangerousError = detectDangerousPatterns(html);
  if (dangerousError) errors.push(dangerousError);

  // Collect warnings
  if (analysis.imageCount > opts.maxImages) {
    warnings.push(`HTML contains ${analysis.imageCount} images, which may trigger spam filters`);
  }
  if (analysis.linkCount > opts.maxLinks) {
    warnings.push(`HTML contains ${analysis.linkCount} links, which may trigger spam filters`);
  }
  if (opts.requirePlainText && !hasPlainTextFallback) {
    warnings.push('Email should have a plain text version for better deliverability');
  }
  if (opts.checkSpamTriggers) {
    const foundTriggers = detectSpamTriggers(html);
    if (foundTriggers.length > 3) {
      warnings.push(
        `HTML contains multiple spam trigger phrases: ${foundTriggers.slice(0, 5).join(', ')}`
      );
    }
  }

  const altWarning = checkImageAccessibility(html);
  if (altWarning) warnings.push(altWarning);

  if (calculateCapsRatio(analysis.textContent) > 0.3) {
    warnings.push('Email contains excessive uppercase text, which may trigger spam filters');
  }

  const ratioWarning = checkImageToTextRatio(analysis.imageCount, analysis.textContent);
  if (ratioWarning) warnings.push(ratioWarning);

  if (analysis.externalImageCount > 5) {
    warnings.push('Email contains many external images, consider using embedded images');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      sizeBytes: analysis.sizeBytes,
      imageCount: analysis.imageCount,
      linkCount: analysis.linkCount,
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

  const analysis = analyzeHtmlContent(html);

  // Check spam triggers (5 points each)
  const foundTriggers = detectSpamTriggers(html);
  score += foundTriggers.length * 5;

  // Check for excessive caps (15 points)
  if (calculateCapsRatio(analysis.textContent) > 0.3) {
    score += 15;
  }

  // Check for missing plain text (10 points)
  if (!plainText || plainText.trim().length === 0) {
    score += 10;
  }

  // Check for too many images (up to 20 points)
  if (analysis.imageCount > 10) {
    score += Math.min((analysis.imageCount - 10) * 2, 20);
  }

  // Check for too many links (up to 15 points)
  if (analysis.linkCount > 20) {
    score += Math.min(analysis.linkCount - 20, 15);
  }

  // Check for dangerous patterns (25 points)
  if (detectDangerousPatterns(html)) {
    score += 25;
  }

  return Math.min(score, 100);
}
