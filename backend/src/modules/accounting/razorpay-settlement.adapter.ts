/**
 * Read-only Razorpay settlements adapter.
 * Mutation methods are intentionally absent so tests can prove GET-only usage.
 */
import Razorpay from "razorpay";

import type {
  RazorpaySettlementHeader,
  RazorpaySettlementReconLine
} from "./settlement.types";

export type RazorpaySettlementReadClient = {
  listSettlements: (params?: {
    from?: number;
    to?: number;
    count?: number;
    skip?: number;
  }) => Promise<RazorpaySettlementHeader[]>;
  fetchSettlement: (settlementId: string) => Promise<RazorpaySettlementHeader>;
  fetchSettlementRecon: (params: {
    year: number;
    month: number;
    day?: number;
    count?: number;
    skip?: number;
  }) => Promise<RazorpaySettlementReconLine[]>;
};

function getKeyPair(): { key_id: string; key_secret: string } {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key_id || !key_secret) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED"
    });
  }
  return { key_id, key_secret };
}

function asHeader(raw: unknown): RazorpaySettlementHeader {
  const r = raw as RazorpaySettlementHeader;
  if (!r?.id || typeof r.amount !== "number" || typeof r.created_at !== "number") {
    throw Object.assign(new Error("Malformed Razorpay settlement header"), {
      statusCode: 502,
      code: "MALFORMED_SETTLEMENT"
    });
  }
  return r;
}

export function createRazorpaySettlementReadClient(
  override?: Partial<RazorpaySettlementReadClient>
): RazorpaySettlementReadClient {
  const base: RazorpaySettlementReadClient = {
    async listSettlements(params = {}) {
      const rzp = new Razorpay(getKeyPair());
      const result = await rzp.settlements.all({
        from: params.from,
        to: params.to,
        count: params.count ?? 100,
        skip: params.skip ?? 0
      });
      const items = (result as { items?: unknown[] })?.items ?? [];
      return items.map(asHeader);
    },

    async fetchSettlement(settlementId: string) {
      const rzp = new Razorpay(getKeyPair());
      const result = await rzp.settlements.fetch(settlementId);
      return asHeader(result);
    },

    async fetchSettlementRecon(params) {
      const rzp = new Razorpay(getKeyPair());
      const result = await rzp.settlements.reports({
        year: params.year,
        month: params.month,
        day: params.day,
        count: params.count ?? 1000,
        skip: params.skip ?? 0
      });
      const items = ((result as { items?: unknown[] })?.items ??
        []) as RazorpaySettlementReconLine[];
      return items;
    }
  };

  return { ...base, ...override };
}

/** Test helper: proves mutation surfaces are not part of the adapter contract. */
export const RAZORPAY_SETTLEMENT_ADAPTER_FORBIDDEN_METHODS = [
  "createOndemandSettlement",
  "capture",
  "refund",
  "transfer",
  "create"
] as const;
