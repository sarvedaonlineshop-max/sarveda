import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCorsOrigins,
  isAllowedCorsOrigin,
  isSarvedaVercelFrontendOrigin
} from "../../src/config/corsOrigins";

describe("corsOrigins", () => {
  it("allows exact allowlist origins", () => {
    assert.equal(
      isAllowedCorsOrigin("https://sarveda-demo.xyz", ["https://sarveda-demo.xyz"]),
      true
    );
  });

  it("allows rotating Vercel preview hosts for sarveda-frontend", () => {
    assert.equal(
      isSarvedaVercelFrontendOrigin("https://sarveda-frontend-p8we2zs01-sarveda.vercel.app"),
      true
    );
    assert.equal(
      isSarvedaVercelFrontendOrigin(
        "https://sarveda-frontend-git-admin-dark-theme-polish-sarveda.vercel.app"
      ),
      true
    );
    assert.equal(isSarvedaVercelFrontendOrigin("https://sarveda-frontend.vercel.app"), true);
    assert.equal(
      isAllowedCorsOrigin("https://sarveda-frontend-p8we2zs01-sarveda.vercel.app", []),
      true
    );
  });

  it("rejects unrelated vercel / third-party origins", () => {
    assert.equal(isSarvedaVercelFrontendOrigin("https://evil-app.vercel.app"), false);
    assert.equal(isSarvedaVercelFrontendOrigin("https://sarveda-frontend.evil.com"), false);
    assert.equal(isAllowedCorsOrigin("https://evil-app.vercel.app", []), false);
  });

  it("getCorsOrigins includes production staging defaults when NODE_ENV=production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const origins = getCorsOrigins();
      assert.ok(origins.includes("https://sarveda-demo.xyz"));
      assert.ok(origins.includes("https://sarveda-frontend.vercel.app"));
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
