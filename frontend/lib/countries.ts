export type CountryOption = {
  code: string;
  name: string;
  dial: string;
};

export const COUNTRIES: CountryOption[] = [
  { code: "IN", name: "India", dial: "+91" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "NO", name: "Norway", dial: "+47" },
  { code: "DK", name: "Denmark", dial: "+45" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "LK", name: "Sri Lanka", dial: "+94" },
  { code: "NP", name: "Nepal", dial: "+977" },
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "KW", name: "Kuwait", dial: "+965" },
  { code: "OM", name: "Oman", dial: "+968" },
  { code: "BH", name: "Bahrain", dial: "+973" }
];

export function countryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((row) => row.code === code);
}
