# CRM — tonight’s build list

Noted 5 Oct 2026. Built the same day. CRM still does not email or WhatsApp anyone. The 64 signup leads were not imported.

## Gaps

1. **Sales pipeline.** The first time an admin opens CRM pipelines, the empty Sales Pipeline is created: New Opportunity, Qualified, Proposal / Quotation, Negotiation, Won, Lost. Convert uses that pipeline.
2. **Lead follow-up.** The lead screen can set Contacted, Qualified, Unqualified, or Lost, and can save a call, email, WhatsApp, or note. Saving a note does not send a message.
3. **Follow-up task.** The lead screen can add a task. The Tasks page can still mark it complete.
4. **Website account.** Convert links the new contact to the shopper account when the email matches a customer and that account is not already linked.
5. **Chats on Customer 360.** Contact and company pages list matching chats and open them.
6. **Messages stay in Chats.** CRM does not send email or WhatsApp.

## Chats and CRM — link them, do not merge them

Chats stay the inbox. CRM stays the sales list. A chat already has name, email, phone, and sometimes a WhatsApp number and a website user. A lead already has a slot for one chat (`enquiryThreadId`, one lead per thread).

- On a chat: **Create lead** opens the CRM form with name, mobile, email, WhatsApp, source, and the chat subject already filled. Saving stores that chat on the lead. If a lead already exists, the button is **Open lead**.
- On the lead: **Open chat** returns to the same thread.
- Do not create a lead for every chat. Order and payment threads are support. Product, course, corporate, and WhatsApp sales threads are the ones to turn into leads.
- The 64 website signups who never paid are a separate list. They are not chats. Creating those leads does not depend on this link.

## Left alone

Shop orders, stock, payments, and the existing chat inbox stay as they are. Won in the pipeline does not place an order.
