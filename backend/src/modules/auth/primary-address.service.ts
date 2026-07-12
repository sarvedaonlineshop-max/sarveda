import type { Address } from "@prisma/client";

import { prisma } from "../../config/db";

export type PrimaryAddressPayload = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type PublicPrimaryAddress = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export function serializePrimaryAddress(row: Address): PublicPrimaryAddress {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    isDefault: row.isDefault
  };
}

export async function getOrSeedPrimaryAddress(
  userId: string,
  userEmail: string
): Promise<Address | null> {
  const existingDefault = await prisma.address.findFirst({
    where: { userId, isDefault: true },
    orderBy: { id: "asc" }
  });
  if (existingDefault) return existingDefault;

  const anySaved = await prisma.address.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }]
  });
  if (anySaved) {
    if (!anySaved.isDefault) {
      return prisma.address.update({
        where: { id: anySaved.id },
        data: { isDefault: true, label: anySaved.label ?? "Primary" }
      });
    }
    return anySaved;
  }

  const email = userEmail.trim().toLowerCase();
  const firstOrder = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      OR: [{ customerId: userId }, { email }],
      addresses: { some: { type: "SHIPPING" } }
    },
    orderBy: { createdAt: "asc" },
    include: {
      addresses: { where: { type: "SHIPPING" }, take: 1 }
    }
  });

  const shipping = firstOrder?.addresses[0];
  if (!shipping) return null;

  return prisma.address.create({
    data: {
      userId,
      label: "Primary",
      fullName: shipping.fullName,
      phone: shipping.phone,
      line1: shipping.line1,
      line2: shipping.line2,
      city: shipping.city,
      state: shipping.state,
      postalCode: shipping.postalCode,
      country: shipping.country,
      isDefault: true
    }
  });
}

export async function upsertPrimaryAddress(
  userId: string,
  body: PrimaryAddressPayload
): Promise<Address> {
  const existing = await prisma.address.findFirst({
    where: { userId, isDefault: true },
    orderBy: { id: "asc" }
  });

  const data = {
    label: "Primary",
    fullName: body.fullName.trim(),
    phone: body.phone.trim(),
    line1: body.line1.trim(),
    line2: body.line2?.trim() || null,
    city: body.city.trim(),
    state: body.state.trim(),
    postalCode: body.postalCode.trim(),
    country: body.country.trim().toUpperCase(),
    isDefault: true
  };

  if (existing) {
    return prisma.address.update({
      where: { id: existing.id },
      data
    });
  }

  await prisma.address.updateMany({
    where: { userId },
    data: { isDefault: false }
  });

  return prisma.address.create({
    data: { userId, ...data }
  });
}
