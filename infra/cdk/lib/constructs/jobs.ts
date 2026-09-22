import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface JobsConstructProps {
  envName: string;
}

interface ScheduledJob {
  id: string;
  jobType: string;
  schedule: events.Schedule;
}

/**
 * EventBridge scheduled rules -> SQS queue -> API process poller
 * (apps/api/src/jobs/poller.ts), per architecture/decisions.md #12.
 *
 * Replaces the earlier EventBridge Connection + API Destination design:
 * that approach forced AWS to provision its own Secrets Manager secret
 * internally to hold the shared-secret header value (~$0.40/month,
 * unavoidable even with an SSM-sourced value -- see git history on this
 * file for the prior writeup). SQS needs no cross-service credentials at
 * all -- the EB instance role is granted consume access via IAM
 * (api.ts), and EventBridge is granted send access to the queue
 * automatically by `targets.SqsQueue()`.
 *
 * Failed jobs are retried by SQS up to maxReceiveCount times (visibility
 * timeout expiry causes redelivery), then move to the dead-letter queue
 * for manual inspection.
 */
export class JobsConstruct extends Construct {
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: JobsConstructProps) {
    super(scope, id);

    this.deadLetterQueue = new sqs.Queue(this, 'JobsDeadLetterQueue', {
      queueName: `the-drop-jobs-dlq-${props.envName}`,
      retentionPeriod: Duration.days(14),
    });

    this.queue = new sqs.Queue(this, 'JobsQueue', {
      queueName: `the-drop-jobs-${props.envName}`,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    const jobs: ScheduledJob[] = [
      {
        id: 'EventSyncTicketmaster',
        jobType: 'event-sync-ticketmaster',
        schedule: events.Schedule.rate(Duration.hours(6)),
      },
      {
        id: 'ArtistRefresh',
        jobType: 'artist-refresh',
        // Weekly, Sunday 4am UTC
        schedule: events.Schedule.cron({ weekDay: 'SUN', hour: '4', minute: '0' }),
      },
      {
        id: 'StaleDetection',
        jobType: 'stale-detection',
        // Daily, 6am UTC
        schedule: events.Schedule.cron({ hour: '6', minute: '0' }),
      },
      {
        id: 'NotificationDispatch',
        jobType: 'notification-dispatch',
        schedule: events.Schedule.rate(Duration.minutes(15)),
      },
    ];

    for (const job of jobs) {
      new events.Rule(this, `${job.id}Rule`, {
        ruleName: `the-drop-${props.envName}-${job.id.toLowerCase()}`,
        schedule: job.schedule,
        targets: [
          new targets.SqsQueue(this.queue, {
            message: events.RuleTargetInput.fromObject({
              jobType: job.jobType,
              scheduledAt: events.EventField.time,
            }),
          }),
        ],
      });
    }
  }
}
