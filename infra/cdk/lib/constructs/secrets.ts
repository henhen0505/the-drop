import { Construct } from 'constructs';
import { SecretValue } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface SecretsConstructProps {
  envName: string;
}

/**
 * Application secrets, per architecture/cdk-stack.md's cost-corrected
 * design: SSM Parameter Store SecureString, NOT Secrets Manager
 * ($0.40/secret/month x 7 secrets would be the only non-free-tier cost).
 *
 * CloudFormation cannot create a SecureString parameter's *value*
 * directly (only String/StringList), so these parameters must be
 * pre-populated out of band before deploy, e.g.:
 *   aws ssm put-parameter --name /the-drop/dev/jwt-secret \
 *     --type SecureString --value "..."
 *
 * This construct only resolves references to them. Both helpers below
 * resolve at CloudFormation deploy time (dynamic references / template
 * parameters), so no live AWS SSM values are needed to run `cdk synth`.
 */
export class SecretsConstruct extends Construct {
  private readonly prefix: string;

  constructor(scope: Construct, id: string, props: SecretsConstructProps) {
    super(scope, id);
    this.prefix = `/the-drop/${props.envName}`;
  }

  /** Deploy-time resolved SecureString value (e.g. API keys, JWT secret). */
  secureValue(name: string, version = '1'): SecretValue {
    return SecretValue.ssmSecure(`${this.prefix}/${name}`, version);
  }

  /** Deploy-time resolved plain String parameter value (non-secret config). */
  stringValue(scope: Construct, id: string, name: string): string {
    return StringParameter.valueForStringParameter(scope, `${this.prefix}/${name}`);
  }

  parameterPath(name: string): string {
    return `${this.prefix}/${name}`;
  }
}
