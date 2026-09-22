import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

/**
 * Fetches SecureString parameters under `prefix` from SSM Parameter Store
 * and writes them into process.env before config/index.ts's env schema is
 * validated (see server.ts's import ordering). Gated on the
 * SSM_PARAM_PREFIX env var, not NODE_ENV -- Elastic Beanstalk sets
 * NODE_ENV=development for both local dev and the AWS dev environment, so
 * NODE_ENV alone can't distinguish "running locally" from "running on EB".
 */
export async function loadSecretsFromSsm(prefix: string): Promise<void> {
  const client = new SSMClient({});
  const fetched: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const command = new GetParametersByPathCommand({
      Path: prefix,
      WithDecryption: true,
      NextToken: nextToken,
    });
    const response = await client.send(command);

    for (const param of response.Parameters ?? []) {
      if (param.Name && param.Value) {
        const slug = param.Name.split('/').pop()!;
        const envKey = slug.toUpperCase().replace(/-/g, '_');
        fetched[envKey] = param.Value;
        process.env[envKey] = param.Value;
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  // Construct DATABASE_URL from individual EB env vars + SSM-fetched password
  if (fetched.DB_PASSWORD && process.env.DB_HOST) {
    process.env.DATABASE_URL =
      `postgresql://${process.env.DB_USER}:${fetched.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  }
}
