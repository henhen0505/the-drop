import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sourceTypeEnum } from './enums';
import { users } from './users';

/**
 * Tracks admin actions for accountability. Not user-facing.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(), // "merge_events", "approve_submission", etc.
    targetType: text('target_type').notNull(), // "event", "submission", "artist"
    targetId: uuid('target_id').notNull(),
    details: jsonb('details'), // Action-specific context
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_log_admin').on(table.adminId, table.createdAt.desc()),
    index('idx_audit_log_target').on(table.targetType, table.targetId),
  ],
);

/**
 * Tracks last successful/failed sync per external source.
 */
export const syncStatus = pgTable('sync_status', {
  sourceType: sourceTypeEnum('source_type').primaryKey(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastError: text('last_error'),
  eventsSynced: integer('events_synced').notNull().default(0), // Count from last run
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
