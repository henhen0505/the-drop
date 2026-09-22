import { pgEnum } from 'drizzle-orm/pg-core';
import {
  USER_ROLES,
  CONFIDENCE_LEVELS,
  EVENT_STATUSES,
  SOURCE_TYPES,
  USER_EVENT_STATES,
  VENDOR_CLASSIFICATIONS,
  SUBMISSION_STATUSES,
  NOTIFICATION_TYPES,
  DEDUP_MATCH_STATUSES,
} from '@the-drop/types';

/**
 * Postgres enum definitions, one per CREATE TYPE in architecture/schema.sql.
 * Values are sourced from @the-drop/types so the DB schema and the shared
 * TypeScript unions can never drift apart.
 */
export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const confidenceLevelEnum = pgEnum('confidence_level', CONFIDENCE_LEVELS);
export const eventStatusEnum = pgEnum('event_status', EVENT_STATUSES);
export const sourceTypeEnum = pgEnum('source_type', SOURCE_TYPES);
export const userEventStateEnum = pgEnum('user_event_state', USER_EVENT_STATES);
export const vendorClassificationEnum = pgEnum('vendor_classification', VENDOR_CLASSIFICATIONS);
export const submissionStatusEnum = pgEnum('submission_status', SUBMISSION_STATUSES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const dedupMatchStatusEnum = pgEnum('dedup_match_status', DEDUP_MATCH_STATUSES);
