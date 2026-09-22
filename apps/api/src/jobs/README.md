# jobs/

Background job handlers, built in Sprint 7. Jobs run inside the API
process and are triggered via SQS messages from EventBridge scheduled
rules.

Architecture: EventBridge rules fire on schedule -> SQS queue -> API
process polls via long-polling (`poller.ts`) -> dispatches to handler
by `jobType`. Failed jobs retry up to 3 times (SQS maxReceiveCount),
then move to the dead-letter queue.

See architecture/decisions.md #12 and cdk-stack.md ("Scheduled Jobs").
