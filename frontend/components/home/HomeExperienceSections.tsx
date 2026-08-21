import Image from "next/image";
import Link from "next/link";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
import { HomeCoursesEventsCarousel } from "@/components/home/HomeCoursesEventsCarousel";
import { HomeTrustedPartners } from "@/components/home/HomeTrustedPartners";
import type { CourseListItem } from "@/lib/course-types";
import type { EventListItem } from "@/lib/event-types";

const HOME_GREEN = "#166D46";

type Props = {
  courses: CourseListItem[];
  events: EventListItem[];
};

function LotusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-gold" fill="none" aria-hidden>
      <path
        d="M12 20c-2-3-5-5-5-9 2 1 4 1 5 0 1 1 3 1 5 0 0 4-3 6-5 9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 11c-1-3 0-6 0-6s1 3 0 6ZM7 12c-3-2-4-5-4-5s3 1 4 5ZM17 12c3-2 4-5 4-5s-3 1-4 5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeExperienceSections({ courses, events }: Props) {
  return (
    <>
      <HomeCoursesEventsCarousel courses={courses} events={events} />

      <section
        className="bg-white py-14 md:py-16 lg:py-20"
        aria-labelledby="home-corporate-heading"
      >
        <div className="page-shell grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-gold sm:text-xs">
              <LotusIcon />
              Corporate Wellness Programs
            </p>
            <h2
              id="home-corporate-heading"
              className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl md:text-[2.25rem]"
            >
              <span style={{ color: HOME_GREEN }}>Wellness that Resonates.</span>
              <br />
              <span className="text-brand-gold">Impact that Lasts.</span>
            </h2>
            <SectionFlourish />
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#4a453c] sm:text-[0.95rem] md:text-base">
              We partner with organizations to create long-term wellness journeys that nurture
              well-being, creativity and connection. From monthly mindfulness sessions to immersive
              retreats, our programs are tailored to your team&apos;s needs.
            </p>
            <Link
              href="/corporate-wellness"
              className="mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold tracking-wide text-white transition-colors hover:brightness-95"
              style={{ backgroundColor: HOME_GREEN }}
            >
              Explore Our Corporate Programs
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="relative w-full">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] shadow-card sm:rounded-[2rem]">
              <Image
                src="/images/home/corporate-wellness.jpg"
                alt="Corporate sound healing and mindfulness session with singing bowls"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      <HomeTrustedPartners />
    </>
  );
}
