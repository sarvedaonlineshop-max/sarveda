/** Gate Purchases module until tested on staging. Set PURCHASES_MODULE_ENABLED=1 to enable. */
export function isPurchasesModuleEnabled(): boolean {
  const v = (process.env.PURCHASES_MODULE_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export const PURCHASES_MODULE_DISABLED_MESSAGE =
  "Purchases module is disabled. Set PURCHASES_MODULE_ENABLED=1 on the backend to enable.";
