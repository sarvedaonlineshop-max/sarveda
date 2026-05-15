import { logger } from "./logger";

let initialized = false;

/** Optional Sentry — run `npm install @sentry/node` on the server and set SENTRY_DSN. */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/node") as {
      init: (opts: { dsn: string; environment?: string; tracesSampleRate?: number }) => void;
    };
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0
    });
    initialized = true;
    logger.info("sentry_initialized");
  } catch {
    logger.warn("sentry_skipped_run_npm_install_@sentry/node_when_using_SENTRY_DSN");
  }
}
