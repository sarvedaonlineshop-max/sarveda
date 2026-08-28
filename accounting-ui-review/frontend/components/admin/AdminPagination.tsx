"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPrev: () => void;
  onNext: () => void;
};

export function AdminPagination({ page, totalPages, total, itemLabel, onPrev, onNext }: Props) {
  const safePages = Math.max(1, totalPages);

  const btnBase: React.CSSProperties = {
    height: "36px", minWidth: "36px", padding: "0 14px",
    borderRadius: "8px", fontSize: "13px", fontWeight: 500,
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s ease"
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid rgba(185,138,62,0.12)" }}>
      <p style={{ fontSize: "13px", color: "#6b5c52" }}>
        Page <strong style={{ color: "#1c352a", fontWeight: 800 }}>{page}</strong> / <strong style={{ color: "#1c352a", fontWeight: 800 }}>{safePages}</strong>
        <span style={{ marginLeft: "6px", color: "#8a7060" }}>· {total.toLocaleString("en-IN")} {itemLabel}</span>
      </p>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          style={{
            ...btnBase,
            background: page <= 1 ? "#f4f1ec" : "#ffffff",
            border: "1px solid #e0d8ce",
            color: page <= 1 ? "#c8bca8" : "#2c2420",
            opacity: page <= 1 ? 0.35 : 1,
            cursor: page <= 1 ? "not-allowed" : "pointer"
          }}
          onMouseEnter={(e) => {
            if (page <= 1) return;
            e.currentTarget.style.background = "#faf5ec";
            e.currentTarget.style.borderColor = "#b98a3e";
          }}
          onMouseLeave={(e) => {
            if (page <= 1) return;
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#e0d8ce";
          }}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page number pills */}
        {Array.from({ length: Math.min(safePages, 5) }, (_, i) => {
          let p: number;
          if (safePages <= 5) {
            p = i + 1;
          } else if (page <= 3) {
            p = i + 1;
          } else if (page >= safePages - 2) {
            p = safePages - 4 + i;
          } else {
            p = page - 2 + i;
          }
          const isActive = p === page;
          return (
            <button
              key={p}
              type="button"
              style={{
                ...btnBase,
                minWidth: "36px", padding: "0",
                background: isActive ? "linear-gradient(135deg, #1c352a, #2d5040)" : "#ffffff",
                border: isActive ? "1px solid #1e3a2f" : "1px solid #e0d8ce",
                color: isActive ? "#fffbf5" : "#2c2420",
                fontWeight: isActive ? 800 : 400,
                pointerEvents: isActive ? "none" : "auto",
                boxShadow: isActive ? "0 2px 8px rgba(28,53,42,0.30)" : "none"
              }}
              onClick={() => {
                if (p < page) { for (let x = page; x > p; x--) onPrev(); }
                else { for (let x = page; x < p; x++) onNext(); }
              }}
              onMouseEnter={(e) => {
                if (isActive) return;
                e.currentTarget.style.background = "#faf5ec";
                e.currentTarget.style.borderColor = "#b98a3e";
                e.currentTarget.style.color = "#b98a3e";
              }}
              onMouseLeave={(e) => {
                if (isActive) return;
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.borderColor = "#e0d8ce";
                e.currentTarget.style.color = "#2c2420";
              }}
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          disabled={page >= safePages}
          onClick={onNext}
          style={{
            ...btnBase,
            background: page >= safePages ? "#f4f1ec" : "linear-gradient(135deg, #1c352a, #2d5040)",
            border: "1px solid",
            borderColor: page >= safePages ? "#e0d8ce" : "#1e3a2f",
            color: page >= safePages ? "#c8bca8" : "#fffbf5",
            opacity: page >= safePages ? 0.35 : 1,
            cursor: page >= safePages ? "not-allowed" : "pointer",
            boxShadow: page >= safePages ? "none" : "0 2px 6px rgba(28,53,42,0.22)"
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
