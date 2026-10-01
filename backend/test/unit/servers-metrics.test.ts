import { describe, expect, it } from "vitest";

import { startOfTodayIstUtc, summarizeAccessLines } from "../../src/modules/admin/servers.metrics";

function line(opts: {
  time?: string;
  method?: string;
  path?: string;
  status?: number;
  size?: number;
  ua?: string;
  cf?: string;
}) {
  const time = opts.time ?? "01/Oct/2026:04:00:00 +0000";
  const method = opts.method ?? "GET";
  const path = opts.path ?? "/store";
  const status = opts.status ?? 200;
  const size = opts.size ?? 8000;
  const ua = opts.ua ?? "Mozilla/5.0";
  const cf = opts.cf ? ` cf=${opts.cf}` : "";
  return `1.2.3.4 - - [${time}] "${method} ${path} HTTP/1.1" ${status} ${size} "-" "${ua}"${cf}`;
}

describe("servers access summary", () => {
  const start = startOfTodayIstUtc(new Date("2026-10-01T12:00:00.000Z"));

  it("counts distinct shoppers only when the client address is present", () => {
    const summary = summarizeAccessLines(
      [
        line({ path: "/store", cf: "9.9.9.9" }),
        line({ path: "/product/bowl", cf: "9.9.9.9" }),
        line({ path: "/admin", cf: "8.8.8.8" }),
        line({ path: "/store", cf: "7.7.7.7" }),
        line({ path: "/store" })
      ],
      start
    );
    expect(summary.people).toBe(3);
    expect(summary.storefrontPeople).toBe(2);
    expect(summary.storefrontPageLoads).toBe(4);
  });

  it("keeps scanner probes out of the shopper failure count", () => {
    const summary = summarizeAccessLines(
      [
        line({ path: "/wp-login.php", status: 404, size: 150, ua: "Mozilla/5.0", cf: "1.1.1.1" }),
        line({ path: "/product/missing", status: 404, size: 4000, cf: "2.2.2.2" }),
        line({ path: "/", status: 502, size: 200, cf: "3.3.3.3" })
      ],
      start
    );
    expect(summary.scanner404).toBe(1);
    expect(summary.shopperHtml404).toBe(1);
    expect(summary.serverErrors).toBe(1);
    expect(summary.shopperFailedPeople).toBe(2);
    expect(summary.topShopper404).toEqual([{ path: "/product/missing", count: 1 }]);
  });

  it("leaves people empty when the log has no client address", () => {
    const summary = summarizeAccessLines([line({ path: "/store", status: 404, size: 3000 })], start);
    expect(summary.people).toBeNull();
    expect(summary.shopperHtml404).toBe(1);
  });
});
