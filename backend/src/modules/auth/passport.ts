import passport from "passport";
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback
} from "passport-google-oauth20";

import { logger } from "../../config/logger";

export function googleOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function configurePassport(): void {
  if (!googleOAuthConfigured()) {
    logger.warn("google_oauth_not_configured");
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ??
          "http://localhost:5000/api/auth/google/callback"
      },
      (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
        done(null, profile);
      }
    )
  );
}
