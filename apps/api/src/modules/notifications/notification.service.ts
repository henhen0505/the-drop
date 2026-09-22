import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NotificationType } from '@the-drop/types';
import { db } from '../../db/client';
import { notifications } from '../../db/schema/notifications';
import { NotFoundError } from '../../utils/errors';
import { decodeTimestampIdCursor, encodeCursor, parseLimit } from '../../utils/pagination';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListNotificationsResult {
  data: NotificationItem[];
  cursor: string | null;
  unreadCount: number;
}

export async function listNotifications(
  userId: string,
  opts: ListNotificationsOptions,
): Promise<ListNotificationsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeTimestampIdCursor(opts.cursor, 'createdAt') : undefined;

  const conditions = [eq(notifications.userId, userId)];
  if (opts.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }
  if (cursorData) {
    conditions.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${cursorData.at}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const [rows, [unread]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const data: NotificationItem[] = page.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data as Record<string, unknown> | null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));

  const last = page[page.length - 1];
  const cursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  return { data, cursor, unreadCount: unread?.value ?? 0 };
}

export async function markRead(userId: string, id: string): Promise<{ id: string; readAt: Date }> {
  const readAt = new Date();
  const [updated] = await db
    .update(notifications)
    .set({ readAt })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (!updated) {
    throw new NotFoundError('Notification not found');
  }

  return { id: updated.id, readAt };
}

export async function markAllRead(userId: string): Promise<{ markedCount: number }> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return { markedCount: updated.length };
}
