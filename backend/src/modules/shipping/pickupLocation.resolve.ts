import { prisma } from "../../config/db";
import { shippingEnv } from "../../config/env";

export type PickupResolveInput = {
  pickupLocationId?: string;
  shiprocketPickupName?: string;
};

export type PickupResolveResult =
  | { ok: true; shiprocketPickupName: string; pickupLocationId: string | null }
  | { ok: false; error: string; code: string };

export async function resolvePickupForShipment(input: PickupResolveInput): Promise<PickupResolveResult> {
  if (input.pickupLocationId) {
    const row = await prisma.pickupLocation.findFirst({
      where: { id: input.pickupLocationId, isActive: true }
    });
    if (!row) {
      return { ok: false, error: "Pickup location not found or inactive", code: "BAD_REQUEST" };
    }
    const name = row.shiprocketPickupName.trim();
    if (!name) {
      return { ok: false, error: "Pickup has empty Shiprocket warehouse name", code: "BAD_REQUEST" };
    }
    return { ok: true, shiprocketPickupName: name, pickupLocationId: row.id };
  }

  if (input.shiprocketPickupName?.trim()) {
    return {
      ok: true,
      shiprocketPickupName: input.shiprocketPickupName.trim(),
      pickupLocationId: null
    };
  }

  const primary = await prisma.pickupLocation.findFirst({
    where: { isPrimary: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  if (primary) {
    const name = primary.shiprocketPickupName.trim();
    if (name) {
      return { ok: true, shiprocketPickupName: name, pickupLocationId: primary.id };
    }
  }

  const anyActive = await prisma.pickupLocation.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  if (anyActive) {
    const name = anyActive.shiprocketPickupName.trim();
    if (name) {
      return { ok: true, shiprocketPickupName: name, pickupLocationId: anyActive.id };
    }
  }

  const env = shippingEnv.SHIPROCKET_PICKUP_LOCATION?.trim();
  if (env) {
    return { ok: true, shiprocketPickupName: env, pickupLocationId: null };
  }

  return {
    ok: false,
    error:
      "No pickup location configured. Add warehouses under Admin → Pickup locations, or set SHIPROCKET_PICKUP_LOCATION.",
    code: "PICKUP_NOT_CONFIGURED"
  };
}
