"use client";

import type { OptionAxisForm, VariantAttributeForm } from "@/lib/variant-admin";
import { variantLabelFromAttributes } from "@/lib/variant-admin";

type VariantRow = {
  attributes: VariantAttributeForm[];
};

type Props = {
  axes: OptionAxisForm[];
  variants: VariantRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

type Branch = {
  label: string;
  children: Map<string, Branch>;
  variantIndex?: number;
};

function ensureBranch(parent: Map<string, Branch>, label: string): Branch {
  const existing = parent.get(label);
  if (existing) return existing;
  const created: Branch = { label, children: new Map() };
  parent.set(label, created);
  return created;
}

function buildRoot(axes: OptionAxisForm[], variants: VariantRow[]): Map<string, Branch> {
  const root = new Map<string, Branch>();
  variants.forEach((v, index) => {
    const path = axes.map((axis, i) => v.attributes[i]?.value.trim() || "");
    if (path.every((p) => !p)) {
      ensureBranch(root, `Unassigned ${index + 1}`).variantIndex = index;
      return;
    }
    let level = root;
    path.forEach((part, depth) => {
      const label = part || `(pick ${axes[depth]?.name || `level ${depth + 1}`})`;
      const node = ensureBranch(level, label);
      if (depth === path.length - 1) node.variantIndex = index;
      level = node.children;
    });
  });
  return root;
}

function TreeNodes({
  nodes,
  depth,
  selectedIndex,
  onSelect
}: {
  nodes: Map<string, Branch>;
  depth: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5 border-l border-stone-200 pl-2.5 dark:border-stone-700"}>
      {Array.from(nodes.values()).map((node) => {
        const isLeaf = node.variantIndex != null && node.children.size === 0;
        const selected = isLeaf && node.variantIndex === selectedIndex;
        return (
          <li key={`${depth}-${node.label}-${node.variantIndex ?? "b"}`}>
            {isLeaf ? (
              <button
                type="button"
                onClick={() => onSelect(node.variantIndex!)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  selected
                    ? "bg-[#1c352a] font-semibold text-white"
                    : "text-[var(--admin-text,#2c2420)] hover:bg-amber-50 dark:hover:bg-stone-800"
                }`}
              >
                {node.label}
              </button>
            ) : (
              <div>
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  {node.label}
                </p>
                {node.children.size > 0 ? (
                  <TreeNodes
                    nodes={node.children}
                    depth={depth + 1}
                    selectedIndex={selectedIndex}
                    onSelect={onSelect}
                  />
                ) : node.variantIndex != null ? (
                  <button
                    type="button"
                    onClick={() => onSelect(node.variantIndex!)}
                    className={`ml-2 w-[calc(100%-0.5rem)] rounded-md px-2 py-1.5 text-left text-sm ${
                      node.variantIndex === selectedIndex
                        ? "bg-[#1c352a] font-semibold text-white"
                        : "hover:bg-amber-50"
                    }`}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function VariantTreeNav({ axes, variants, selectedIndex, onSelect }: Props) {
  const tree = buildRoot(axes, variants);
  const selected = variants[selectedIndex];
  const selectedLabel = selected
    ? variantLabelFromAttributes(selected.attributes) || `Variant ${selectedIndex + 1}`
    : "";

  return (
    <aside className="rounded-xl border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] p-3">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
        Variant tree
      </p>
      <p className="mb-2 px-1 text-[11px] text-[var(--admin-text-muted,#8a7060)]">
        {selectedLabel ? `Editing ${selectedLabel}` : "Pick a combination"}
      </p>
      {tree.size === 0 ? (
        <p className="px-1 text-xs text-[var(--admin-text-muted,#8a7060)]">
          Add option values, then create combinations.
        </p>
      ) : (
        <TreeNodes nodes={tree} depth={0} selectedIndex={selectedIndex} onSelect={onSelect} />
      )}
    </aside>
  );
}
