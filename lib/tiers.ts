// ============================================================================
// Conference Tier System
// ============================================================================

export type ConferenceTier = 'top' | 'notable' | 'niche';

// ============================================================================
// Tier Pattern Matching
// ============================================================================

const TOP_PATTERNS = [
  'neurips',
  'icml',
  'iclr',
  'cvpr',
  'acl ',  // trailing space to avoid matching "safecomp" etc.
  'emnlp',
  'ijcai',
  'aaai',
];

const NOTABLE_PATTERNS = [
  'facct',
  'colm',
  'aamas',
  'aies',
  'eaamo',
  'wcci',
  'safecomp',
];

/**
 * Assigns a tier to a conference based on its name.
 * Checks TOP_PATTERNS first, then NOTABLE_PATTERNS, defaults to 'niche'.
 */
export function assignTier(name: string): ConferenceTier {
  const lower = name.toLowerCase();

  // ACL needs special handling: match "acl " or "acl" at end of string,
  // but not as a substring of other words
  for (const pattern of TOP_PATTERNS) {
    if (pattern === 'acl ') {
      // Match "acl" as a word boundary: at start/end or surrounded by non-alpha
      if (/\bacl\b/i.test(name)) return 'top';
    } else if (lower.includes(pattern)) {
      return 'top';
    }
  }

  for (const pattern of NOTABLE_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'notable';
    }
  }

  return 'niche';
}

// ============================================================================
// Constants for UI and Validation
// ============================================================================

export const VALID_TIERS: ConferenceTier[] = ['top', 'notable', 'niche'];

/**
 * Returns the specific tier pattern key that a conference name matches,
 * or null if no known pattern matches. Used for deduplication — two names
 * that resolve to the same pattern key are likely the same conference.
 */
export function getTierPatternKey(name: string): string | null {
  const lower = name.toLowerCase();

  for (const pattern of TOP_PATTERNS) {
    if (pattern === 'acl ') {
      if (/\bacl\b/i.test(name)) return 'acl';
    } else if (lower.includes(pattern)) {
      return pattern;
    }
  }

  for (const pattern of NOTABLE_PATTERNS) {
    if (lower.includes(pattern)) {
      return pattern;
    }
  }

  return null;
}

export const TIER_OPTIONS = [
  { value: 'top' as const, label: 'Top', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'notable' as const, label: 'Notable', color: 'bg-sky-100 text-sky-800' },
  { value: 'niche' as const, label: 'Niche', color: 'bg-gray-100 text-gray-600' },
];
