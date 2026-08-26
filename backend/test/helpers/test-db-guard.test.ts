import { afterEach, describe, expect, it } from "vitest";

import {
  assertDestructiveTestCleanupAllowed,
  assertSafeTestDatabase,
  describeTestDatabaseGuard
} from "../helpers/test-db-guard";

describe("test database safety guard", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    process.env.NODE_ENV = "test";
    process.env.SARVEDA_TEST_DATABASE = "1";
  });

  it("passes for local test database with explicit SARVEDA_TEST_DATABASE=1", () => {
    process.env.NODE_ENV = "test";
    process.env.SARVEDA_TEST_DATABASE = "1";
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db?schema=public";

    expect(() => assertSafeTestDatabase()).not.toThrow();
    expect(() => assertDestructiveTestCleanupAllowed()).not.toThrow();

    const info = describeTestDatabaseGuard();
    expect(info.explicitTestFlag).toBe(true);
    expect(info.isLocalhost).toBe(true);
    expect(info.databaseName).toBe("sarveda_db");
  });

  it("aborts when NODE_ENV is not test", () => {
    process.env.NODE_ENV = "development";
    process.env.SARVEDA_TEST_DATABASE = "1";
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";

    expect(() => assertSafeTestDatabase()).toThrow(/NODE_ENV must be "test"/);
  });

  it("aborts for production RDS hostname even with SARVEDA_TEST_DATABASE=1", () => {
    process.env.NODE_ENV = "test";
    process.env.SARVEDA_TEST_DATABASE = "1";
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";

    expect(() => assertSafeTestDatabase()).toThrow(/forbidden marker/i);
  });

  it("aborts for staging Lightsail Postgres IP", () => {
    process.env.NODE_ENV = "test";
    process.env.SARVEDA_TEST_DATABASE = "1";
    process.env.DATABASE_URL = "postgresql://user:pass@13.204.112.165:5432/sarveda";

    expect(() => assertSafeTestDatabase()).toThrow(/forbidden marker/i);
  });

  it("aborts without explicit test identification flag", () => {
    process.env.NODE_ENV = "test";
    delete process.env.SARVEDA_TEST_DATABASE;
    delete process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";

    expect(() => assertSafeTestDatabase()).toThrow(/SARVEDA_TEST_DATABASE=1/);
    expect(() => assertDestructiveTestCleanupAllowed()).toThrow(/SARVEDA_TEST_DATABASE=1/);
  });
});
