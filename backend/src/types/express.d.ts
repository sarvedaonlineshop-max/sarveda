import type { Profile } from "passport-google-oauth20";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        email: string;
        role?: string;
      };
      complaintUser?: {
        email: string;
        name?: string;
      };
      user?: Profile;
    }
  }
}

export {};
