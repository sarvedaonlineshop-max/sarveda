import { describe, expect, it } from "vitest";

import { resolveEnquiryLeadStatus } from "../../src/modules/enquiries/enquiry-lead-status";

describe("resolveEnquiryLeadStatus", () => {
  it("marks a never-attended open chat as new", () => {
    expect(
      resolveEnquiryLeadStatus({
        threadStatus: "OPEN",
        hasHumanAdmin: false,
        hasOpenFollowUp: false
      })
    ).toBe("NEW");
  });

  it("marks an attended chat without follow-up as ongoing", () => {
    expect(
      resolveEnquiryLeadStatus({
        threadStatus: "OPEN",
        hasHumanAdmin: true,
        hasOpenFollowUp: false
      })
    ).toBe("ONGOING");
  });

  it("marks an open follow-up as follow-up even if already attended", () => {
    expect(
      resolveEnquiryLeadStatus({
        threadStatus: "OPEN",
        hasHumanAdmin: true,
        hasOpenFollowUp: true
      })
    ).toBe("FOLLOW_UP");
  });

  it("marks a closed thread as closed", () => {
    expect(
      resolveEnquiryLeadStatus({
        threadStatus: "CLOSED",
        hasHumanAdmin: true,
        hasOpenFollowUp: true
      })
    ).toBe("CLOSED");
  });
});
