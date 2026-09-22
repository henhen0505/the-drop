import { describe, expect, it } from 'vitest';
import {
  createSubmissionSchema,
  mySubmissionsSchema,
} from '../../../../src/modules/submissions/submission.validation';

const IN_A_MONTH = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const VENUE_ID = '550e8400-e29b-41d4-a716-446655440000';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { eventTitle: 'Underground Warehouse Rave', eventStartsAt: IN_A_MONTH, venueNameRaw: 'The Lot', ...overrides };
}

describe('createSubmissionSchema', () => {
  it('accepts a minimal submission, turning the start time into a Date and defaulting artists to none', () => {
    const parsed = createSubmissionSchema.body.parse(body());

    expect(parsed.eventStartsAt).toBeInstanceOf(Date);
    expect(parsed.artistNames).toEqual([]);
    expect(parsed.venueNameRaw).toBe('The Lot');
  });

  it('accepts the full contract example', () => {
    const parsed = createSubmissionSchema.body.parse(
      body({
        venueId: VENUE_ID,
        venueAddressRaw: '140 Stewart Ave',
        artistNames: ['DJ Shadow', 'Bonobo'],
        description: 'All night.',
        posterImageUrl: 'https://example.com/poster.jpg',
        ticketUrl: 'https://example.com/tickets',
        sourceUrl: 'https://instagram.com/p/abc',
        ageRestriction: '21+',
      }),
    );

    expect(parsed.artistNames).toEqual(['DJ Shadow', 'Bonobo']);
    expect(parsed.ageRestriction).toBe('21+');
  });

  it('requires either a venueId or a free-text venue name', () => {
    const noVenue = { eventTitle: 'Rave', eventStartsAt: IN_A_MONTH };

    expect(createSubmissionSchema.body.safeParse(noVenue).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse({ ...noVenue, venueId: VENUE_ID }).success).toBe(true);
    expect(createSubmissionSchema.body.safeParse({ ...noVenue, venueNameRaw: 'The Lot' }).success).toBe(true);
    expect(createSubmissionSchema.body.safeParse({ ...noVenue, venueAddressRaw: '1 Main St' }).success).toBe(false);
  });

  it('requires an ISO 8601 start time with an offset that is in the future', () => {
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: '2030-11-15T22:00:00-05:00' })).success).toBe(true);
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: '2030-11-15T22:00:00Z' })).success).toBe(true);
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: '2030-11-15T22:00:00' })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: '2030-11-15' })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: 'next friday' })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ eventStartsAt: '2020-01-01T22:00:00Z' })).success).toBe(false);
  });

  it('trims and bounds the title', () => {
    expect(createSubmissionSchema.body.parse(body({ eventTitle: '  Rave  ' })).eventTitle).toBe('Rave');
    expect(createSubmissionSchema.body.safeParse(body({ eventTitle: '   ' })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ eventTitle: 'x'.repeat(201) })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ eventTitle: 'x'.repeat(200) })).success).toBe(true);
  });

  it('rejects blank artist names and more than 30 artists', () => {
    expect(createSubmissionSchema.body.safeParse(body({ artistNames: ['A', ' '] })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ artistNames: Array(31).fill('A') })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ artistNames: Array(30).fill('A') })).success).toBe(true);
  });

  it('only accepts http(s) URLs, since these end up as links other users click', () => {
    for (const field of ['posterImageUrl', 'ticketUrl', 'sourceUrl']) {
      expect(createSubmissionSchema.body.safeParse(body({ [field]: 'https://example.com' })).success).toBe(true);
      expect(createSubmissionSchema.body.safeParse(body({ [field]: 'javascript:alert(1)' })).success).toBe(false);
      expect(createSubmissionSchema.body.safeParse(body({ [field]: 'not a url' })).success).toBe(false);
    }
  });

  it('rejects a non-UUID venueId and an over-long description', () => {
    expect(createSubmissionSchema.body.safeParse(body({ venueId: 'nope' })).success).toBe(false);
    expect(createSubmissionSchema.body.safeParse(body({ description: 'x'.repeat(5001) })).success).toBe(false);
  });
});

describe('mySubmissionsSchema.query', () => {
  it('accepts no filters', () => {
    expect(mySubmissionsSchema.query.parse({})).toEqual({});
  });

  it('accepts a valid status and coerces the limit', () => {
    expect(mySubmissionsSchema.query.parse({ status: 'PENDING', limit: '5', cursor: 'abc' })).toEqual({
      status: 'PENDING',
      limit: 5,
      cursor: 'abc',
    });
  });

  it('rejects an unknown status and an out-of-range limit', () => {
    expect(mySubmissionsSchema.query.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(mySubmissionsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(mySubmissionsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});
