/**
 * Upsert Delhivery pickup locations from Delhivery One screenshots.
 * Deactivates legacy "Bihar" stub; sets Sarveda Life Pvt Ltd-1 (Mysore) as primary.
 *
 * Local:  cd backend && npm run seed:pickup-locations
 * EC2/RDS: cd ~/sarveda/backend && npm run seed:pickup-locations
 */
import dotenv from "dotenv";
import path from "path";

import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const RETURN_WAREHOUSE = {
  returnSameAsPickup: false,
  returnLine1:
    "Sarveda Life Pvt Ltd, Plot No. B, Part 2, RASUDHI WAREHOUSE, KIADB Industrial Housing Layout, Hebbal 2nd stage Mysore",
  returnCity: "Mysore",
  returnState: "Karnataka",
  returnPostalCode: "570016",
  returnCountry: "IN"
};

const EVENING_SLOT = "Evening 14:00:00 - 18:00:00";

type PickupSeed = {
  label: string;
  shiprocketPickupName: string;
  delhiveryPickupName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  returnSameAsPickup?: boolean;
  returnLine1?: string | null;
  returnCity?: string | null;
  returnState?: string | null;
  returnPostalCode?: string | null;
  returnCountry?: string | null;
  isPrimary?: boolean;
  sortOrder: number;
};

const LOCATIONS: PickupSeed[] = [
  {
    label: "Sarveda Life Pvt Ltd-1 — Mysore",
    shiprocketPickupName: "Sarveda Life Pvt Ltd-1",
    delhiveryPickupName: "Sarveda Life Pvt Ltd-1",
    contactPerson: "Chethan",
    phone: "+919964278486",
    email: "Care@sarveda.com",
    line1:
      "Plot No. B, Part 2, RASUDHI WAREHOUSE, KIADB Industrial Housing Layout, Hebbal 2nd stage Mysore",
    city: "Mysore",
    state: "Karnataka",
    postalCode: "570016",
    returnSameAsPickup: true,
    isPrimary: true,
    sortOrder: 0
  },
  {
    label: "Souvik — Bankura",
    shiprocketPickupName: "Souvik",
    delhiveryPickupName: "Souvik",
    contactPerson: "karmakar",
    phone: "+917001658267",
    line1: "Doltala, Bankura, West Bengal",
    city: "Bankura",
    state: "West Bengal",
    postalCode: "722101",
    ...RETURN_WAREHOUSE,
    sortOrder: 1
  },
  {
    label: "Vedprakash — Ambala",
    shiprocketPickupName: "Vedprakash",
    delhiveryPickupName: "Vedprakash",
    contactPerson: "Vedprakash",
    phone: "+919350389739",
    line1: "Shop No 43, Ekta Vihar Chowk Ravi nagar Ambala Cantt Haryana",
    city: "Ambala Cantt",
    state: "Haryana",
    postalCode: "133001",
    ...RETURN_WAREHOUSE,
    sortOrder: 2
  },
  {
    label: "Indian — Jaisalmer",
    shiprocketPickupName: "Indian",
    delhiveryPickupName: "Indian",
    contactPerson: "Morchang",
    phone: "+919610660828",
    line1: "Lohar Basti, Behind CMHO office, Jaisalmer, Rajasthan",
    city: "Jaisalmer",
    state: "Rajasthan",
    postalCode: "345001",
    ...RETURN_WAREHOUSE,
    sortOrder: 3
  },
  {
    label: "Chirag — Bengaluru",
    shiprocketPickupName: "Chirag",
    delhiveryPickupName: "Chirag",
    contactPerson: "Vaitheeswaran",
    phone: "+919632785544",
    line1: "No 235, Mummy Daddy Layout, Bannerghatta Road Cross, Bengaluru",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560083",
    ...RETURN_WAREHOUSE,
    sortOrder: 4
  },
  {
    label: "Djembe Musicals — Pune",
    shiprocketPickupName: "Djembe Musicals",
    delhiveryPickupName: "Djembe Musicals",
    contactPerson: "Prakash",
    phone: "+918380900605",
    line1:
      "S.No 52/3, Maruti nagar, Behind Nishan Vajan Kata, near pioneer timbers Vadgaon Sheri, Pune",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411014",
    ...RETURN_WAREHOUSE,
    sortOrder: 5
  },
  {
    label: "Shaqib — Gajraula",
    shiprocketPickupName: "Shaqib",
    delhiveryPickupName: "Shaqib",
    contactPerson: "Shaqib",
    phone: "+919639458301",
    line1: "14524 near Temple, Phoundapur, Gajraula UP",
    city: "Gajraula",
    state: "Uttar Pradesh",
    postalCode: "244235",
    ...RETURN_WAREHOUSE,
    sortOrder: 6
  },
  {
    label: "Metcraft — Moradabad",
    shiprocketPickupName: "Metcraft",
    delhiveryPickupName: "Metcraft",
    contactPerson: "Metcraft",
    phone: "+918755916469",
    line1: "Jama Masjid park Near jahageer taal waley Moradabad",
    city: "Moradabad",
    state: "Uttar Pradesh",
    postalCode: "244001",
    ...RETURN_WAREHOUSE,
    sortOrder: 7
  },
  {
    label: "Soham Crafts — Bankura",
    shiprocketPickupName: "Soham Crafts",
    delhiveryPickupName: "Soham Crafts",
    contactPerson: "Subhasis Parta",
    phone: "+919064598028",
    line1: "3c/1 Nabasan Bhairabhstan Kenduadhi Bankura",
    city: "Kelebala",
    state: "West Bengal",
    postalCode: "722102",
    ...RETURN_WAREHOUSE,
    sortOrder: 8
  },
  {
    label: "Chengiz — Moradabad",
    shiprocketPickupName: "Chengiz",
    delhiveryPickupName: "Chengiz",
    contactPerson: "Khan-1",
    phone: "+918755916469",
    line1: "Jama Masjid park Gate no 4 Moradabad",
    city: "Moradabad",
    state: "Uttar Pradesh",
    postalCode: "244001",
    ...RETURN_WAREHOUSE,
    sortOrder: 9
  },
  {
    label: "Prasanjeet",
    shiprocketPickupName: "Prasanjeet",
    delhiveryPickupName: "Prasanjeet",
    notes:
      "Address, pincode and contact not in Delhivery screenshot — update in admin when available.",
    ...RETURN_WAREHOUSE,
    sortOrder: 10
  }
];

function toRow(seed: PickupSeed): Prisma.PickupLocationCreateInput {
  const sameReturn = seed.returnSameAsPickup === true;
  return {
    label: seed.label,
    shiprocketPickupName: seed.shiprocketPickupName,
    delhiveryPickupName: seed.delhiveryPickupName,
    contactPerson: seed.contactPerson ?? null,
    phone: seed.phone ?? null,
    email: seed.email ?? null,
    line1: seed.line1 ?? null,
    city: seed.city ?? null,
    state: seed.state ?? null,
    postalCode: seed.postalCode ?? null,
    country: "IN",
    defaultPickupSlot: EVENING_SLOT,
    workingDays: [...ALL_DAYS],
    returnSameAsPickup: sameReturn,
    returnLine1: sameReturn ? null : (seed.returnLine1 ?? RETURN_WAREHOUSE.returnLine1),
    returnCity: sameReturn ? null : (seed.returnCity ?? RETURN_WAREHOUSE.returnCity),
    returnState: sameReturn ? null : (seed.returnState ?? RETURN_WAREHOUSE.returnState),
    returnPostalCode: sameReturn ? null : (seed.returnPostalCode ?? RETURN_WAREHOUSE.returnPostalCode),
    returnCountry: sameReturn ? null : (seed.returnCountry ?? RETURN_WAREHOUSE.returnCountry),
    notes: seed.notes ?? null,
    isPrimary: seed.isPrimary ?? false,
    sortOrder: seed.sortOrder,
    isActive: true
  };
}

async function findExisting(seed: PickupSeed) {
  const name = seed.delhiveryPickupName;
  const or: Prisma.PickupLocationWhereInput[] = [
    { delhiveryPickupName: { equals: name, mode: "insensitive" } },
    { shiprocketPickupName: { equals: name, mode: "insensitive" } },
    { label: { equals: seed.label, mode: "insensitive" } }
  ];

  if (seed.postalCode) {
    or.push({
      postalCode: seed.postalCode,
      delhiveryPickupName: { equals: name, mode: "insensitive" }
    });
  }

  if (seed.isPrimary) {
    or.push({
      OR: [
        { label: { contains: "Mysore", mode: "insensitive" } },
        { city: { equals: "Mysore", mode: "insensitive" }, postalCode: "570016" }
      ]
    });
  }

  return prisma.pickupLocation.findFirst({ where: { OR: or } });
}

async function main() {
  const deactivated = await prisma.pickupLocation.updateMany({
    where: {
      isActive: true,
      OR: [
        { state: { equals: "Bihar", mode: "insensitive" } },
        { label: { contains: "Bihar", mode: "insensitive" } },
        { city: { equals: "Patna", mode: "insensitive" } }
      ]
    },
    data: { isActive: false, isPrimary: false }
  });

  await prisma.pickupLocation.updateMany({ data: { isPrimary: false } });

  let created = 0;
  let updated = 0;

  for (const seed of LOCATIONS) {
    const data = toRow(seed);
    const existing = await findExisting(seed);
    if (existing) {
      await prisma.pickupLocation.update({
        where: { id: existing.id },
        data: { ...data, updatedAt: new Date() }
      });
      updated += 1;
      console.log(`  updated  ${seed.delhiveryPickupName} (${existing.id})`);
    } else {
      await prisma.pickupLocation.create({ data });
      created += 1;
      console.log(`  created  ${seed.delhiveryPickupName}`);
    }
  }

  const active = await prisma.pickupLocation.count({ where: { isActive: true } });
  console.log("");
  console.log(`Done. created=${created} updated=${updated} deactivated_bihar=${deactivated.count} active_total=${active}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
