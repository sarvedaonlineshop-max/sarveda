import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  countWorkingDaysBetween
} from "../../src/modules/orders/return-sla.service";
import { buildReturnAnalyticsSummary } from "../../src/modules/orders/return-analytics.service";
import {
  getReturnPolicyConfig,
  setReturnPolicyConfig
} from "../../src/modules/orders/return-policy-config.service";

describe("Phase 5 config / SLA / analytics", () => {
  it("counts working days excluding weekends", () => {
    // Friday 2026-09-04 → Monday 2026-09-07 is 1 working day forward from Fri
    const fri = new Date("2026-09-04T10:00:00Z");
    const holidays = new Set<string>();
    const due = addWorkingDays(fri, 1, holidays);
    expect(due.toISOString().slice(0, 10)).toBe("2026-09-07");

    const mon = new Date("2026-09-07T10:00:00Z");
    expect(countWorkingDaysBetween(fri, mon, holidays)).toBe(1);
    expect(countWorkingDaysBetween(fri, addWorkingDays(fri, 5, holidays), holidays)).toBe(5);
  });

  it("audits return policy config changes", async () => {
    await setReturnPolicyConfig({
      key: "sla_refund_working_days",
      valueJson: 6,
      actorEmail: "admin@test.com"
    });
    const v = await getReturnPolicyConfig("sla_refund_working_days");
    expect(v).toBe(6);
    await setReturnPolicyConfig({
      key: "sla_refund_working_days",
      valueJson: 7,
      actorEmail: "admin@test.com"
    });
  });

  it("builds analytics summary with documented return-rate semantics", async () => {
    const summary = await buildReturnAnalyticsSummary({ lookbackDays: 30 });
    expect(summary.counts.requestsRaised.status).toBe("OK");
    expect(summary.returnRate.numerator).toContain("APPROVED");
    expect(summary.returnRate.denominator).toContain("qtyOrdered");
    expect(["OK", "DATA_NOT_AVAILABLE"]).toContain(summary.returnRate.status);
    expect(summary.netSarvedaLossNote).toBeTruthy();
  });
});
