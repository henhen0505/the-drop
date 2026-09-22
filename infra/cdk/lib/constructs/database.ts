import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { SecretsConstruct } from './secrets';

export interface DatabaseConstructProps {
  envName: string;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  secrets: SecretsConstruct;
}

/**
 * RDS PostgreSQL, db.t3.micro (free tier), private-isolated subnets only.
 * Credentials come from an SSM SecureString (see secrets.ts), not RDS's
 * built-in Secrets Manager-backed credential generation, to hit the $0
 * cost target described in architecture/cdk-stack.md.
 */
export class DatabaseConstruct extends Construct {
  readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const isProd = props.envName === 'prod';

    this.instance = new rds.DatabaseInstance(this, 'Postgres', {
      instanceIdentifier: `the-drop-${props.envName}`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      credentials: rds.Credentials.fromPassword(
        'thedrop_admin',
        props.secrets.secureValue('db-password'),
      ),
      databaseName: 'thedrop',
      allocatedStorage: 20,
      maxAllocatedStorage: 20, // pin storage to stay within free tier
      multiAz: false,
      publiclyAccessible: false,
      storageEncrypted: true,
      backupRetention: Duration.days(isProd ? 7 : 1),
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
    });
  }
}
