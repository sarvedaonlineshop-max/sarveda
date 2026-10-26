import { describe, expect, it } from "vitest";

import {
  enquiryFollowUpRef,
  outreachCustomerFirstName,
  outreachMediaKind,
  outreachMediaTemplateName
} from "../../src/modules/enquiries/whatsapp-outreach";

describe("outreachCustomerFirstName", () => {
  it("uses the first word of a stored customer name", () => {
    expect(outreachCustomerFirstName("Neelam A Cheaw")).toBe("Neelam");
  });

  it("falls back to there when the name is missing", () => {
    expect(outreachCustomerFirstName(null)).toBe("there");
    expect(outreachCustomerFirstName("   ")).toBe("there");
  });

  it("falls back to there when the stored name is just the WhatsApp number", () => {
    expect(outreachCustomerFirstName("+919876543210", "+919876543210")).toBe("there");
  });
});

describe("outreachMediaKind", () => {
  it("classifies images, mp4 video, and other files", () => {
    expect(outreachMediaKind("image/jpeg", "shot.jpg")).toBe("image");
    expect(outreachMediaKind("video/mp4", "clip.mp4")).toBe("video");
    expect(outreachMediaKind("application/pdf", "quote.pdf")).toBe("document");
  });
});

describe("outreachMediaTemplateName", () => {
  it("uses the default Meta template names", () => {
    expect(outreachMediaTemplateName("image")).toBe("enquiry_followup_image");
    expect(outreachMediaTemplateName("video")).toBe("sarveda_support_outreach_video");
    expect(outreachMediaTemplateName("document")).toBe("sarveda_support_outreach_document");
  });
});

describe("enquiryFollowUpRef", () => {
  it("prefers the order number, else a short enquiry label", () => {
    expect(enquiryFollowUpRef({ orderNumber: "SRV-2026100001" })).toBe("order SRV-2026100001");
    expect(enquiryFollowUpRef({ orderNumber: null, customSubject: "Handpan size" })).toBe(
      "Handpan size"
    );
    expect(enquiryFollowUpRef({})).toBe("your enquiry");
  });
});
