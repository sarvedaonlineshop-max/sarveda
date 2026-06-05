import { Router } from "express";
import { z } from "zod";

import { logger } from "../../config/logger";
import { validateBody } from "../../middleware/validate";
import { sendMail } from "../notifications/email";

const router = Router();

const corporateSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  message: z.string().min(1).max(5000)
});

const courseEnquirySchema = z.object({
  email: z.string().email().max(200),
  courseTitle: z.string().min(1).max(500),
  courseUrl: z.string().url().max(2000),
  message: z.string().min(1).max(5000)
});

router.post(
  "/corporate",
  validateBody(corporateSchema),
  async (req, res, next) => {
    try {
      const { name, email, phone, message } = req.body as z.infer<typeof corporateSchema>;
      const to = process.env.CORPORATE_CONTACT_EMAIL?.trim() || "care@sarveda.com";
      const subject = `Corporate Wellness enquiry from ${name}`;
      const html = `<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Phone:</strong> ${phone || "—"}</p>
<p><strong>Message:</strong></p><p>${message.replace(/\n/g, "<br/>")}</p>`;
      const text = `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\n\n${message}`;

      await sendMail(to, subject, html, text, email);
      logger.info("corporate_contact_submitted", { email });
      res.json({
        success: true,
        data: { message: "Thank you — we will reply within 24 hours." }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/course-enquiry",
  validateBody(courseEnquirySchema),
  async (req, res, next) => {
    try {
      const { email, courseTitle, courseUrl, message } = req.body as z.infer<
        typeof courseEnquirySchema
      >;
      const to = process.env.ENQUIRY_CONTACT_EMAIL?.trim() || "care@sarveda.com";
      const subject = `Course enquiry: ${courseTitle}`;
      const html = `<p><strong>From:</strong> ${email}</p>
<p><strong>Course:</strong> ${courseTitle}</p>
<p><strong>Page:</strong> <a href="${courseUrl}">${courseUrl}</a></p>
<p><strong>Message:</strong></p><p>${message.replace(/\n/g, "<br/>")}</p>`;
      const text = `From: ${email}\nCourse: ${courseTitle}\nPage: ${courseUrl}\n\n${message}`;

      await sendMail(to, subject, html, text, email);
      logger.info("course_enquiry_submitted", { email, courseTitle });
      res.json({
        success: true,
        data: { message: "Thank you — we will reply shortly." }
      });
    } catch (err) {
      next(err);
    }
  }
);

export const contactRoutes = router;
