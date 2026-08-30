import { Router } from "express";
import { z } from "zod";

import { logger } from "../../config/logger";
import { optionalAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createEnquiryThread } from "../enquiries/enquiries.service";

const router = Router();

const corporateSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  message: z.string().min(1).max(5000)
});

const courseEnquirySchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional(),
  courseTitle: z.string().min(1).max(500),
  courseUrl: z.string().url().max(2000),
  message: z.string().min(1).max(5000)
});

const supportSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  subject: z.string().max(200).optional(),
  subjectCategory: z.enum(["ORDER", "PAYMENT", "PRODUCT", "COURSE", "CORPORATE", "OTHER"]).optional(),
  message: z.string().min(1).max(5000),
  orderNumber: z.string().max(40).optional()
});

const newsletterSchema = z.object({
  email: z.string().email().max(200),
  source: z.string().max(60).optional()
});

router.post(
  "/corporate",
  validateBody(corporateSchema),
  async (req, res, next) => {
    try {
      const { name, email, phone, message } = req.body as z.infer<typeof corporateSchema>;
      const thread = await createEnquiryThread({
        source: "CORPORATE",
        subjectCategory: "CORPORATE",
        customerName: name,
        customerEmail: email,
        customerPhone: phone ?? null,
        message
      });
      logger.info("corporate_contact_submitted", { email, threadId: thread.id });
      res.json({
        success: true,
        data: { id: thread.id, message: "Thank you — we will reply within 24 hours." }
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
      const body = req.body as z.infer<typeof courseEnquirySchema>;
      const thread = await createEnquiryThread({
        source: "COURSE",
        subjectCategory: "COURSE",
        customerName: body.name?.trim() || body.email.split("@")[0] || "Guest",
        customerEmail: body.email,
        message: body.message,
        contextTitle: body.courseTitle,
        contextUrl: body.courseUrl
      });
      logger.info("course_enquiry_submitted", {
        email: body.email,
        courseTitle: body.courseTitle,
        threadId: thread.id
      });
      res.json({
        success: true,
        data: { id: thread.id, message: "Thank you — we will reply shortly." }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/support",
  optionalAuth,
  validateBody(supportSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof supportSchema>;
      const orderNumber = body.orderNumber?.trim() || null;
      const thread = await createEnquiryThread({
        source: "CONTACT",
        subjectCategory: body.subjectCategory ?? (orderNumber ? "ORDER" : "OTHER"),
        customSubject: body.subject?.trim() || null,
        customerName: body.name.trim(),
        customerEmail: body.email.trim(),
        customerPhone: body.phone?.trim() || null,
        message: body.message.trim(),
        orderNumber,
        userId: req.authUser?.id ?? null
      });
      logger.info("support_contact_submitted", {
        email: body.email,
        orderNumber,
        submissionId: thread.id
      });
      res.json({
        success: true,
        data: {
          id: thread.id,
          message: "Thank you — we received your message and will reply shortly."
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/newsletter",
  validateBody(newsletterSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof newsletterSchema>;
      const { subscribeNewsletter } = await import("../newsletter/newsletter.service");
      const result = await subscribeNewsletter({
        email: body.email,
        source: body.source
      });
      logger.info("newsletter_subscribed_via_contact", {
        email: body.email.trim().toLowerCase(),
        created: result.created,
        alreadySubscribed: result.alreadySubscribed
      });
      res.json({
        success: true,
        data: {
          ...result,
          message: result.alreadySubscribed
            ? "You're already on our list — thank you."
            : "Welcome to the Sarveda community."
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

export const contactRoutes = router;
