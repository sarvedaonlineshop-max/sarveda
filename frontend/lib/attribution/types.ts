export type AttributionSourceType =
  | "Direct"
  | "Organic Search"
  | "Referral"
  | "Social"
  | "Paid Search"
  | "Paid Social"
  | "Email"
  | "Other";

export type AttributionTouch = {
  source: string;
  medium: string;
  campaign: string | null;
  referrer: string | null;
  landingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  referringDomain: string | null;
  sourceType: AttributionSourceType;
  capturedAt: string;
};

export type AttributionSessionState = {
  last: AttributionTouch;
  sessionStartedAt: string;
  sessionPageViews: number;
  lastActivityAt: string;
};

export type AttributionCheckoutPayload = {
  sourceType: AttributionSourceType;
  firstSource: string | null;
  firstMedium: string | null;
  firstCampaign: string | null;
  firstReferrer: string | null;
  firstLandingPage: string | null;
  lastSource: string | null;
  lastMedium: string | null;
  lastCampaign: string | null;
  lastReferrer: string | null;
  lastLandingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  referringDomain: string | null;
  landingPath: string | null;
  sessionPageViews: number;
  sessionStartedAt: string;
  capturedAt: string;
};

export const ATTR_FIRST_COOKIE = "sarveda_attr_ft";
export const ATTR_SESSION_KEY = "sarveda_attr_session";
/** ~90 days */
export const ATTR_FIRST_TTL_DAYS = 90;
/** 30 minutes inactivity */
export const ATTR_SESSION_IDLE_MS = 30 * 60 * 1000;
