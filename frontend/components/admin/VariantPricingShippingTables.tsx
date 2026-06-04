"use client";

import { sanitizeNonNegativeInput } from "@/lib/admin-form-numbers";

const ZONES = ["IN", "US", "GB", "OTHER"] as const;
type Zone = (typeof ZONES)[number];

export type ShippingRateForm = {
  country: Zone;
  standardPerProduct: string;
  standardAdditional: string;
  codPerProduct: string;
  codAdditional: string;
  estimatedDays: string;
};

export type VariantFormSlice = {
  sku: string;
  mrpInr: string;
  saleInr: string;
  mrpUsd: string;
  saleUsd: string;
  mrpGbp: string;
  saleGbp: string;
  weightGrams: string;
  onHand: string;
  shippingRates: ShippingRateForm[];
};

const thClass =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";
const tdClass = "px-3 py-2 align-top";
const inputCls =
  "w-full min-w-[4.5rem] rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

const zoneLabel: Record<Zone, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  OTHER: "Rest of world"
};

const zoneCurrency: Record<Zone, string> = {
  IN: "₹",
  US: "$",
  GB: "£",
  OTHER: "$"
};

type Props = {
  variant: VariantFormSlice;
  variantIndex: number;
  onChange: (next: VariantFormSlice) => void;
  fieldErrors: Record<string, string>;
};

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

export function VariantPricingShippingTables({
  variant,
  variantIndex,
  onChange,
  fieldErrors
}: Props) {
  const vi = variantIndex;

  function patchRate(ri: number, key: keyof ShippingRateForm, value: string) {
    onChange({
      ...variant,
      shippingRates: variant.shippingRates.map((sr, j) =>
        j === ri ? { ...sr, [key]: sanitizeNonNegativeInput(value) } : sr
      )
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Prices (GST-inclusive for India)
        </p>
        <p className="mt-1 text-xs text-stone-500">
          <strong>MRP</strong> = full price shown with strike-through. <strong>Sale price</strong> = what
          customers pay. All amounts must be zero or positive.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-800/80">
              <tr>
                <th className={thClass}>Market</th>
                <th className={thClass}>MRP (list price)</th>
                <th className={thClass}>Sale price (customer pays)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              <tr>
                <td className={tdClass}>
                  <span className="font-medium text-stone-800 dark:text-stone-100">India</span>
                  <span className="ml-1 text-stone-500">INR ₹</span>
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.mrpInr}
                    onChange={(e) =>
                      onChange({ ...variant, mrpInr: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    aria-label="India MRP in rupees"
                  />
                  <FieldHint message={fieldErrors[`variants.${vi}.mrpInr`]} />
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.saleInr}
                    onChange={(e) =>
                      onChange({ ...variant, saleInr: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    aria-label="India sale price in rupees"
                  />
                  <FieldHint message={fieldErrors[`variants.${vi}.saleInr`]} />
                </td>
              </tr>
              <tr>
                <td className={tdClass}>
                  <span className="font-medium">United States</span>
                  <span className="ml-1 text-stone-500">USD $</span>
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.mrpUsd}
                    onChange={(e) =>
                      onChange({ ...variant, mrpUsd: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    placeholder="Optional"
                  />
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.saleUsd}
                    onChange={(e) =>
                      onChange({ ...variant, saleUsd: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    placeholder="Optional"
                  />
                </td>
              </tr>
              <tr>
                <td className={tdClass}>
                  <span className="font-medium">United Kingdom</span>
                  <span className="ml-1 text-stone-500">GBP £</span>
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.mrpGbp}
                    onChange={(e) =>
                      onChange({ ...variant, mrpGbp: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    placeholder="Optional"
                  />
                </td>
                <td className={tdClass}>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={variant.saleGbp}
                    onChange={(e) =>
                      onChange({ ...variant, saleGbp: sanitizeNonNegativeInput(e.target.value) })
                    }
                    className={inputCls}
                    placeholder="Optional"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Shipping fees (per order)
        </p>
        <p className="mt-1 text-xs text-stone-500">
          <strong>First item</strong> = shipping when customer buys one unit. <strong>Each extra item</strong>{" "}
          = added fee per additional unit in the cart. India can include COD fees.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-800/80">
              <tr>
                <th className={thClass}>Ship to</th>
                <th className={thClass}>First item</th>
                <th className={thClass}>Each extra item</th>
                <th className={thClass}>COD first (India)</th>
                <th className={thClass}>COD extra (India)</th>
                <th className={thClass}>Delivery note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {variant.shippingRates.map((r, ri) => (
                <tr key={r.country}>
                  <td className={tdClass}>
                    <span className="font-medium text-stone-800 dark:text-stone-100">
                      {zoneLabel[r.country]}
                    </span>
                    <span className="block text-xs text-stone-500">{zoneCurrency[r.country]}</span>
                  </td>
                  <td className={tdClass}>
                    <input
                      inputMode="decimal"
                      min={0}
                      value={r.standardPerProduct}
                      onChange={(e) => patchRate(ri, "standardPerProduct", e.target.value)}
                      className={inputCls}
                    />
                  </td>
                  <td className={tdClass}>
                    <input
                      inputMode="decimal"
                      min={0}
                      value={r.standardAdditional}
                      onChange={(e) => patchRate(ri, "standardAdditional", e.target.value)}
                      className={inputCls}
                    />
                  </td>
                  <td className={tdClass}>
                    {r.country === "IN" ? (
                      <input
                        inputMode="decimal"
                        min={0}
                        value={r.codPerProduct}
                        onChange={(e) => patchRate(ri, "codPerProduct", e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    {r.country === "IN" ? (
                      <input
                        inputMode="decimal"
                        min={0}
                        value={r.codAdditional}
                        onChange={(e) => patchRate(ri, "codAdditional", e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <input
                      value={r.estimatedDays}
                      onChange={(e) => patchRate(ri, "estimatedDays", e.target.value)}
                      placeholder="e.g. 4 - 7 Days"
                      className={inputCls}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
