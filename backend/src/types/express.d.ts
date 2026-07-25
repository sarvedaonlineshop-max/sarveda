import type { Profile } from "passport-google-oauth20";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        email: string;
        role?: string;
        name?: string;
      };
      complaintUser?: {
        id: string;
        email: string;
        name?: string;
        phone?: string | null;
        avatarUrl?: string;
        complaintRole?: string;
      };
      user?: Profile;
    }
  }
}

export {};
