import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NotificationType } from '@the-drop/types';
import { db } from '../../db/client';
import { artists } from '../../db/schema/artists';
import { eventArtists, events } from '../../db/schema/events';
import { notificationPreferences, notifications } from '../../db/schema/notifications';
import { communitySubmissions } from '../../db/schema/submissions';
import { userArtistFollows, userEventStates } from '../../db/schema/user-event-states';

// Every interval below is a hardcoded literal (e.g. interval '20 minutes'), never a ${} interpolation:
// a ${} placed inside a quoted SQL string literal becomes a bind placeholder INSIDE the quotes, which
// Postgres cannot parse as part of the literal. Same rule applies in stale-detection.ts / artist-refresh.ts.
const ACTIVE_USER_EVENT_STATES = ['INTERESTED', 'GOING', 'HAVE_TICKET'] as const;

interface Candidate {
  userId: string;
  entityId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
}

interface PreferenceRow {
  eventTomorrow: boolean;
  eventCancelled: boolean;
  eventRescheduled: boolean;
  artistNewEvent: boolean;
  submissionUpdates: boolean;
}

const DEFAULT_PREFERENCES: PreferenceRow = {
  eventTomorrow: true,
  eventCancelled: true,
  eventRescheduled: true,
  artistNewEvent: true,
  submissionUpdates: true,
};

async function fetchPreferenceMap(userIds: string[]): Promise<Map<string, PreferenceRow>> {
  const map = new Map<string, PreferenceRow>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      userId: notificationPreferences.userId,
      eventTomorrow: notificationPreferences.eventTomorrow,
      eventCancelled: notificationPreferences.eventCancelled,
      eventRescheduled: notificationPreferences.eventRescheduled,
      artistNewEvent: notificationPreferences.artistNewEvent,
      submissionUpdates: notificationPreferences.submissionUpdates,
    })
    .from(notificationPreferences)
    .where(inArray(notificationPreferences.userId, ids));

  for (const row of rows) {
    map.set(row.userId, {
      eventTomorrow: row.eventTomorrow,
      eventCancelled: row.eventCancelled,
      eventRescheduled: row.eventRescheduled,
      artistNewEvent: row.artistNewEvent,
      submissionUpdates: row.submissionUpdates,
    });
  }
  return map;
}

function preferenceFor(map: Map<string, PreferenceRow>, userId: string): PreferenceRow {
  return map.get(userId) ?? DEFAULT_PREFERENCES;
}

/** Dedupes candidates by (userId, entityId), keeping whichever one was encountered first. */
function dedupeByUserAndEntity<T extends { userId: string; entityId: string }>(
  candidates: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const candidate of candidates) {
    const key = `${candidate.userId}:${candidate.entityId}`;
    if (!byKey.has(key)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function entityIdExpr(entityKeyField: 'eventId' | 'submissionId') {
  return entityKeyField === 'eventId'
    ? sql<string>`${notifications.data} ->> 'eventId'`
    : sql<string>`${notifications.data} ->> 'submissionId'`;
}

/** One exclusion-set query per scan: existing notifications of this type for these candidate entities. */
async function filterAlreadyNotified<T extends { userId: string; entityId: string }>(
  type: NotificationType,
  candidates: T[],
  entityKeyField: 'eventId' | 'submissionId',
): Promise<T[]> {
  if (candidates.length === 0) return candidates;

  const ids = [...new Set(candidates.map((candidate) => candidate.entityId))];
  const idExpr = entityIdExpr(entityKeyField);
  const rows = await db
    .select({ userId: notifications.userId, entityId: idExpr })
    .from(notifications)
    .where(and(eq(notifications.type, type), inArray(idExpr, ids)));

  const alreadyNotified = new Set(rows.map((row) => `${row.userId}:${row.entityId}`));
  return candidates.filter(
    (candidate) => !alreadyNotified.has(`${candidate.userId}:${candidate.entityId}`),
  );
}

/**
 * EVENT_TOMORROW-only idempotency check: matches on (userId, eventId, eventDate) rather than
 * (userId, eventId) alone. Without the date, a rescheduled event's new "tomorrow" notification
 * is silently dropped because a notification for that (userId, eventId) pair already exists from
 * the original date -- see notification-triggers.test.ts for the reschedule regression case.
 */
async function filterAlreadyNotifiedForDate<T extends { userId: string; entityId: string; eventDate: string }>(
  candidates: T[],
): Promise<T[]> {
  if (candidates.length === 0) return candidates;

  const ids = [...new Set(candidates.map((candidate) => candidate.entityId))];
  const idExpr = entityIdExpr('eventId');
  const rows = await db
    .select({
      userId: notifications.userId,
      entityId: idExpr,
      eventDate: sql<string | null>`${notifications.data} ->> 'eventDate'`,
    })
    .from(notifications)
    .where(and(eq(notifications.type, 'EVENT_TOMORROW'), inArray(idExpr, ids)));

  const alreadyNotified = new Set(
    rows.map((row) => `${row.userId}:${row.entityId}:${row.eventDate ?? ''}`),
  );
  return candidates.filter(
    (candidate) => !alreadyNotified.has(`${candidate.userId}:${candidate.entityId}:${candidate.eventDate}`),
  );
}

async function insertNotifications(candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0;

  await db.insert(notifications).values(
    candidates.map((candidate) => ({
      userId: candidate.userId,
      type: candidate.type,
      title: candidate.title,
      body: candidate.body,
      data: candidate.data,
    })),
  );
  return candidates.length;
}

export async function scanEventTomorrow(): Promise<number> {
  const rows = await db
    .select({
      userId: userEventStates.userId,
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
    })
    .from(userEventStates)
    .innerJoin(events, eq(events.id, userEventStates.eventId))
    .where(
      and(
        inArray(userEventStates.state, ACTIVE_USER_EVENT_STATES),
        eq(events.status, 'PUBLISHED'),
        sql`${events.startsAt} between now() and now() + interval '25 hours'`,
      ),
    );

  const prefs = await fetchPreferenceMap(rows.map((row) => row.userId));
  const candidates = rows
    .filter((row) => preferenceFor(prefs, row.userId).eventTomorrow)
    .map((row) => {
      const eventDate = row.startsAt.toISOString().slice(0, 10);
      return {
        userId: row.userId,
        entityId: row.eventId,
        eventDate,
        type: 'EVENT_TOMORROW' as const,
        title: `${row.title} is tomorrow`,
        body: null,
        data: { eventId: row.eventId, eventDate },
      };
    });

  const filtered = await filterAlreadyNotifiedForDate(candidates);
  return insertNotifications(filtered);
}

export async function scanEventCancelled(): Promise<number> {
  const rows = await db
    .select({ userId: userEventStates.userId, eventId: events.id, title: events.title })
    .from(events)
    .innerJoin(userEventStates, eq(userEventStates.eventId, events.id))
    .where(
      and(
        eq(events.status, 'CANCELLED'),
        inArray(userEventStates.state, ACTIVE_USER_EVENT_STATES),
        sql`${events.updatedAt} >= now() - interval '20 minutes'`,
      ),
    );

  const prefs = await fetchPreferenceMap(rows.map((row) => row.userId));
  const candidates: Candidate[] = rows
    .filter((row) => preferenceFor(prefs, row.userId).eventCancelled)
    .map((row) => ({
      userId: row.userId,
      entityId: row.eventId,
      type: 'EVENT_CANCELLED',
      title: `${row.title} was cancelled`,
      body: null,
      data: { eventId: row.eventId },
    }));

  const filtered = await filterAlreadyNotified('EVENT_CANCELLED', candidates, 'eventId');
  return insertNotifications(filtered);
}

/**
 * Fires only off a PUBLISHED -> POSTPONED transition. updatedAt bumps on any field edit and the
 * schema stores no prior startsAt value, so a pure timing change on a still-PUBLISHED event cannot
 * be reliably distinguished from any other edit -- accepted gap, not solved this sprint.
 */
export async function scanEventRescheduled(): Promise<number> {
  const rows = await db
    .select({ userId: userEventStates.userId, eventId: events.id, title: events.title })
    .from(events)
    .innerJoin(userEventStates, eq(userEventStates.eventId, events.id))
    .where(
      and(
        eq(events.status, 'POSTPONED'),
        inArray(userEventStates.state, ACTIVE_USER_EVENT_STATES),
        sql`${events.updatedAt} >= now() - interval '20 minutes'`,
      ),
    );

  const prefs = await fetchPreferenceMap(rows.map((row) => row.userId));
  const candidates: Candidate[] = rows
    .filter((row) => preferenceFor(prefs, row.userId).eventRescheduled)
    .map((row) => ({
      userId: row.userId,
      entityId: row.eventId,
      type: 'EVENT_RESCHEDULED',
      title: `${row.title} was postponed`,
      body: null,
      data: { eventId: row.eventId },
    }));

  const filtered = await filterAlreadyNotified('EVENT_RESCHEDULED', candidates, 'eventId');
  return insertNotifications(filtered);
}

export async function scanArtistNewEvent(): Promise<number> {
  const rows = await db
    .select({
      userId: userArtistFollows.userId,
      eventId: events.id,
      eventTitle: events.title,
      artistId: artists.id,
      artistName: artists.name,
    })
    .from(eventArtists)
    .innerJoin(events, eq(events.id, eventArtists.eventId))
    .innerJoin(artists, eq(artists.id, eventArtists.artistId))
    .innerJoin(userArtistFollows, eq(userArtistFollows.artistId, eventArtists.artistId))
    .where(
      and(
        eq(events.status, 'PUBLISHED'),
        sql`${events.createdAt} >= now() - interval '20 minutes'`,
      ),
    );

  const prefs = await fetchPreferenceMap(rows.map((row) => row.userId));
  const candidates: Candidate[] = rows
    .filter((row) => preferenceFor(prefs, row.userId).artistNewEvent)
    .map((row) => ({
      userId: row.userId,
      entityId: row.eventId,
      type: 'ARTIST_NEW_EVENT',
      title: `${row.artistName} just announced ${row.eventTitle}`,
      body: null,
      data: { eventId: row.eventId, artistId: row.artistId },
    }));

  // A user following two artists on the same new event produces two join rows for that one
  // user+event pair. Both would pass the idempotency check in the same pass (neither notification
  // exists yet), so this dedup -- unlike the idempotency check, which only guards across runs --
  // is what prevents a real duplicate within a single scan. Picks whichever matching artist came first.
  const deduped = dedupeByUserAndEntity(candidates);
  const filtered = await filterAlreadyNotified('ARTIST_NEW_EVENT', deduped, 'eventId');
  return insertNotifications(filtered);
}

export async function scanSubmissionUpdates(): Promise<number> {
  const rows = await db
    .select({
      userId: communitySubmissions.submitterId,
      submissionId: communitySubmissions.id,
      status: communitySubmissions.status,
      eventTitle: communitySubmissions.eventTitle,
      mergedEventId: communitySubmissions.mergedEventId,
    })
    .from(communitySubmissions)
    .where(
      and(
        inArray(communitySubmissions.status, ['APPROVED', 'REJECTED', 'MERGED']),
        sql`${communitySubmissions.reviewedAt} >= now() - interval '20 minutes'`,
      ),
    );

  const prefs = await fetchPreferenceMap(rows.map((row) => row.userId));
  // Each row is a distinct submission (the primary key), so this naturally yields at most one row
  // per (userId, entityId) pair already -- no in-memory dedup needed here.
  const candidates: Candidate[] = rows
    .filter((row) => preferenceFor(prefs, row.userId).submissionUpdates)
    .map((row) => {
      const type: NotificationType =
        row.status === 'REJECTED' ? 'SUBMISSION_REJECTED' : 'SUBMISSION_APPROVED';
      const data = row.mergedEventId
        ? { submissionId: row.submissionId, eventId: row.mergedEventId }
        : { submissionId: row.submissionId };
      return {
        userId: row.userId,
        entityId: row.submissionId,
        type,
        title:
          type === 'SUBMISSION_REJECTED'
            ? `Your submission "${row.eventTitle}" was not approved`
            : `Your submission "${row.eventTitle}" is live`,
        body: null,
        data,
      };
    });

  const approved = candidates.filter((candidate) => candidate.type === 'SUBMISSION_APPROVED');
  const rejected = candidates.filter((candidate) => candidate.type === 'SUBMISSION_REJECTED');
  const [filteredApproved, filteredRejected] = await Promise.all([
    filterAlreadyNotified('SUBMISSION_APPROVED', approved, 'submissionId'),
    filterAlreadyNotified('SUBMISSION_REJECTED', rejected, 'submissionId'),
  ]);

  return insertNotifications([...filteredApproved, ...filteredRejected]);
}
