import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';

export interface FrontendConstructProps {
  envName: string;
  apiEnvironment: elasticbeanstalk.CfnEnvironment;
}

/**
 * S3 (private, versioned, static site content) + CloudFront in front of
 * it. `/api/*` is forwarded to the Elastic Beanstalk endpoint so the SPA
 * and API share one origin from the browser's perspective. Price class
 * 100 (US/EU only) to stay within the 1TB/month free tier -- see
 * architecture/cdk-stack.md.
 *
 * Dev: CloudFront is skipped (direct EB access), per the environment
 * separation table in cdk-stack.md.
 */
export class FrontendConstruct extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution?: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendConstructProps) {
    super(scope, id);

    const isProd = props.envName === 'prod';

    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `the-drop-frontend-${props.envName}`.toLowerCase(),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    if (!isProd) {
      // Dev: no CloudFront distribution, per the environment table.
      return;
    }

    const apiOrigin = new origins.HttpOrigin(props.apiEnvironment.attrEndpointUrl, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, // EB SingleInstance has no TLS listener
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });
  }
}
