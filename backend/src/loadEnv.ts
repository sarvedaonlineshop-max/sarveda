import path from "path";

import { config as loadDotenv } from "dotenv";

/**
 * Always load `backend/.env` from this package root — not `process.cwd()`.
 * PM2 often starts with cwd = repo root (`~/sarveda`), which made updates to
 * `backend/.env` invisible and Shiprocket looked "still broken" after edits.
 */
const backendRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(backendRoot, ".env") });
