import { describe, expect, it } from 'vitest';
import { artists } from '../../../src/db/schema/artists';
import { eventArtists, events } from '../../../src/db/schema/events';
import { linkArtistsToEvent } from '../../../src/dedup/artist-linker';
import { createFakeTx, insertsInto, stepArg, updatesOf } from '../../helpers/fake-db';

describe('linkArtistsToEvent', () => {
  it('links existing artists, marks the first as headliner, and updates the artist count', async () => {
    const { tx, ops } = createFakeTx([
      [], // event has no lineup yet
      [{ id: 'a-1' }], // "Skrillex" exists
      [], // link insert
      [{ id: 'a-2' }], // "Fred again.." exists
    ]);

    await linkArtistsToEvent(tx, 'evt-1', ['Skrillex', 'Fred again..'], 'TICKETMASTER');

    const links = insertsInto(ops, eventArtists).map((op) => stepArg(op, 'values'));
    expect(links).toEqual([
      { eventId: 'evt-1', artistId: 'a-1', isHeadliner: true, sortOrder: 0 },
      { eventId: 'evt-1', artistId: 'a-2', isHeadliner: false, sortOrder: 1 },
    ]);
    expect(insertsInto(ops, artists)).toHaveLength(0);
    const [count] = updatesOf(ops, events);
    expect(stepArg(count!, 'set')).toEqual({ artistCount: 2 });
  });

  it('creates an UNVERIFIED stub for an artist we have never seen', async () => {
    const { tx, ops } = createFakeTx([
      [],
      [], // artist lookup: none
      [], // slug check: free
      [{ id: 'a-new' }], // stub insert
    ]);

    await linkArtistsToEvent(tx, 'evt-1', ['Brand New Act'], 'SEATGEEK');

    const [stub] = insertsInto(ops, artists);
    expect(stepArg(stub!, 'values')).toMatchObject({
      name: 'Brand New Act',
      slug: 'brand-new-act',
      primarySource: 'SEATGEEK',
      confidence: 'UNVERIFIED',
    });
    const [link] = insertsInto(ops, eventArtists);
    expect(stepArg(link!, 'values')).toMatchObject({ artistId: 'a-new', isHeadliner: true });
  });

  it('unions with the existing lineup: keeps it, appends only new artists, never headlines them', async () => {
    const { tx, ops } = createFakeTx([
      [{ artistId: 'a-1', sortOrder: 0 }], // existing lineup
      [{ id: 'a-1' }], // "Skrillex" already linked
      [{ id: 'a-2' }], // "Fred again.." exists but is new to this event
    ]);

    await linkArtistsToEvent(tx, 'evt-1', ['Skrillex', 'Fred again..'], 'SEATGEEK');

    const links = insertsInto(ops, eventArtists).map((op) => stepArg(op, 'values'));
    expect(links).toEqual([{ eventId: 'evt-1', artistId: 'a-2', isHeadliner: false, sortOrder: 1 }]);
    expect(stepArg(updatesOf(ops, events)[0]!, 'set')).toEqual({ artistCount: 2 });
  });

  it('skips duplicate and unusable names and leaves the count alone when nothing changes', async () => {
    const { tx, ops } = createFakeTx([[{ artistId: 'a-1', sortOrder: 0 }], [{ id: 'a-1' }]]);

    await linkArtistsToEvent(tx, 'evt-1', ['DJ Snake', 'snake', '???', ''], 'TICKETMASTER');

    expect(insertsInto(ops, eventArtists)).toHaveLength(0);
    expect(updatesOf(ops, events)).toHaveLength(0);
  });
});
