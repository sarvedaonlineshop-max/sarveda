/**
 * India-oriented financial year helpers (Phase 6B).
 * Start month is configurable via ACCOUNTING_FY_START_MONTH (default 4 = April).
 * All FY math must go through these helpers — do not hardcode April elsewhere.
 */

export type FinancialYearBounds = {
  /** Inclusive start YYYY-MM-DD (UTC date) */
  startDate: string;
  /** Inclusive end YYYY-MM-DD (UTC date) */
  endDate: string;
  /** e.g. FY2025-26 when start month is April and start year is 2025 */
  label: string;
  /** Calendar year of FY start */
  startYear: number;
  startMonth: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcYmd(y: number, month1to12: number, day: number): string {
  return `${y}-${pad2(month1to12)}-${pad2(day)}`;
}

function daysInMonthUtc(y: number, month1to12: number): number {
  return new Date(Date.UTC(y, month1to12, 0)).getUTCDate();
}

/** Parse YYYY-MM-DD as UTC midnight Date (date-only). */
export function parseUtcDateOnly(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${ymd}`);
  }
  const [ys, ms, ds] = ymd.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  const maxDay = daysInMonthUtc(y, m);
  if (d > maxDay) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatUtcDateOnly(d: Date): string {
  return utcYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Validated FY start month 1–12.
 * Default 4 (April) when unset / empty.
 */
export function getAccountingFyStartMonth(): number {
  const raw = (process.env.ACCOUNTING_FY_START_MONTH ?? "").trim();
  if (!raw) return 4;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw new Error(
      `ACCOUNTING_FY_START_MONTH must be an integer 1–12 (got ${JSON.stringify(raw)})`
    );
  }
  return n;
}

function fyLabel(startYear: number, startMonth: number): string {
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  if (startMonth === 1) {
    return `FY${startYear}`;
  }
  const yy = String(endYear).slice(-2);
  return `FY${startYear}-${yy}`;
}

/** Financial year that contains the given UTC date. */
export function financialYearContainingDate(
  date: Date,
  startMonth: number = getAccountingFyStartMonth()
): FinancialYearBounds {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endDay = daysInMonthUtc(endYear, endMonth);

  return {
    startDate: utcYmd(startYear, startMonth, 1),
    endDate: utcYmd(endYear, endMonth, endDay),
    label: fyLabel(startYear, startMonth),
    startYear,
    startMonth
  };
}

export function currentFinancialYear(
  asOf: Date = new Date(),
  startMonth: number = getAccountingFyStartMonth()
): FinancialYearBounds {
  return financialYearContainingDate(asOf, startMonth);
}

export function financialYearStartDate(
  date: Date,
  startMonth: number = getAccountingFyStartMonth()
): Date {
  return parseUtcDateOnly(financialYearContainingDate(date, startMonth).startDate);
}

export function financialYearEndDate(
  date: Date,
  startMonth: number = getAccountingFyStartMonth()
): Date {
  return parseUtcDateOnly(financialYearContainingDate(date, startMonth).endDate);
}

/** YTD start = FY start containing asOf. */
export function yearToDateStart(
  asOf: Date = new Date(),
  startMonth: number = getAccountingFyStartMonth()
): Date {
  return financialYearStartDate(asOf, startMonth);
}

export function previousFinancialYear(
  fy: FinancialYearBounds
): FinancialYearBounds {
  const prevStartYear = fy.startYear - 1;
  const startMonth = fy.startMonth;
  const endYear = startMonth === 1 ? prevStartYear : prevStartYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endDay = daysInMonthUtc(endYear, endMonth);
  return {
    startDate: utcYmd(prevStartYear, startMonth, 1),
    endDate: utcYmd(endYear, endMonth, endDay),
    label: fyLabel(prevStartYear, startMonth),
    startYear: prevStartYear,
    startMonth
  };
}

export function listFinancialYearOptions(opts?: {
  asOf?: Date;
  yearsBack?: number;
  yearsForward?: number;
  startMonth?: number;
}): FinancialYearBounds[] {
  const asOf = opts?.asOf ?? new Date();
  const startMonth = opts?.startMonth ?? getAccountingFyStartMonth();
  const back = opts?.yearsBack ?? 3;
  const forward = opts?.yearsForward ?? 1;
  const current = financialYearContainingDate(asOf, startMonth);
  const out: FinancialYearBounds[] = [];
  for (let i = back; i >= 1; i--) {
    let fy = current;
    for (let j = 0; j < i; j++) fy = previousFinancialYear(fy);
    out.push(fy);
  }
  out.push(current);
  for (let i = 1; i <= forward; i++) {
    const y = current.startYear + i;
    const endYear = startMonth === 1 ? y : y + 1;
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endDay = daysInMonthUtc(endYear, endMonth);
    out.push({
      startDate: utcYmd(y, startMonth, 1),
      endDate: utcYmd(endYear, endMonth, endDay),
      label: fyLabel(y, startMonth),
      startYear: y,
      startMonth
    });
  }
  return out;
}

export function financialYearConfigSummary() {
  const startMonth = getAccountingFyStartMonth();
  const now = new Date();
  const current = currentFinancialYear(now, startMonth);
  return {
    fyStartMonth: startMonth,
    currentFy: current,
    ytdStart: current.startDate,
    options: listFinancialYearOptions({ asOf: now, startMonth, yearsBack: 2, yearsForward: 1 })
  };
}
