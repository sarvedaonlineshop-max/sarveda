/**
 * Run: cd frontend && npx tsx --test lib/content-meta.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  courseBackgroundUrl,
  coursePosterUrl,
  isDirectCourseVideo
} from "./content-meta";

describe("course media helpers", () => {
  it("uses poster for cards and falls back to the hero image", () => {
    assert.equal(
      coursePosterUrl({
        imageUrl: "https://cdn.example/hero.jpg",
        extra: { posterUrl: "https://cdn.example/poster.jpg" }
      }),
      "https://cdn.example/poster.jpg"
    );
    assert.equal(
      coursePosterUrl({ imageUrl: "https://cdn.example/hero.jpg", extra: {} }),
      "https://cdn.example/hero.jpg"
    );
  });

  it("uses hero for the page background and falls back to the poster", () => {
    assert.equal(
      courseBackgroundUrl({
        imageUrl: "https://cdn.example/hero.jpg",
        extra: { posterUrl: "https://cdn.example/poster.jpg" }
      }),
      "https://cdn.example/hero.jpg"
    );
    assert.equal(
      courseBackgroundUrl({ imageUrl: null, extra: { posterUrl: "https://cdn.example/poster.jpg" } }),
      "https://cdn.example/poster.jpg"
    );
  });

  it("treats uploaded S3 files as direct video and YouTube as embed", () => {
    assert.equal(
      isDirectCourseVideo("https://sarveda-media.s3.amazonaws.com/media/courses/clip.mp4"),
      true
    );
    assert.equal(isDirectCourseVideo("https://www.youtube.com/watch?v=abcdefghijk"), false);
    assert.equal(isDirectCourseVideo("https://youtu.be/abcdefghijk"), false);
  });
});
