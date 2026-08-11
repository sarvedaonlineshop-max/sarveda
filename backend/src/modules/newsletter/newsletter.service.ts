import { prisma } from "../../config/db";

export async function subscribeNewsletter(input: {
  email: string;
  source?: string;
}): Promise<{ created: boolean; alreadySubscribed: boolean }> {
  const email = input.email.trim().toLowerCase();
  const source = (input.source?.trim() || "homepage").slice(0, 60);

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email }
  });

  if (existing) {
    if (existing.unsubscribedAt) {
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { unsubscribedAt: null, source }
      });
      return { created: true, alreadySubscribed: false };
    }
    return { created: false, alreadySubscribed: true };
  }

  await prisma.newsletterSubscriber.create({
    data: { email, source }
  });
  return { created: true, alreadySubscribed: false };
}
