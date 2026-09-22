import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/db/client', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { listGenreTree } from '../../../../src/modules/genres/genre.service';
import { db } from '../../../../src/db/client';

interface Row {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

function row(id: string, name: string, parentId: string | null = null): Row {
  return { id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), parentId };
}

function mockRows(rows: Row[]): void {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockResolvedValue(rows),
  } as never);
}

describe('listGenreTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty tree when there are no genres', async () => {
    mockRows([]);
    expect(await listGenreTree()).toEqual([]);
  });

  it('nests children under their parent and gives leaves an empty children array', async () => {
    mockRows([row('g1', 'House'), row('g2', 'Deep House', 'g1'), row('g3', 'Techno')]);

    const tree = await listGenreTree();

    expect(tree).toEqual([
      {
        id: 'g1',
        name: 'House',
        slug: 'house',
        children: [{ id: 'g2', name: 'Deep House', slug: 'deep-house', children: [] }],
      },
      { id: 'g3', name: 'Techno', slug: 'techno', children: [] },
    ]);
  });

  it('nests several levels deep', async () => {
    mockRows([row('g1', 'Bass'), row('g2', 'Dubstep', 'g1'), row('g3', 'Riddim', 'g2')]);

    const tree = await listGenreTree();

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.children[0]).toEqual({
      id: 'g3',
      name: 'Riddim',
      slug: 'riddim',
      children: [],
    });
  });

  it('sorts roots and children by name at every level regardless of input order', async () => {
    mockRows([
      row('g5', 'Trance'),
      row('g3', 'Progressive House', 'g1'),
      row('g1', 'House'),
      row('g4', 'Acid House', 'g1'),
      row('g2', 'Bass'),
      row('g6', 'Deep House', 'g1'),
    ]);

    const tree = await listGenreTree();

    expect(tree.map((n) => n.name)).toEqual(['Bass', 'House', 'Trance']);
    const house = tree.find((n) => n.name === 'House');
    expect(house?.children.map((n) => n.name)).toEqual([
      'Acid House',
      'Deep House',
      'Progressive House',
    ]);
  });

  it('treats a genre whose parent is missing as a root', async () => {
    mockRows([row('g1', 'House'), row('g2', 'Orphan', 'missing-parent')]);

    const tree = await listGenreTree();

    expect(tree.map((n) => n.name)).toEqual(['House', 'Orphan']);
    expect(tree[1]?.children).toEqual([]);
  });

  it('treats a genre that is its own parent as a root', async () => {
    mockRows([row('g1', 'Loop', 'g1')]);

    const tree = await listGenreTree();

    expect(tree).toEqual([{ id: 'g1', name: 'Loop', slug: 'loop', children: [] }]);
  });

  it('breaks a parent cycle without dropping nodes or producing a circular structure', async () => {
    mockRows([row('g1', 'Alpha', 'g2'), row('g2', 'Beta', 'g1'), row('g3', 'Gamma', 'g1')]);

    const tree = await listGenreTree();

    expect(() => JSON.stringify(tree)).not.toThrow();

    const names: string[] = [];
    const walk = (nodes: typeof tree): void => {
      for (const node of nodes) {
        names.push(node.name);
        walk(node.children);
      }
    };
    walk(tree);
    expect(names.sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('keeps unrelated healthy trees intact while breaking a cycle elsewhere', async () => {
    mockRows([
      row('g1', 'House'),
      row('g2', 'Deep House', 'g1'),
      row('g3', 'Ping', 'g4'),
      row('g4', 'Pong', 'g3'),
    ]);

    const tree = await listGenreTree();

    const house = tree.find((n) => n.name === 'House');
    expect(house?.children.map((n) => n.name)).toEqual(['Deep House']);
    expect(tree.map((n) => n.name).sort()).toEqual(['House', 'Ping']);
    expect(tree.find((n) => n.name === 'Ping')?.children.map((n) => n.name)).toEqual(['Pong']);
  });
});
