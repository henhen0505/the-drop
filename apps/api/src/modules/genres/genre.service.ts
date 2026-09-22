import { db } from '../../db/client';
import { genres } from '../../db/schema/genres';

export interface GenreNode {
  id: string;
  name: string;
  slug: string;
  children: GenreNode[];
}

interface GenreRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

function buildGenreTree(rows: GenreRow[]): GenreNode[] {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const nodes = new Map<string, GenreNode>();
  for (const row of sorted) {
    nodes.set(row.id, { id: row.id, name: row.name, slug: row.slug, children: [] });
  }

  // A node whose parent is missing (or itself) is treated as a root.
  const parentOf = new Map<string, GenreNode>();
  const roots: GenreNode[] = [];
  for (const row of sorted) {
    const node = nodes.get(row.id)!;
    const parent = row.parentId && row.parentId !== row.id ? nodes.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
      parentOf.set(node.id, parent);
    } else {
      roots.push(node);
    }
  }

  const visited = new Set<string>();
  const markReachable = (root: GenreNode): void => {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      stack.push(...node.children);
    }
  };
  roots.forEach(markReachable);

  // Anything still unvisited sits on (or hangs off) a parentId cycle: detach it
  // from its parent and promote it to a root so nothing is dropped.
  for (const row of sorted) {
    if (visited.has(row.id)) continue;
    const node = nodes.get(row.id)!;
    const parent = parentOf.get(node.id);
    if (parent) {
      parent.children = parent.children.filter((child) => child.id !== node.id);
      parentOf.delete(node.id);
    }
    roots.push(node);
    markReachable(node);
  }

  return roots.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listGenreTree(): Promise<GenreNode[]> {
  const rows = await db
    .select({
      id: genres.id,
      name: genres.name,
      slug: genres.slug,
      parentId: genres.parentId,
    })
    .from(genres);

  return buildGenreTree(rows);
}
