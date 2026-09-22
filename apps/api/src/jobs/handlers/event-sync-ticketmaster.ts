import { syncTicketmaster } from '../../modules/admin/sync.service';
import { logger } from '../../utils/logger';
import type { JobMessage } from '../poller';

/** syncTicketmaster already handles fetch/stage/dedup and its own sync_status upsert. */
export async function handleEventSyncTicketmaster(_message: JobMessage): Promise<void> {
  const result = await syncTicketmaster();
  logger.info(result, 'Ticketmaster sync job complete');
}
