# WhatsApp Flow — Sarveda Support Menu (Exotel + Meta)

Last updated: 2026-08-05

## Purpose
When a customer sends "Hi"/"Hello"/"Namaste" on WhatsApp, the backend replies with a
welcome message + **Menu** button listing the support options.

## Which implementation is live

**Live: interactive button/list bot** (`whatsapp-bot.service.ts`).
Plain WhatsApp interactive messages sent through Exotel. No Flow endpoint, no
signed public key, no connected Meta app, no publish step — so nothing here is
gated on Meta or Exotel approval. Works inside the customer's 24h session window,
which is always the case because the customer messages first.

**Parked: Meta Flow v2** (below). Fully implemented but blocked on Meta signing
our business public key, which needs a token with access to the WABA that Exotel
owns. Kept in the repo in case we want the richer form UI later.

### Bot conversation map
```
"Hi" → main menu (list)
  ├── m:orders → order list → o:<id> → details + issue list
  │                → i:<id>:<code> → apology → feedback buttons
  │                → f:<id>:<rating> → thank you
  ├── m:track  → order list → t:<id> → details + tracking/AWB
  ├── m:pay    → refund explanation + flag for human
  ├── m:agent  → handoff message + flag for human
  └── m:exit   → goodbye
```
Routing is stateless — each option id carries its own context, so stale buttons
from older messages still resolve correctly.

The bot goes silent when a human is involved: a real admin reply in the last 24h,
or `EnquiryThread.contextTitle = "WhatsApp · live agent requested"`. Sending
"Hi" clears the flag and resumes the bot.

## Meta Flow v1 (published; static)
- **WABA:** Sarveda
- **Flow name:** `sarveda support menu`
- **Flow ID:** `1037332878669898`
- **Status:** Published (v7.3 Flow JSON)
- **First / only screen:** `SUPPORT_MENU` (terminal)
- **Field name:** `support_topic`

### Menu options (RadioButtonsGroup `support_topic`)
| id | title |
|---|---|
| `order_issue` | I have order related issues |
| `payment_issue` | Payment deducted, no order |
| `track_order` | I want to track my order |
| `live_agent` | Chat with a live agent |
| `exit` | Exit |

Footer button: **Continue** → `complete` (all options exit for now).

## Meta Flow v2 (dynamic order support; backend ready, Meta setup pending)
- Flow JSON: `docs/meta-whatsapp-support-dynamic-flow.json`
- Create as **With endpoint** because the published v1 Flow is immutable.
- Endpoint URL: `https://sarveda-demo.xyz/api/whatsapp/flow`
- Order path:
  `SUPPORT_MENU → ORDER_LIST → ORDER_DETAILS → FEEDBACK → THANK_YOU`
- Orders are looked up from the signed WhatsApp-number session token.
- Every selected order is re-authorized against that number server-side.
- Submitted issue + chat rating are stored in the existing admin Chats thread.

## WhatsApp business number
- `EXOTEL_WHATSAPP_FROM=+919972238158` (backend `.env`)
- Frontend `NEXT_PUBLIC_WHATSAPP_NUMBER` must match same digits.

## Exotel send-flow API params (from Meta → Flows → Manage)
- `flow_id` = `1037332878669898`
- `flow_message_version` = `3`
- `flow_action` = `navigate`
- `screen` = `SUPPORT_MENU`
- `flow_cta` = `Menu` (<=20 chars, no emoji)
- `flow_token` = generated and HMAC-signed by the Sarveda backend per customer/session
- `mode` = `published`

## "Hi" trigger — implemented in Sarveda backend (Path B, NOT Exotel chatbot)
Exotel's dashboard has no self-serve keyword bot, so the greeting trigger lives in
our own inbound webhook. No Exotel-team ticket needed.

- On inbound WhatsApp message, `processExotelWhatsAppCallback` stores it, then
  `maybeSendSupportMenu()` checks `isGreeting(body)`:
  `hi / hey / hello / namaste / start / menu / help / options`.
- If greeting → `sendSupportMenuFlow()` sends welcome text + Flow CTA (interactive
  type `flow`) opening Flow `1037332878669898` on screen `SUPPORT_MENU`.
- Debounced 10 min per thread (avoids spam + webhook retries).
- Bot reply recorded in Chats thread as ADMIN author `Sarveda Assistant`.

### Env (backend `.env` / Lightsail)
```
WHATSAPP_SUPPORT_FLOW_ID=1037332878669898
WHATSAPP_SUPPORT_FLOW_SCREEN=SUPPORT_MENU
WHATSAPP_SUPPORT_FLOW_CTA=Menu
WHATSAPP_FLOW_TOKEN_SECRET=<32+ random bytes>
WHATSAPP_FLOW_PRIVATE_KEY_B64=<base64 RSA private key>
# WHATSAPP_WELCOME_TEXT=  (optional override)
```

## Backend WhatsApp (existing, Exotel Cloud API)
- Templates: `backend/src/modules/notifications/whatsapp.ts`
- Inbound webhook: `backend/src/modules/whatsapp/whatsapp.webhook.ts`
  - URL: `https://<host>/api/whatsapp/webhook?token=<EXOTEL_WEBHOOK_TOKEN>`
- Inbox/session send + greeting auto-reply: `backend/src/modules/whatsapp/whatsapp-inbox.service.ts`
- Dynamic Flow endpoint: `backend/src/modules/whatsapp/whatsapp-flow.endpoint.ts`
- Encryption: `backend/src/modules/whatsapp/whatsapp-flow.crypto.ts`
- Order flow + complaint/feedback storage: `backend/src/modules/whatsapp/whatsapp-flow.service.ts`

## TODO
- [x] Implement dynamic order list/details/issue/feedback backend.
- [ ] Deploy current backend changes and configure RSA/token env.
- [ ] Upload the RSA public key for the WhatsApp number in Meta.
- [ ] Create a new **With endpoint** Meta Flow using the v2 JSON; health-check and publish.
- [ ] Change `WHATSAPP_SUPPORT_FLOW_ID` to the newly published v2 Flow ID.
- [ ] Future: implement payment, tracking, and live-agent paths (currently graceful exit).
