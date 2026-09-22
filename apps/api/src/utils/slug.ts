/**
 * Generates a URL-safe slug from an arbitrary string.
 * "Knock2 at Brooklyn Mirage!" -> "knock2-at-brooklyn-mirage"
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD') // split accented characters into base + diacritic
    .replace(/[̀-ͯ]/g, '') // drop diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens

  if (slug.length === 0) {
    throw new Error('slugify: input produced an empty slug');
  }

  return slug;
}

/**
 * Appends a short random suffix to a slug to disambiguate collisions
 * (e.g. two venues both named "The Warehouse").
 */
export function slugifyWithSuffix(input: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugify(input)}-${suffix}`;
}
