import { describe, expect, it } from "vitest";

import { detailAccessLines, startOfTodayIstUtc, summarizeAccessLines } from "../../src/modules/admin/servers.metrics";

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
        line({ path: "/", status: 502, size: 200, cf: "3.3.3.3" }),
        line({ path: "/api/media/legacy-uploads/old.jpg", status: 500, size: 80, cf: "4.4.4.4" })
      ],
      start
    );
    expect(summary.scanner404).toBe(1);
    expect(summary.shopperHtml404).toBe(1);
    expect(summary.serverErrors).toBe(1);
    expect(summary.shopOutages).toBe(1);
    expect(summary.shopperFailedPeople).toBe(2);
    expect(summary.topShopper404).toEqual([{ path: "/product/missing", count: 1 }]);
  });

  it("groups unreachable requests a few minutes apart as one stop", () => {
    const summary = summarizeAccessLines(
      [
        line({ time: "01/Oct/2026:11:02:10 +0000", path: "/", status: 502 }),
        line({ time: "01/Oct/2026:11:05:20 +0000", path: "/store", status: 502 }),
        line({ time: "01/Oct/2026:11:24:40 +0000", path: "/", status: 503 }),
        line({ path: "/api/media/legacy-uploads/photo.jpg", status: 500 })
      ],
      start
    );
    expect(summary.serverErrors).toBe(3);
    expect(summary.shopOutages).toBe(2);
  });

  it("builds people, storefront, missing pages, and stop windows", () => {
    const detail = detailAccessLines(
      [
        line({
          time: "01/Oct/2026:12:00:00 +0000",
          path: "/store?utm_source=google&utm_medium=cpc",
          cf: "9.9.9.9"
        }),
        line({ time: "01/Oct/2026:12:05:00 +0000", path: "/product/ocean-drums", cf: "9.9.9.9" }),
        line({ time: "01/Oct/2026:12:06:00 +0000", method: "POST", path: "/api/cart/add", status: 200, cf: "9.9.9.9" }),
        line({ time: "01/Oct/2026:12:07:00 +0000", path: "/checkout", cf: "9.9.9.9" }),
        line({ time: "01/Oct/2026:12:08:00 +0000", path: "/order/confirmed", cf: "9.9.9.9" }),
        line({ time: "01/Oct/2026:12:10:00 +0000", path: "/course/yoga", cf: "8.8.8.8" }),
        line({ time: "01/Oct/2026:12:20:00 +0000", path: "/product/missing-bowl", status: 404, size: 4000, cf: "7.7.7.7" }),
        line({ time: "01/Oct/2026:13:00:00 +0000", path: "/", status: 502, cf: "6.6.6.6" }),
        line({ time: "01/Oct/2026:13:02:00 +0000", path: "/api/checkout", status: 502, cf: "6.6.6.6" })
      ],
      start
    );
    expect(detail.people.map((row) => row.ip).sort()).toEqual(["6.6.6.6", "7.7.7.7", "8.8.8.8", "9.9.9.9"]);
    const buyer = detail.storefront.find((row) => row.ip === "9.9.9.9");
    expect(buyer?.utm).toBe("google / cpc");
    expect(buyer?.products).toEqual(["ocean-drums"]);
    expect(buyer?.addedToCart).toBe(true);
    expect(buyer?.checkout).toBe(true);
    expect(buyer?.bought).toBe(true);
    expect(detail.people.find((row) => row.ip === "8.8.8.8")?.pages).toEqual(["Course"]);
    expect(detail.missing).toEqual([
      expect.objectContaining({ path: "/product/missing-bowl" })
    ]);
    expect(detail.outages).toHaveLength(1);
    expect(detail.outages[0]?.requests).toBe(2);
    expect(detail.outages[0]?.reason).toContain("shop was stopped");
    expect(detail.outages[0]?.reason).toContain("API was stopped");
  });

  it("leaves people empty when the log has no client address", () => {
    const summary = summarizeAccessLines([line({ path: "/store", status: 404, size: 3000 })], start);
    expect(summary.people).toBeNull();
    expect(summary.shopperHtml404).toBe(1);
  });
});
