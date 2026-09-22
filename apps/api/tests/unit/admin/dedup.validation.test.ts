import { describe, expect, it } from 'vitest';
import {
  listCandidatesSchema,
  resolveCandidateSchema,
} from '../../../src/modules/admin/dedup.validation';

describe('listCandidatesSchema.query', () => {
  it('defaults the status filter to PENDING_REVIEW', () => {
    const result = listCandidatesSchema.query.parse({});
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('accepts other match statuses, a cursor and a numeric limit string', () => {
    const result = listCandidatesSchema.query.parse({ status: 'REJECTED', cursor: 'abc', limit: '20' });
    expect(result).toEqual({ status: 'REJECTED', cursor: 'abc', limit: 20 });
  });

  it('rejects unknown statuses and out-of-range limits', () => {
    expect(listCandidatesSchema.query.safeParse({ status: 'BOGUS' }).success).toBe(false);
    expect(listCandidatesSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(listCandidatesSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('resolveCandidateSchema', () => {
  it('accepts a UUID id and a merge or reject action', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(resolveCandidateSchema.params.safeParse({ id }).success).toBe(true);
    expect(resolveCandidateSchema.body.safeParse({ action: 'merge' }).success).toBe(true);
    expect(resolveCandidateSchema.body.safeParse({ action: 'reject' }).success).toBe(true);
  });

  it('rejects a non-UUID id, an unknown action, and a missing action', () => {
    expect(resolveCandidateSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
    expect(resolveCandidateSchema.body.safeParse({ action: 'skip' }).success).toBe(false);
    expect(resolveCandidateSchema.body.safeParse({}).success).toBe(false);
  });
});
