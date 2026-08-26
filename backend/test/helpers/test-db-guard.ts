/**
 * Test database safety guard — aborts test runs unless the connected database
 * is positively identified as a dedicated test database.
 *
 * Required for any destructive test cleanup (TRUNCATE). See setup.ts which sets
 * SARVEDA_TEST_DATABASE=1 before tests run.
 */

/** Host/name fragments that must never be used for integration tests. */
const FORBIDDEN_DB_MARKERS = [
  "sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com", // production RDS
  "13.204.112.165", // Lightsail Postgres (staging)
  "13.206.192.106", // EC2 staging API host (block if present in URL)
  "sarveda.com",
  "sarveda-demo.xyz",
  "lightsail",
  "production",
  "railway.app"
];

function resolveDatabaseUrl(): string {
  return (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();
}

function parsePostgresDatabaseName(url: string): string {
  try {
    const normalized = url.replace(/^postgresql:/i, "http:").replace(/^postgres:/i, "http:");
    const parsed = new URL(normalized);
    return decodeURIComponent(parsed.pathname.replace(/^\//, "").split("?")[0] ?? "");
  } catch {
    const match = url.match(/\/([^/?]+)(?:\?|$)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  }
}

function isLocalHostUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("@db:") ||
    lower.includes("@postgres:")
  );
}

function hasExplicitTestIdentification(): boolean {
  return (
    process.env.SARVEDA_TEST_DATABASE === "1" ||
    process.env.SARVEDA_TEST_DATABASE === "true" ||
    Boolean(process.env.TEST_DATABASE_URL?.trim())
  );
}

function hasTestDatabaseName(dbName: string): boolean {
  const name = dbName.toLowerCase();
  return name.endsWith("_test") || name.includes("-test") || name === "sarveda_db_test";
}

/**
 * Abort unless NODE_ENV=test and the database URL is positively identified as test-only.
 */
export function assertSafeTestDatabase(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `Refusing to run tests: NODE_ENV must be "test" (got "${process.env.NODE_ENV ?? "undefined"}")`
    );
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL or TEST_DATABASE_URL must be set before connecting"
    );
  }

  const urlLower = url.toLowerCase();
  for (const marker of FORBIDDEN_DB_MARKERS) {
    if (urlLower.includes(marker.toLowerCase())) {
      throw new Error(
        `Refusing to run tests: database URL matches forbidden marker "${marker}" (production/staging)`
      );
    }
  }

  const remoteOverride =
    process.env.SARVEDA_TEST_DB_ALLOW === "1" || process.env.SARVEDA_TEST_DB_ALLOW === "true";

  if (remoteOverride) {
    // Even with override, forbidden markers above already blocked production/staging hosts.
    if (!hasExplicitTestIdentification()) {
      throw new Error(
        "Refusing to run tests: SARVEDA_TEST_DB_ALLOW requires SARVEDA_TEST_DATABASE=1 or TEST_DATABASE_URL"
      );
    }
    return;
  }

  if (!hasExplicitTestIdentification()) {
    throw new Error(
      "Refusing to run tests: set SARVEDA_TEST_DATABASE=1 (or TEST_DATABASE_URL) to confirm a dedicated test database"
    );
  }

  const dbName = parsePostgresDatabaseName(url);
  const local = isLocalHostUrl(urlLower);
  const testName = hasTestDatabaseName(dbName);

  if (!local && !testName) {
    throw new Error(
      `Refusing to run tests: remote database "${dbName || "unknown"}" is not explicitly named as test. ` +
        "Use TEST_DATABASE_URL, a *_test database name, or SARVEDA_TEST_DB_ALLOW=1 for intentional remote test DB."
    );
  }
}

/**
 * Gate for destructive test-only teardown (TRUNCATE). Re-validates guards immediately before cleanup.
 */
export function assertDestructiveTestCleanupAllowed(): void {
  assertSafeTestDatabase();

  if (process.env.NODE_ENV !== "test") {
    throw new Error("Destructive test cleanup refused: NODE_ENV is not test");
  }

  if (!hasExplicitTestIdentification()) {
    throw new Error(
      "Destructive test cleanup refused: SARVEDA_TEST_DATABASE=1 or TEST_DATABASE_URL required"
    );
  }
}

export function describeTestDatabaseGuard(): {
  nodeEnv: string;
  databaseName: string;
  explicitTestFlag: boolean;
  usesTestDatabaseUrl: boolean;
  isLocalhost: boolean;
} {
  const url = resolveDatabaseUrl();
  return {
    nodeEnv: process.env.NODE_ENV ?? "",
    databaseName: parsePostgresDatabaseName(url),
    explicitTestFlag: hasExplicitTestIdentification(),
    usesTestDatabaseUrl: Boolean(process.env.TEST_DATABASE_URL?.trim()),
    isLocalhost: isLocalHostUrl(url.toLowerCase())
  };
}
