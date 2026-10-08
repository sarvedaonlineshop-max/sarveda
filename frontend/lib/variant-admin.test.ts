import { describe, expect, it } from "vitest";

import {
  pruneVariantRows,
  realignAttributesToAxes,
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

  it("drops a removed level from a persisted variant and keeps the other choice", () => {
    const rows: Row[] = [
      {
        id: "persisted",
        sku: "SKU-1",
        isDefault: true,
        attributes: [
          { name: "Color", slug: "color", value: "Blue" },
          { name: "Size", slug: "size", value: "Large" }
        ]
      }
    ];
    const colorOnly: OptionAxisForm[] = [{ name: "Color", slug: "color", values: ["Red", "Blue"] }];
    const next = pruneVariantRows(rows, colorOnly, emptyRow);
    expect(next).toHaveLength(1);
    expect(next[0]?.attributes.map((a) => a.slug)).toEqual(["color"]);
    expect(next[0]?.attributes[0]?.value).toBe("Blue");
    expect(next[0]?.optionMismatch).toBe(false);
  });
});

describe("realignAttributesToAxes", () => {
  const color: OptionAxisForm = { name: "Color", slug: "color", values: ["Blue", "Green"] };
  const size: OptionAxisForm = { name: "Size", slug: "size", values: ["Small", "Large"] };
  const grip: OptionAxisForm = { name: "Grip", slug: "grip", values: ["Soft"] };

  it("removes a middle level without moving the next level's value", () => {
    const next = realignAttributesToAxes(
      [
        { name: "Color", slug: "color", value: "Blue" },
        { name: "Size", slug: "size", value: "Large" },
        { name: "Grip", slug: "grip", value: "Soft" }
      ],
      [color, size, grip],
      [color, grip]
    );
    expect(next).toEqual([
      { name: "Color", slug: "color", value: "Blue" },
      { name: "Grip", slug: "grip", value: "Soft" }
    ]);
  });

  it("keeps the choice when a level is renamed", () => {
    const renamed: OptionAxisForm = { name: "Colour", slug: "colour", values: ["Blue", "Green"] };
    const next = realignAttributesToAxes(
      [{ name: "Color", slug: "color", value: "Blue" }],
      [color],
      [renamed]
    );
    expect(next).toEqual([{ name: "Colour", slug: "colour", value: "Blue" }]);
  });
});
