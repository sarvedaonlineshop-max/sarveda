import { prisma } from "../../config/db";

export type TestimonialListItem = {
  id: string;
  slug: string;
  authorName: string;
  role: string | null;
  body: string | null;
  imageUrl: string | null;
};

export async function listPublishedTestimonials(limit = 12): Promise<TestimonialListItem[]> {
  return prisma.testimonial.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      authorName: true,
      role: true,
      body: true,
      imageUrl: true
    }
  });
}
