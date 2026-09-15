/** Admin helpers: course/event (digital) vs physical product lines. */

export function isDigitalSku(sku: string | null | undefined): boolean {
  const s = String(sku ?? "");
  return s.startsWith("COURSE-") || s.startsWith("EVENT-");
}

export function isCourseSku(sku: string | null | undefined): boolean {
  return String(sku ?? "").startsWith("COURSE-");
}

export type DigitalAwareOrderItem = {
  digitalOfferId?: string | null;
  skuSnapshot?: string | null;
};

/** Course or event registration line (not a warehouse SKU). */
export function isDigitalOrderItem(item: DigitalAwareOrderItem): boolean {
  return Boolean(item.digitalOfferId) || isDigitalSku(item.skuSnapshot);
}

export function isCourseOrderItem(item: DigitalAwareOrderItem): boolean {
  if (isCourseSku(item.skuSnapshot)) return true;
  // digitalOfferId alone may be EVENT — callers use isDigital for shipping hide.
  return false;
}

/** Every line is digital → no warehouse / courier UI. */
export function isDigitalOnlyOrder(items: DigitalAwareOrderItem[]): boolean {
  return items.length > 0 && items.every(isDigitalOrderItem);
}

/** At least one course registration line. */
export function hasCourseRegistration(items: DigitalAwareOrderItem[]): boolean {
  return items.some((i) => isCourseSku(i.skuSnapshot) || Boolean(i.digitalOfferId));
}
