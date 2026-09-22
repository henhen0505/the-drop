import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import type { Logger } from 'pino';
import { handleEventSyncTicketmaster } from './handlers/event-sync-ticketmaster';
import { handleArtistRefresh } from './handlers/artist-refresh';
import { handleStaleDetection } from './handlers/stale-detection';
import { handleNotificationDispatch } from './handlers/notification-dispatch';

export interface JobMessage {
  jobType: string;
  scheduledAt: string;
}

export type JobHandler = (message: JobMessage) => Promise<void>;

// jobType strings must match infra/cdk/lib/constructs/jobs.ts's ScheduledJob entries exactly.
const handlers: Record<string, JobHandler> = {
  'event-sync-ticketmaster': handleEventSyncTicketmaster,
  'artist-refresh': handleArtistRefresh,
  'stale-detection': handleStaleDetection,
  'notification-dispatch': handleNotificationDispatch,
};

/**
 * Serial long-polling SQS consumer. One message at a time (no concurrency
 * bugs to reason about), 20s long polling (free, avoids empty-receive
 * churn). Handlers that throw leave the message on the queue -- its
 * visibility timeout expires and SQS redelivers, up to maxReceiveCount,
 * after which it moves to the dead-letter queue (see infra/cdk jobs.ts).
 */
export function startPoller(queueUrl: string, logger: Logger): void {
  const client = new SQSClient({});
  let running = true;

  async function poll(): Promise<void> {
    while (running) {
      try {
        const response = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 20,
            MaxNumberOfMessages: 1,
          }),
        );

        for (const msg of response.Messages ?? []) {
          if (!msg.Body || !msg.ReceiptHandle) continue;

          let parsed: JobMessage;
          try {
            parsed = JSON.parse(msg.Body) as JobMessage;
          } catch {
            logger.warn({ body: msg.Body }, 'SQS message has invalid JSON, deleting');
            await deleteMessage(client, queueUrl, msg.ReceiptHandle);
            continue;
          }

          const handler = handlers[parsed.jobType];
          if (!handler) {
            logger.warn({ jobType: parsed.jobType }, 'No handler registered, deleting message');
            await deleteMessage(client, queueUrl, msg.ReceiptHandle);
            continue;
          }

          try {
            await handler(parsed);
            await deleteMessage(client, queueUrl, msg.ReceiptHandle);
            logger.info({ jobType: parsed.jobType }, 'Job completed');
          } catch (err) {
            logger.error({ jobType: parsed.jobType, err }, 'Job failed, leaving for retry');
            // Don't delete -- visibility timeout expires and SQS redelivers
          }
        }
      } catch (err) {
        logger.error({ err }, 'SQS poll error, backing off');
        await sleep(5000);
      }
    }
  }

  poll().catch((err) => {
    logger.fatal({ err }, 'SQS poller crashed');
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    running = false;
  });
}

async function deleteMessage(
  client: SQSClient,
  queueUrl: string,
  receiptHandle: string,
): Promise<void> {
  await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
