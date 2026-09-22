import { eq, inArray } from 'drizzle-orm';
import type { UserRole } from '@the-drop/types';
import { db } from '../../db/client';
import { users } from '../../db/schema/users';
import { genres } from '../../db/schema/genres';
import { userGenrePreferences } from '../../db/schema/user-event-states';
import { notificationPreferences } from '../../db/schema/notifications';
import { lookupCityCoordinates } from '../../data/us-city-centroids';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type {
  setGenrePreferencesSchema,
  updateNotificationPrefsSchema,
  updateProfileSchema,
} from './user.validation';
import type { z } from 'zod';

type UserRow = typeof users.$inferSelect;
type NotificationPrefsRow = typeof notificationPreferences.$inferSelect;

export type UpdateProfileInput = z.infer<typeof updateProfileSchema.body>;
export type SetGenrePreferencesInput = z.infer<typeof setGenrePreferencesSchema.body>['genreIds'];
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema.body>;

export interface ProfileResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  preferredCity: string | null;
  preferredState: string | null;
  travelRadiusKm: number | null;
  priceMin: number | null;
  priceMax: number | null;
  emailVerified: boolean;
  createdAt: Date;
}

export interface GenrePreference {
  id: string;
  name: string;
  slug: string;
}

export interface NotificationPrefsResponse {
  eventTomorrow: boolean;
  eventCancelled: boolean;
  eventRescheduled: boolean;
  artistNewEvent: boolean;
  submissionUpdates: boolean;
}

function toProfileResponse(user: UserRow): ProfileResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    preferredCity: user.preferredCity,
    preferredState: user.preferredState,
    travelRadiusKm: user.travelRadiusKm,
    priceMin: user.priceMinCents,
    priceMax: user.priceMaxCents,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

function toNotificationPrefsResponse(row: NotificationPrefsRow): NotificationPrefsResponse {
  return {
    eventTomorrow: row.eventTomorrow,
    eventCancelled: row.eventCancelled,
    eventRescheduled: row.eventRescheduled,
    artistNewEvent: row.artistNewEvent,
    submissionUpdates: row.submissionUpdates,
  };
}

/** Maps the API's priceMin/priceMax naming onto the DB's *Cents columns. */
function toUserUpdateColumns(data: UpdateProfileInput): Partial<typeof users.$inferInsert> {
  const columns: Partial<typeof users.$inferInsert> = {};
  if (data.displayName !== undefined) columns.displayName = data.displayName;
  if (data.avatarUrl !== undefined) columns.avatarUrl = data.avatarUrl;
  if (data.preferredCity !== undefined) columns.preferredCity = data.preferredCity;
  if (data.preferredState !== undefined) columns.preferredState = data.preferredState;
  if (data.travelRadiusKm !== undefined) columns.travelRadiusKm = data.travelRadiusKm;
  if (data.priceMin !== undefined) columns.priceMinCents = data.priceMin;
  if (data.priceMax !== undefined) columns.priceMaxCents = data.priceMax;
  return columns;
}

export async function getProfile(userId: string): Promise<ProfileResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toProfileResponse(user);
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileInput,
): Promise<ProfileResponse> {
  const columns = toUserUpdateColumns(data);

  if (data.preferredCity !== undefined || data.preferredState !== undefined) {
    const [existing] = await db
      .select({ preferredCity: users.preferredCity, preferredState: users.preferredState })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    // A city-only (or state-only) update still needs the other half of the pair to do a
    // useful lookup, so fall back to the already-stored value for whichever side wasn't sent.
    const city = data.preferredCity !== undefined ? data.preferredCity : existing.preferredCity;
    const state = data.preferredState !== undefined ? data.preferredState : existing.preferredState;
    const resolved = city && state ? lookupCityCoordinates(city, state) : null;
    columns.preferredLatitude = resolved?.latitude ?? null;
    columns.preferredLongitude = resolved?.longitude ?? null;
  }

  if (Object.keys(columns).length === 0) {
    return getProfile(userId);
  }

  const [user] = await db
    .update(users)
    .set({ ...columns, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toProfileResponse(user);
}

export async function getGenrePreferences(userId: string): Promise<GenrePreference[]> {
  return db
    .select({ id: genres.id, name: genres.name, slug: genres.slug })
    .from(genres)
    .innerJoin(userGenrePreferences, eq(userGenrePreferences.genreId, genres.id))
    .where(eq(userGenrePreferences.userId, userId));
}

export async function setGenrePreferences(
  userId: string,
  genreIds: SetGenrePreferencesInput,
): Promise<GenrePreference[]> {
  return db.transaction(async (tx) => {
    const existingGenres = await tx
      .select({ id: genres.id })
      .from(genres)
      .where(inArray(genres.id, genreIds));
    if (existingGenres.length !== genreIds.length) {
      throw new ValidationError('One or more genre IDs are invalid');
    }

    await tx.delete(userGenrePreferences).where(eq(userGenrePreferences.userId, userId));

    if (genreIds.length > 0) {
      await tx
        .insert(userGenrePreferences)
        .values(genreIds.map((genreId) => ({ userId, genreId })));
    }

    return tx
      .select({ id: genres.id, name: genres.name, slug: genres.slug })
      .from(genres)
      .innerJoin(userGenrePreferences, eq(userGenrePreferences.genreId, genres.id))
      .where(eq(userGenrePreferences.userId, userId));
  });
}

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPrefsResponse> {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  if (existing) {
    return toNotificationPrefsResponse(existing);
  }

  const [created] = await db.insert(notificationPreferences).values({ userId }).returning();
  if (!created) {
    throw new Error('Failed to create notification preferences');
  }
  return toNotificationPrefsResponse(created);
}

export async function updateNotificationPreferences(
  userId: string,
  data: UpdateNotificationPrefsInput,
): Promise<NotificationPrefsResponse> {
  const [row] = await db
    .insert(notificationPreferences)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to update notification preferences');
  }
  return toNotificationPrefsResponse(row);
}
