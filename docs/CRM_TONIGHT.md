# CRM — tonight’s build list

Noted 5 Oct 2026. Do not treat this as done. The live CRM is empty and does not email or WhatsApp anyone.

## Gaps still to build

1. **Sales pipeline must exist before Convert.** There is no button to create it. The first Convert lead fails until the default pipeline is seeded: New Opportunity, Qualified, Proposal / Quotation, Negotiation, Won, Lost.
2. **Lead follow-up on the lead screen.** No buttons to set Contacted, Qualified, Unqualified, or Lost, and no place to type a call, email, or WhatsApp note. The API can do this. The screen cannot.
3. **Add a task from the lead.** Tasks can only be marked complete on the Tasks page. There is no “add follow-up” button.
4. **Link the CRM contact to the website account** on convert, so Customer 360 can show that person’s orders. Convert today creates a contact and does not set `linkedUserId`.
5. **Show chats on Customer 360.** The contact API already finds enquiry threads by email or linked user. The page does not show them.
6. **Do not send messages from CRM yet.** Email and WhatsApp stay in the tools the team already uses. CRM only keeps the record.

## Chats and CRM — link them, do not merge them

Chats stay the inbox. CRM stays the sales list. A chat already has name, email, phone, and sometimes a WhatsApp number and a website user. A lead already has a slot for one chat (`enquiryThreadId`, one lead per thread).

Build this, not a second copy of the inbox:

- On a chat: **Create lead**, copying name, email, and phone, and storing that chat on the lead. If a lead already exists for that chat, open it.
- On the lead: **Open chat**, back to the same thread.
- Do not create a lead for every chat. Order and payment threads are support. Product, course, corporate, and WhatsApp sales threads are the ones to turn into leads.
- The 64 website signups who never paid are a separate list. They are not chats. Creating those leads does not depend on this link.

## Left alone

Shop orders, stock, payments, and the existing chat inbox stay as they are. Won in the pipeline does not place an order.
