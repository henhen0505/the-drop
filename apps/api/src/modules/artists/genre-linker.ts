import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { genres } from '../../db/schema/genres';
import { artistGenres } from '../../db/schema/artists';

interface GenreRecord {
  id: string;
  name: string;
  slug: string;
}

let genreCache: GenreRecord[] | null = null;

export async function loadGenres(): Promise<GenreRecord[]> {
  if (genreCache) return genreCache;
  const rows = await db
    .select({ id: genres.id, name: genres.name, slug: genres.slug })
    .from(genres);
  genreCache = rows;
  return rows;
}

export function clearGenreCache(): void {
  genreCache = null;
}

function normalizeToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function matchGenres(externalTags: string[]): Promise<string[]> {
  if (externalTags.length === 0) return [];

  const allGenres = await loadGenres();
  if (allGenres.length === 0) return [];

  const matched = new Set<string>();

  for (const tag of externalTags) {
    const normalized = normalizeToSlug(tag);
    if (!normalized) continue;

    const exactSlug = allGenres.find((g) => g.slug === normalized);
    if (exactSlug) {
      matched.add(exactSlug.id);
      continue;
    }

    const nameMatch = allGenres.find(
      (g) => g.name.toLowerCase() === tag.toLowerCase().trim(),
    );
    if (nameMatch) {
      matched.add(nameMatch.id);
      continue;
    }

    let bestPartial: { id: string; len: number } | null = null;
    for (const g of allGenres) {
      if (normalized.includes(g.slug) || g.slug.includes(normalized)) {
        if (!bestPartial || g.slug.length > bestPartial.len) {
          bestPartial = { id: g.id, len: g.slug.length };
        }
      }
    }
    if (bestPartial) {
      matched.add(bestPartial.id);
    }
  }

  return Array.from(matched);
}

export async function linkArtistGenres(
  artistId: string,
  genreIds: string[],
): Promise<void> {
  if (genreIds.length === 0) return;

  await db.transaction(async (tx) => {
    await tx.delete(artistGenres).where(eq(artistGenres.artistId, artistId));
    await tx
      .insert(artistGenres)
      .values(genreIds.map((genreId) => ({ artistId, genreId })));
  });
}
