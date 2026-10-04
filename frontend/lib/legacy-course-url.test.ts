import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCoursePathToRedirect } from "./legacy-course-url";

describe("legacy course redirects", () => {
  it("sends old course slugs to the nearest published course", () => {
    assert.equal(
      resolveCoursePathToRedirect("/course/sound-therapy"),
      "/course/sound-therapy-fundamentals"
    );
    assert.equal(
      resolveCoursePathToRedirect("/course/sound-therapy-fundamentals-2"),
      "/course/sound-therapy-fundamentals"
    );
    assert.equal(
      resolveCoursePathToRedirect("/course/rhythmic-foundations-for-sound-practitioners"),
      "/course/rhythmic-foundations"
    );
    assert.equal(
      resolveCoursePathToRedirect("/course/moving-beyond-asanas"),
      "/course/yoga-therapy-course"
    );
  });

  it("leaves the live course slug and unknown courses alone", () => {
    assert.equal(resolveCoursePathToRedirect("/course/sound-therapy-fundamentals"), null);
    assert.equal(resolveCoursePathToRedirect("/course/no-such-course"), null);
    assert.equal(resolveCoursePathToRedirect("/courses"), null);
  });
});
