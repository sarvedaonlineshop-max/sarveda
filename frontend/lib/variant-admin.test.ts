import { describe, expect, it } from "vitest";

import {
  pruneVariantRows,
  type OptionAxisForm,
  type VariantAttributeForm
} from "./variant-admin";

type Row = {
  id?: string;
  sku: string;
  isDefault: boolean;
  optionMismatch?: boolean;
  attributes: VariantAttributeForm[];
};

function emptyRow(): Row {
  return { sku: "", isDefault: false, attributes: [] };
}

describe("VSB-007 pruneVariantRows preserves persisted variants", () => {
  const axes: OptionAxisForm[] = [
    { name: "Color", slug: "color", values: ["Red"] },
    { name: "Size", slug: "size", values: ["Small"] }
  ];

  it("keeps persisted row that no longer matches and flags optionMismatch", () => {
    const rows: Row[] = [
      {
        id: "persisted-blue-large",
        sku: "SKU-BL",
        isDefault: true,
        attributes: [
          { name: "Color", slug: "color", value: "Blue" },
          { name: "Size", slug: "size", value: "Large" }
        ]
      },
      {
        id: "persisted-red-small",
        sku: "SKU-RS",
        isDefault: false,
        attributes: [
          { name: "Color", slug: "color", value: "Red" },
          { name: "Size", slug: "size", value: "Small" }
        ]
      },
      {
        // unsaved draft that does not match — should be dropped
        sku: "DRAFT-X",
        isDefault: false,
        attributes: [
          { name: "Color", slug: "color", value: "Green" },
          { name: "Size", slug: "size", value: "XL" }
        ]
      }
    ];

    const next = pruneVariantRows(rows, axes, emptyRow);
    expect(next.map((r) => r.id).filter(Boolean).sort()).toEqual([
      "persisted-blue-large",
      "persisted-red-small"
    ]);
    expect(next.find((r) => r.id === "persisted-blue-large")?.optionMismatch).toBe(true);
    expect(next.find((r) => r.id === "persisted-red-small")?.optionMismatch).toBe(false);
    expect(next.some((r) => r.sku === "DRAFT-X")).toBe(false);
  });

  it("does not collapse to a single row when axes cleared if persisted rows exist", () => {
    const rows: Row[] = [
      {
        id: "a",
        sku: "A",
        isDefault: true,
        attributes: [{ name: "Color", slug: "color", value: "Red" }]
      },
      {
        id: "b",
        sku: "B",
        isDefault: false,
        attributes: [{ name: "Color", slug: "color", value: "Blue" }]
      }
    ];
    const emptyAxes: OptionAxisForm[] = [{ name: "Color", slug: "color", values: [] }];
    const next = pruneVariantRows(rows, emptyAxes, emptyRow);
    expect(next).toHaveLength(2);
    expect(next.every((r) => r.optionMismatch)).toBe(true);
  });
});
