/** Normalize messy Zoho billing city/state fields for India-heavy order data. */

const INDIAN_STATES = new Set([
  "andaman and nicobar islands",
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chandigarh",
  "chhattisgarh",
  "dadra and nagar haveli and daman and diu",
  "delhi",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jammu and kashmir",
  "jharkhand",
  "karnataka",
  "kerala",
  "ladakh",
  "lakshadweep",
  "madhya pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "orissa",
  "puducherry",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "west bengal",
  "wb",
]);

const CITY_TO_STATE: Record<string, string> = {
  kolkata: "West Bengal",
  calcutta: "West Bengal",
  howrah: "West Bengal",
  mumbai: "Maharashtra",
  bombay: "Maharashtra",
  pune: "Maharashtra",
  nagpur: "Maharashtra",
  bengaluru: "Karnataka",
  bangalore: "Karnataka",
  chennai: "Tamil Nadu",
  madras: "Tamil Nadu",
  hyderabad: "Telangana",
  secunderabad: "Telangana",
  ahmedabad: "Gujarat",
  surat: "Gujarat",
  jaipur: "Rajasthan",
  lucknow: "Uttar Pradesh",
  noida: "Uttar Pradesh",
  gurgaon: "Haryana",
  gurugram: "Haryana",
  faridabad: "Haryana",
  ghaziabad: "Uttar Pradesh",
  indore: "Madhya Pradesh",
  bhopal: "Madhya Pradesh",
  patna: "Bihar",
  chandigarh: "Chandigarh",
  visakhapatnam: "Andhra Pradesh",
  vizag: "Andhra Pradesh",
  coimbatore: "Tamil Nadu",
  kochi: "Kerala",
  cochin: "Kerala",
  thiruvananthapuram: "Kerala",
  trivandrum: "Kerala",
  "new delhi": "Delhi",
  delhi: "Delhi",
};

function normKey(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeZohoBillingLocation(
  city: string | null | undefined,
  state: string | null | undefined
): { city: string | null; state: string | null } {
  let c = (city || "").trim() || null;
  let s = (state || "").trim() || null;
  const cKey = normKey(c);
  const sKey = normKey(s);

  if (c && INDIAN_STATES.has(cKey)) {
    if (!s) s = c;
    c = null;
  }

  if (s && CITY_TO_STATE[sKey]) {
    if (!c) c = s;
    s = CITY_TO_STATE[sKey];
  }

  if (c && CITY_TO_STATE[cKey] && !s) {
    s = CITY_TO_STATE[cKey];
  }

  if (c && INDIAN_STATES.has(normKey(c))) {
    if (!s) s = c;
    c = null;
  }

  return {
    city: c ? titleCase(c) : null,
    state: s ? titleCase(s) : null,
  };
}

export function dedupeLocationValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = (raw || "").trim();
    if (!v) continue;
    const key = normKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(titleCase(v));
  }
  return out.sort((a, b) => a.localeCompare(b));
}
