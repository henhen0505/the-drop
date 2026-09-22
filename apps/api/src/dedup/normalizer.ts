export type TextType = 'title' | 'venue' | 'artist';

export interface NormalizeOptions {
  venueName?: string | null;
}

interface Rule {
  pattern: RegExp;
  replacement: string;
}

// architecture/dedup-engine.md Step 1. Rule lists are data so they can be tuned without touching the pipeline.
export const TITLE_FILLER_RULES: Rule[] = [
  { pattern: /\blive\s+at\b/g, replacement: ' ' },
  { pattern: /\bpresents\b/g, replacement: ' ' },
  { pattern: /\bfeaturing\b/g, replacement: ' ' },
  { pattern: /\bfeat\.?(?=\s|$)/g, replacement: ' ' },
  { pattern: /\bft\.?(?=\s|$)/g, replacement: ' ' },
  { pattern: /\bat\s+the\b/g, replacement: ' ' },
  { pattern: /@\s*the\b/g, replacement: ' ' },
  { pattern: /\bofficial\b/g, replacement: ' ' },
  { pattern: /\btour\b/g, replacement: ' ' },
  { pattern: /\bconcert\b/g, replacement: ' ' },
];

export const VENUE_SUFFIXES = new Set([
  'theater',
  'theatre',
  'arena',
  'center',
  'centre',
  'hall',
  'club',
  'lounge',
  'stadium',
  'amphitheater',
  'amphitheatre',
  'pavilion',
  'ballroom',
]);

const NON_ALNUM = /[^\p{L}\p{N}\s]/gu;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripNonAlnum(text: string): string {
  return collapse(text.replace(NON_ALNUM, ''));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVenue(text: string): string {
  const cleaned = stripNonAlnum(text.toLowerCase().replace(/^\s*the\s+/, ''));
  const tokens = cleaned.split(' ').filter(Boolean);
  while (tokens.length > 1 && VENUE_SUFFIXES.has(tokens[tokens.length - 1] as string)) {
    tokens.pop();
  }
  return tokens.join(' ');
}

function normalizeArtist(text: string): string {
  const lowered = text.toLowerCase().replace(/^\s*dj\s+(?=\S)/, '');
  return stripNonAlnum(lowered);
}

function stripVenueFromTitle(lowerTitle: string, venueName: string): string {
  const raw = venueName.toLowerCase().trim();
  const variants = [raw, raw.replace(/^the\s+/, '')]
    .filter((v) => v.length >= 3)
    .sort((a, b) => b.length - a.length);

  let result = lowerTitle;
  for (const variant of variants) {
    result = result.replace(new RegExp(escapeRegExp(variant), 'g'), ' ');
  }
  return result;
}

function normalizeTitle(text: string, venueName?: string | null): string {
  let result = text.toLowerCase();
  if (venueName) {
    result = stripVenueFromTitle(result, venueName);
  }
  for (const rule of TITLE_FILLER_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  result = stripNonAlnum(result);

  if (venueName) {
    const bareVenue = normalizeVenue(venueName);
    if (bareVenue.length >= 3) {
      result = collapse(result.replace(new RegExp(`\\b${escapeRegExp(bareVenue)}\\b`, 'g'), ' '));
    }
  }
  return result;
}

export function normalize(text: string, type: TextType, opts: NormalizeOptions = {}): string {
  switch (type) {
    case 'title':
      return normalizeTitle(text, opts.venueName);
    case 'venue':
      return normalizeVenue(text);
    case 'artist':
      return normalizeArtist(text);
  }
}
