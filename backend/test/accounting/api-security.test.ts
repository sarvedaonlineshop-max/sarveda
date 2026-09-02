import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("accounting API security", () => {
  it("mounts accounting routes under admin router with requireAdmin", () => {
    const adminRoutesPath = path.resolve(__dirname, "../../src/modules/admin/admin.routes.ts");
    const source = readFileSync(adminRoutesPath, "utf8");

    expect(source).toContain('router.use(requireAdmin)');
    expect(source).toContain('router.use("/accounting", requireAccountingAccess, accountingAdminRoutes)');
    expect(source.indexOf('router.use(requireAdmin)')).toBeLessThan(
      source.indexOf('router.use("/accounting"')
    );
    expect(source).toContain("isAccountingEmailAllowed");
    expect(source).toContain("requireAccountingAccess");
  });

  it("enforces NATIVE_ACCOUNTING_ENABLED on mutating accounting data routes", () => {
    const routesPath = path.resolve(__dirname, "../../src/modules/accounting/accounting.routes.ts");
    const source = readFileSync(routesPath, "utf8");

    expect(source).toContain("isNativeAccountingEnabled");
    expect(source).toContain("ACCOUNTING_MODULE_DISABLED");
    expect(source).toContain('router.get("/status"');
    expect(source).toContain('router.post("/order-refunded-full/preview"');
    expect(source).toContain('router.post("/settlements/preview"');
    expect(source).toContain('router.post("/vendor-bills/preview"');
    expect(source).toContain('router.get("/reconciliation/v4"');
    expect(source).toContain('router.get("/reconciliation/v5"');
    expect(source).toContain('router.post("/vendor-payments/preview"');
    expect(source).toContain('router.post("/vendor-payments/post"');
    expect(source).toContain('router.post("/expenses/preview"');
    expect(source).toContain('router.post("/expenses/post"');
    expect(source).toContain('router.get("/reconciliation/v3"');
    expect(source).toContain('router.get("/reconciliation/v2"');
    expect(source).toContain('router.get("/reports/trial-balance"');
    expect(source).toContain('router.get("/reports/general-ledger"');
    expect(source).toContain('router.get("/reports/accounts"');
    expect(source).toContain('router.get("/reports/financial-year"');
    expect(source).toContain('router.get("/reports/profit-loss"');
    expect(source).toContain('router.get("/reports/balance-sheet"');
    expect(source).toContain('router.get("/reports/dashboard"');
  });

  it("does not expose accounting routes on public app paths", () => {
    const appPath = path.resolve(__dirname, "../../src/app.ts");
    const source = readFileSync(appPath, "utf8");

    expect(source).not.toContain("/accounting");
    expect(source).toContain('app.use("/api/admin"');
  });
});
