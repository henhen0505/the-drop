/**
 * No static imports of app-internal modules here. config/index.ts
 * validates process.env at module-load time, and utils/logger.ts
 * statically imports config -- so if either were imported at the top of
 * this file, they'd run before loadSecretsFromSsm has a chance to
 * populate process.env with SSM-fetched values (DB password, JWT
 * secret). Everything app-internal is loaded via dynamic import inside
 * main(), after secrets are in place.
 */
async function main(): Promise<void> {
  if (process.env.SSM_PARAM_PREFIX) {
    const { loadSecretsFromSsm } = await import('./config/secrets');
    await loadSecretsFromSsm(process.env.SSM_PARAM_PREFIX);
  }

  const { config } = await import('./config/index');
  const { logger } = await import('./utils/logger');
  const { createApp } = await import('./app');

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`The Drop API listening on port ${config.port} [${config.env}]`);
  });

  // Start SQS poller if queue URL is configured (AWS deployments only)
  if (process.env.SQS_QUEUE_URL) {
    const { startPoller } = await import('./jobs/poller');
    startPoller(process.env.SQS_QUEUE_URL, logger);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
