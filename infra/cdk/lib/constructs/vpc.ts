import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface NetworkConstructProps {
  envName: string;
}

/**
 * VPC with 2 AZs, public + private-isolated subnets, and NO NAT Gateway
 * (architecture/cdk-stack.md: NAT costs ~$32/month and breaks the $0
 * target). The EB instance lives in a public subnet (has a public IP, can
 * reach both external APIs and RDS). RDS lives in the private-isolated
 * subnets, reachable only via security group.
 */
export class NetworkConstruct extends Construct {
  readonly vpc: ec2.Vpc;
  readonly apiSecurityGroup: ec2.SecurityGroup;
  readonly databaseSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkConstructProps) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `the-drop-${props.envName}`,
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private-isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSecurityGroup', {
      vpc: this.vpc,
      description: 'Elastic Beanstalk API instance -- inbound HTTP/HTTPS from anywhere',
      allowAllOutbound: true,
    });
    this.apiSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from anywhere',
    );
    this.apiSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS from anywhere',
    );

    this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL -- inbound 5432 from the API security group only',
      allowAllOutbound: false,
    });
    this.databaseSecurityGroup.addIngressRule(
      this.apiSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from EB API instance',
    );
  }
}
