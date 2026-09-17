# Sarveda — Known Gaps Backlog (deferred fixes)

**Opened:** Sep 17, 2026
**Status:** none of these are fixed. Recorded deliberately so they are not rediscovered from scratch.
**Scope:** customer-message replies, and order-lifecycle items left open after the Sep 17 parcel roll-up work.

These were found by reading the code, not by reproducing each one in production. Severity is my
judgement of blast radius, not a formal rating.

---

## A. Customer messages / admin chat replies

Where a reply goes is decided by `EnquiryThread.source` in
`backend/src/modules/enquiries/enquiries.service.ts:544` — WhatsApp threads go out over Exotel,
**everything else is assumed to be email-reachable**. There is no `EMAIL` source value and no
customer-facing thread view anywhere in the frontend, so for web enquiries the email is the only
way the customer ever sees the answer.

Inbound sources that land in the admin inbox: contact form (`source=CONTACT`), insights panel
(`INSIGHTS`), corporate wellness (`CORPORATE`), course enquiry (`COURSE`), event enquiry (`EVENT`),
WhatsApp webhook (`WHATSAPP`).

### A1. Reply row is saved before the email is sent — HIGH

`enquiries.service.ts:645` creates the `EnquiryMessage`; `sendMail` is only called at
`enquiries.service.ts:703`. If SMTP throws, the row is already committed. The admin sees one error
toast, but reopening the thread shows a normal sent bubble that is indistinguishable from a
delivered reply. Nobody can tell afterwards which replies actually went out.

Contrast: the WhatsApp branch sends **first** and writes the row after (`:586` then `:602`), which is
the correct ordering.

**Fix direction:** send first, then persist — matching the WhatsApp branch. Or persist with an
explicit `pending`/`failed` delivery state and surface it in the UI.

### A2. No retry and no queue on reply email — HIGH

The reply path calls `sendMail` directly, once. Order emails go through BullMQ with a dedupe key and
`sendMailWithRetry` (`backend/src/modules/notifications/email.ts:892`). A transient SMTP blip on a
reply is permanent, silent loss. Compounds A1.

**Fix direction:** route replies through the same queue as order mail.

### A3. No delivery indicator on email threads — MEDIUM

Ticks are gated on WhatsApp only: `{isAdmin && isWhatsApp ? <WaTicks .../> : null}` in
`frontend/app/admin/chats/[id]/page.tsx:878`. Email threads show a timestamp and nothing else. SMTP
acceptance is not inbox delivery, so bounces (including plain typos in the address, which is only
format-validated at `enquiries.routes.ts:27`) are invisible to the admin.

### A4. Customer email replies never return to the thread — MEDIUM

The reply email sets `replyTo: CARE_INBOX_EMAIL` (default `care@sarveda.com`). There is **no inbound
email parsing anywhere** — no SendGrid Inbound Parse route, no IMAP poller, no mailparser dependency.
When the customer hits Reply, it lands in that mailbox and the admin inbox never learns about it.
Every web enquiry is one-way after the first reply; whoever answers must watch a separate mailbox
or the conversation dies.

### A5. WhatsApp sends with a null sid are stuck as "sent" forever — LOW

`waStatus: "sent"` is hard-coded at write time (`enquiries.service.ts:611`) and delivery receipts
match on `waMessageSid`. If Exotel returns no sid, no status update can ever match, so a failure
can never surface as "Not delivered".

The 24-hour session window itself is handled correctly — it is checked *before* anything is written
(`enquiries.service.ts:550`), so a closed window is a visible error, not a phantom send.

### A6. On-site `/chat` widget messages are never stored — MEDIUM

`backend/src/modules/chat/chat.service.ts` builds a prompt, calls the LLM, returns a reply and
persists **nothing**. A customer asking a real question there is never seen by a human. If
`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is unset they get "Live AI is not enabled on this server yet"
and the message is discarded.

### A7. Blog comments have no admin surface and no notification — LOW

`backend/src/modules/blog/blog.comments.ts:72` writes the `BlogComment` row and logs. Nothing
notifies an admin and there is no moderation screen.

### Not a bug, for the record

SMTP is configured and healthy in production (transporter up, 30 send attempts, zero failures in
recent pm2 logs). Recent usage is 23 WhatsApp replies against 1 email reply, so A1–A3 are currently
low-frequency — but that is luck, not protection.

---

## B. Order lifecycle — open items after the Sep 17 roll-up work

Fixed on Sep 17 (for context, do not re-investigate): label cancellation now walks `Order.status`
back; carrier tracking now rolls up across all parcels via `rollUpOrderFromShipments`; customer
surfaces list every parcel; admin orders list shows a derived stage label.

### B1. Admin can set SHIPPED/PACKED with no label, and it writes no history — HIGH

`backend/src/modules/admin/admin.handlers.ts:1665` is a bare
`prisma.order.update({ data: { status } })`. `DELIVERED` and `CANCELLED` are correctly routed through
their services, but `PROCESSING` / `PACKED` / `SHIPPED` fall through to this blind update:

- no `OrderStatusHistory` row is written, so there is no audit trail
- no check that a shipment label exists before claiming SHIPPED

This is how SRV-20260900007 reached SHIPPED with no history rows at all. The new derived badge now
shows the honest stage instead of repeating the claim, so it is visible rather than hidden — but the
hole is still open.

**Fix direction:** write history on every transition; require a forward label before SHIPPED.

### B2. Return window starts from the earliest parcel, not the latest — MEDIUM

`resolveDeliveredAt` in `backend/src/modules/orders/order-service-request.service.ts:86` sorts
shipment `deliveredAt` ascending and takes `[0]`. On a multi-parcel order the customer's 7-day
window therefore starts when the *first* box lands. If boxes arrive two days apart they silently
lose two days.

**Fix direction:** take the latest delivery across owed forward parcels.

### B3. `/track/[awb]` shows only the parcel you clicked — LOW

No sibling-parcel links, so a customer who follows one tracking link cannot reach the other boxes
from there. The account page and order lookup do now list all parcels.

### B4. WhatsApp order-number lookup — LOW

Typing an order number into WhatsApp still returns the menu. The customer has to tap
"Track my order" and pick from the list.

### B5. Paid-pipeline status array duplicated in ~11 places — MEDIUM (latent)

`["PAID","PROCESSING","PACKED","SHIPPED","DELIVERED"]` is copy-pasted rather than shared (one copy
at `admin.handlers.ts:1594`). Nothing is broken today, but a future status change will silently drop
orders out of revenue reporting and accounting with no error raised.

**Fix direction:** one exported constant, all call sites import it.

### B6. Three different definitions of "is this a return leg" — LOW

- admin orders list filters on `direction !== "REVERSE"` only
- `customerParcels` uses direction plus a courier-name check
- `rollUpOrderFromShipments` uses direction plus `kind`

They agree today. They will not stay agreeing.

### B7. Replacement shipments feed the admin desk badge — LOW

The admin list filter excludes only `REVERSE`, so a `REPLACEMENT` leg is counted. Impact is currently
nil because `adminOrderStageLabel` returns early on `DELIVERED` and replacements only exist after
delivery — but the filter is wrong in principle.

### B8. No server-side state machine — MEDIUM (latent)

Transition validity is enforced in the frontend ladder only. Any direct API call can move an order
anywhere the handler does not explicitly block.

---

## C. Testing

The backend suite does not run on the dev machine — 145 failures, identical with and without recent
changes, caused by the local test database missing a table from a recent migration. **There is no
working regression net right now.** The Sep 17 roll-up logic was verified by building throwaway
orders with each parcel combination directly in the local dev DB and asserting the outcome (10/10
scenarios passed), then deleting them — a manual check, not a permanent guard.

Getting the test DB migrated so the suite runs again gates the confidence of everything above.
