import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SecretsConstruct } from './secrets';

export interface ApiConstructProps {
  envName: string;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  secrets: SecretsConstruct;
  jobQueue: sqs.Queue;
}

/**
 * Elastic Beanstalk, single instance, Docker platform, t3.micro (free
 * tier). No load balancer -- see architecture/decisions.md #9/#11 (rolling
 * deploy, no blue/green). aws-cdk-lib has no L2 construct for Elastic
 * Beanstalk, so this uses the L1 CfnApplication/CfnEnvironment resources
 * directly, matching architecture/cdk-stack.md's resource map.
 *
 * Scheduled background jobs (EB cron + EventBridge, see decisions.md #12)
 * run inside this same instance/container -- there is no separate compute
 * resource for them.
 */
export class ApiConstruct extends Construct {
  readonly environment: elasticbeanstalk.CfnEnvironment;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const appName = `the-drop-api-${props.envName}`;

    const application = new elasticbeanstalk.CfnApplication(this, 'Application', {
      applicationName: appName,
    });

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkMulticontainerDocker'),
      ],
    });
    // Read-only access to this env's SSM secrets (jwt-secret, API keys),
    // scoped to the /the-drop/{env}/* path.
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        resources: [`arn:aws:ssm:*:*:parameter${props.secrets.parameterPath('*')}`],
      }),
    );

    props.jobQueue.grantConsumeMessages(instanceRole);

    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [instanceRole.roleName],
    });

    this.environment = new elasticbeanstalk.CfnEnvironment(this, 'Environment', {
      environmentName: `the-drop-api-${props.envName}`,
      applicationName: application.applicationName!,
      // Solution stack for single-container Docker on Amazon Linux 2023.
      // Verify the current stack name with `aws elasticbeanstalk
      // list-available-solution-stacks` before deploying -- these strings
      // are periodically retired by AWS.
      solutionStackName: '64bit Amazon Linux 2023 v4.3.4 running Docker',
      optionSettings: [
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: 't3.micro',
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: instanceProfile.ref,
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'VPCId',
          value: props.vpc.vpcId,
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'Subnets',
          value: props.vpc.publicSubnets.map((s) => s.subnetId).join(','),
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'AssociatePublicIpAddress',
          value: 'true',
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MinSize',
          value: '1',
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MaxSize',
          value: '1',
        },
        {
          namespace: 'aws:elasticbeanstalk:environment',
          optionName: 'EnvironmentType',
          value: 'SingleInstance', // no load balancer, per decisions.md #9
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'NODE_ENV',
          value: props.envName === 'prod' ? 'production' : 'development',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'PORT',
          value: '3000',
        },
        // Secret values are NOT resolved into environment variables here:
        // CloudFormation only permits {{resolve:ssm-secure:...}} dynamic
        // references in specific allow-listed resource properties, and
        // Elastic Beanstalk's OptionSettings.Value is not one of them.
        // Instead we pass the SSM parameter path prefix (SSM_PARAM_PREFIX
        // below); the app resolves the actual values at boot via the AWS
        // SDK (apps/api/src/config/secrets.ts), using the instance role's
        // ssm:GetParametersByPath grant above.
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_HOST',
          value: props.database.dbInstanceEndpointAddress,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_PORT',
          value: props.database.dbInstanceEndpointPort,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_NAME',
          value: 'thedrop',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_USER',
          value: 'thedrop_admin',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_PASSWORD_SSM_PARAM',
          value: props.secrets.parameterPath('db-password'),
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'JWT_SECRET_SSM_PARAM',
          value: props.secrets.parameterPath('jwt-secret'),
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'JOB_SECRET_SSM_PARAM',
          value: props.secrets.parameterPath('job-secret'),
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'SSM_PARAM_PREFIX',
          value: `/the-drop/${props.envName}`,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'SQS_QUEUE_URL',
          value: props.jobQueue.queueUrl,
        },
      ],
      // aws:elasticbeanstalk:environment:process:default -- health check
      // path is set via .ebextensions in the app bundle (Sprint 9), not
      // here, since it ships with the API source, not the infra stack.
    });
    this.environment.addDependency(application);
  }
}
