/**
 * Unit tests for All-tab chat inbox status, attending, source, and sort.
 * Run: cd frontend && npx tsx --test lib/chat-lead-history.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAllInboxRowMeta, compareThreadsForAllInbox } from "./chat-lead-history";

describe("buildAllInboxRowMeta", () => {
  it("shows New and source, without attending", () => {
    const meta = buildAllInboxRowMeta({
      source: "WHATSAPP",
      status: "OPEN"
    });
    assert.equal(meta.status, "NEW");
    assert.equal(meta.statusLabel, "New");
    assert.equal(meta.attendingName, null);
    assert.equal(meta.sourceLabel, "WhatsApp");
  });

  it("shows Ongoing, attending, and source", () => {
    const meta = buildAllInboxRowMeta({
      source: "CONTACT",
      status: "OPEN",
      lastAdminName: "Sowmya"
    });
    assert.equal(meta.statusLabel, "Ongoing");
    assert.equal(meta.attendingName, "Sowmya");
    assert.equal(meta.sourceLabel, "Contact");
  });

  it("shows Follow-up, attending, and source", () => {
    const meta = buildAllInboxRowMeta({
      source: "INSIGHTS",
      status: "OPEN",
      lastAdminName: "Prem",
      hasOpenFollowUp: true
    });
    assert.equal(meta.statusLabel, "Follow-up");
    assert.equal(meta.attendingName, "Prem");
    assert.equal(meta.sourceLabel, "Insights");
  });

  it("omits Closed because that status is understood", () => {
    const meta = buildAllInboxRowMeta({
      source: "WHATSAPP",
      status: "CLOSED",
      lastAdminName: "Arjun"
    });
    assert.equal(meta.status, "CLOSED");
    assert.equal(meta.statusLabel, null);
    assert.equal(meta.attendingName, "Arjun");
    assert.equal(meta.sourceLabel, "WhatsApp");
  });
});

describe("compareThreadsForAllInbox", () => {
  it("orders New, Ongoing, Follow-up, then Closed, each newest first", () => {
    const closedOld = {
      id: "closed-old",
      lastMessageAt: "2026-09-20T10:00:00.000Z",
      status: "CLOSED",
      lastAdminName: "Arjun"
    };
    const followNew = {
      id: "follow-new",
      lastMessageAt: "2026-09-23T12:00:00.000Z",
      status: "OPEN",
      lastAdminName: "Prem",
      hasOpenFollowUp: true
    };
    const newOld = {
      id: "new-old",
      lastMessageAt: "2026-09-21T09:00:00.000Z",
      status: "OPEN"
    };
    const ongoingNew = {
      id: "ongoing-new",
      lastMessageAt: "2026-09-23T18:00:00.000Z",
      status: "OPEN",
      lastAdminName: "Sowmya"
    };
    const newRecent = {
      id: "new-recent",
      lastMessageAt: "2026-09-23T20:00:00.000Z",
      status: "OPEN"
    };
    const ongoingOld = {
      id: "ongoing-old",
      lastMessageAt: "2026-09-22T08:00:00.000Z",
      status: "OPEN",
      lastAdminName: "Priya"
    };
    const closedNew = {
      id: "closed-new",
      lastMessageAt: "2026-09-23T21:00:00.000Z",
      status: "CLOSED",
      lastAdminName: "Arjun"
    };

    const sorted = [
      closedOld,
      followNew,
      newOld,
      ongoingNew,
      newRecent,
      ongoingOld,
      closedNew
    ].sort(compareThreadsForAllInbox);

    assert.deepEqual(
      sorted.map((t) => t.id),
      ["new-recent", "new-old", "ongoing-new", "ongoing-old", "follow-new", "closed-new", "closed-old"]
    );
  });
});
