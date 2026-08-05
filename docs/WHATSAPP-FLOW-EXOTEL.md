# WhatsApp Flow — Sarveda Support Menu (Exotel + Meta)

Last updated: 2026-08-05

## Purpose
When a customer sends "Hi"/"Hello"/"Namaste" on WhatsApp, Exotel replies with a
welcome message + **Menu** button that opens a published Meta Flow (support menu).

## Meta Flow (published)
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

## WhatsApp business number
- `EXOTEL_WHATSAPP_FROM=+919972238158` (backend `.env`)
- Frontend `NEXT_PUBLIC_WHATSAPP_NUMBER` must match same digits.

## Exotel send-flow API params (from Meta → Flows → Manage)
- `flow_id` = `1037332878669898`
- `flow_message_version` = `3`
- `flow_action` = `navigate`
- `screen` = `SUPPORT_MENU`
- `flow_cta` = `Menu` (<=20 chars, no emoji)
- `flow_token` = generate per business (from Meta Manage panel)
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
# WHATSAPP_WELCOME_TEXT=  (optional override)
```

## Backend WhatsApp (existing, Exotel Cloud API)
- Templates: `backend/src/modules/notifications/whatsapp.ts`
- Inbound webhook: `backend/src/modules/whatsapp/whatsapp.webhook.ts`
  - URL: `https://<host>/api/whatsapp/webhook?token=<EXOTEL_WEBHOOK_TOKEN>`
- Inbox/session send + greeting auto-reply: `backend/src/modules/whatsapp/whatsapp-inbox.service.ts`

## TODO
- [ ] Wire each menu option to a real action (currently all exit):
      order_issue / payment_issue / track_order / live_agent
      (handle the Flow completion `nfm_reply` in the inbound webhook).
- [ ] Confirm `EXOTEL_*` + `WHATSAPP_SUPPORT_FLOW_*` env set on Lightsail backend.
- [ ] Set Exotel inbound webhook URL to `/api/whatsapp/webhook?token=...`.
