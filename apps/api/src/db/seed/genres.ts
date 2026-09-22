import { eq } from 'drizzle-orm';
import { db, pool } from '../client';
import { genres } from '../schema/genres';
import { GENRE_TREE } from './genre-data';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function insertChildren(childNames: string[], parentId: string): Promise<void> {
  for (const childName of childNames) {
    await db
      .insert(genres)
      .values({ name: childName, slug: slugify(childName), parentId })
      .onConflictDoNothing();
  }
}

async function seed(): Promise<void> {
  console.log('Seeding genres...');

  for (const genre of GENRE_TREE) {
    const [parent] = await db
      .insert(genres)
      .values({ name: genre.name, slug: slugify(genre.name) })
      .onConflictDoNothing()
      .returning();

    let parentId = parent?.id;
    if (!parentId) {
      // Already exists from a prior run -- look it up so children still
      // get linked (this script is idempotent and re-runnable).
      const [existing] = await db
        .select({ id: genres.id })
        .from(genres)
        .where(eq(genres.slug, slugify(genre.name)));
      if (!existing) continue;
      parentId = existing.id;
    }

    await insertChildren(genre.children ?? [], parentId);
  }

  console.log('Genre seed complete.');
  await pool.end();
}

seed().catch((err: unknown) => {
  console.error('Genre seed failed:', err);
  process.exit(1);
});
