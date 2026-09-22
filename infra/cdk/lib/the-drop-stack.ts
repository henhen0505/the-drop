import { Construct } from 'constructs';
import { Stack, type StackProps } from 'aws-cdk-lib';
import { NetworkConstruct } from './constructs/vpc';
import { SecretsConstruct } from './constructs/secrets';
import { DatabaseConstruct } from './constructs/database';
import { ApiConstruct } from './constructs/api';
import { FrontendConstruct } from './constructs/frontend';
import { JobsConstruct } from './constructs/jobs';

export interface TheDropStackProps extends StackProps {
  envName: 'dev' | 'prod';
}

/**
 * Single stack, parameterized by environment context
 * (`cdk deploy --context env=dev|prod`), per architecture/decisions.md #9
 * and cdk-stack.md. No nested stacks -- unnecessary complexity at this
 * scale.
 */
export class TheDropStack extends Stack {
  constructor(scope: Construct, id: string, props: TheDropStackProps) {
    super(scope, id, props);

    const { envName } = props;

    const network = new NetworkConstruct(this, 'Network', { envName });

    const secrets = new SecretsConstruct(this, 'Secrets', { envName });

    const database = new DatabaseConstruct(this, 'Database', {
      envName,
      vpc: network.vpc,
      securityGroup: network.databaseSecurityGroup,
      secrets,
    });

    const jobs = new JobsConstruct(this, 'Jobs', { envName });

    const api = new ApiConstruct(this, 'Api', {
      envName,
      vpc: network.vpc,
      securityGroup: network.apiSecurityGroup,
      database: database.instance,
      secrets,
      jobQueue: jobs.queue,
    });

    new FrontendConstruct(this, 'Frontend', {
      envName,
      apiEnvironment: api.environment,
    });
  }
}
