import type { Profile } from "passport-google-oauth20";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        email: string;
        role?: string;
      };
      user?: Profile;
    }
  }
}

export {};
