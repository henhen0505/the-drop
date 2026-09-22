#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { TheDropStack } from '../lib/the-drop-stack';

const app = new App();

const envName = app.node.tryGetContext('env') ?? 'dev';
if (envName !== 'dev' && envName !== 'prod') {
  throw new Error(`Invalid --context env=${envName}; expected "dev" or "prod"`);
}

// Deliberately environment-agnostic (no account/region): CDK falls back to
// CloudFormation pseudo-parameters (Fn::GetAZs, etc.) instead of doing
// account-specific lookups, so `cdk synth` works without live AWS
// credentials. Set CDK_DEFAULT_ACCOUNT/REGION (via `cdk bootstrap`) before
// an actual `cdk deploy`.
new TheDropStack(app, `TheDropStack-${envName}`, {
  envName,
  description: `The Drop -- ${envName} environment`,
});
