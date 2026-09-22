import {
  scanArtistNewEvent,
  scanEventCancelled,
  scanEventRescheduled,
  scanEventTomorrow,
  scanSubmissionUpdates,
} from '../../modules/notifications/notification-triggers';
import { logger } from '../../utils/logger';
import type { JobMessage } from '../poller';

export async function handleNotificationDispatch(_message: JobMessage): Promise<void> {
  const [eventTomorrow, eventCancelled, eventRescheduled, artistNewEvent, submissionUpdates] =
    await Promise.all([
      scanEventTomorrow(),
      scanEventCancelled(),
      scanEventRescheduled(),
      scanArtistNewEvent(),
      scanSubmissionUpdates(),
    ]);

  logger.info(
    { eventTomorrow, eventCancelled, eventRescheduled, artistNewEvent, submissionUpdates },
    'Notification dispatch job complete',
  );
}
