"use client";

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <p style={{ fontSize: "13px", color: "#8a7060" }}>
        Showing page <strong style={{ color: "#2c2420" }}>{page}</strong> of <strong style={{ color: "#2c2420" }}>{safePages}</strong>
        <span style={{ marginLeft: "6px", color: "#b8a898" }}>· {total.toLocaleString("en-IN")} {itemLabel}</span>
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
            opacity: page <= 1 ? 0.5 : 1
          }}
        >
          ← Prev
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
                background: isActive ? "#1e3a2f" : "#ffffff",
                border: isActive ? "1px solid #1e3a2f" : "1px solid #e0d8ce",
                color: isActive ? "#fffbf5" : "#2c2420",
                fontWeight: isActive ? 700 : 400,
                pointerEvents: isActive ? "none" : "auto"
              }}
              onClick={() => {
                if (p < page) { for (let x = page; x > p; x--) onPrev(); }
                else { for (let x = page; x < p; x++) onNext(); }
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
            background: page >= safePages ? "#f4f1ec" : "#1e3a2f",
            border: "1px solid",
            borderColor: page >= safePages ? "#e0d8ce" : "#1e3a2f",
            color: page >= safePages ? "#c8bca8" : "#fffbf5",
            opacity: page >= safePages ? 0.5 : 1
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
