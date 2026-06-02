import { logger } from "../../config/logger";

import { zohoGet, zohoPost } from "./zoho-client";

interface ZohoContact {
  contact_id: string;
  contact_name: string;
  email: string;
}

export async function getOrCreateZohoContact(customer: {
  name: string;
  email: string;
  phone?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}): Promise<string> {
  try {
    const search = await zohoGet<{ contacts: ZohoContact[] }>(
      `/contacts?email=${encodeURIComponent(customer.email)}`
    );
    if (search.contacts?.length > 0) {
      return search.contacts[0].contact_id;
    }
  } catch {
    logger.warn("Zoho contact search failed, creating new", { email: customer.email });
  }

  const result = await zohoPost<{ contact: ZohoContact }>("/contacts", {
    contact_name: customer.name,
    contact_type: "customer",
    email: customer.email,
    phone: customer.phone ?? "",
    billing_address: customer.address
      ? {
          address: customer.address.line1,
          city: customer.address.city,
          state: customer.address.state,
          zip: customer.address.zip,
          country: customer.address.country
        }
      : undefined
  });

  return result.contact.contact_id;
}
