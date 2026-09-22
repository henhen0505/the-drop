import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { isNotNull } from 'drizzle-orm';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'), // NULL for OAuth-only accounts
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    role: userRoleEnum('role').notNull().default('USER'),
    preferredCity: text('preferred_city'),
    preferredState: text('preferred_state'),
    // Resolved from preferredCity/preferredState via the static us-city-centroids
    // dataset; null when unset or unresolvable. Internal to the recommendation
    // engine, not part of the public profile contract.
    preferredLatitude: doublePrecision('preferred_latitude'),
    preferredLongitude: doublePrecision('preferred_longitude'),
    travelRadiusKm: integer('travel_radius_km').default(80), // Default ~50 miles
    priceMinCents: integer('price_min'), // Cents, nullable = no preference
    priceMaxCents: integer('price_max'), // Cents, nullable = no preference
    googleId: text('google_id').unique(), // Google OAuth subject ID
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_google_id').on(table.googleId).where(isNotNull(table.googleId)),
    index('idx_users_role').on(table.role),
  ],
);
