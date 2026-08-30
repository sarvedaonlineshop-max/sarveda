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

function LotusMark() {
  return (
    <Image
      src="/images/brand/lotus-mark.png"
      alt=""
      width={22}
      height={17}
      className="h-[14px] w-auto shrink-0 object-contain sm:h-[16px] lg:h-[18px]"
      aria-hidden
    />
  );
}

export function HomeExperienceSections({ courses, events }: Props) {
  return (
    <>
      <HomeCoursesEventsCarousel courses={courses} events={events} />

      <section
        className="bg-white pb-6 pt-6 md:pb-8 md:pt-8 lg:pb-10 lg:pt-10"
        aria-labelledby="home-corporate-heading"
      >
        <div className="page-shell grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-brand-gold sm:text-sm lg:text-[0.95rem] lg:tracking-[0.2em]">
              <LotusMark />
              Corporate Wellness Programs
            </p>
            <h2
              id="home-corporate-heading"
              className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl md:text-[2.25rem] lg:text-[2.65rem] xl:text-[2.85rem]"
            >
              <span style={{ color: HOME_GREEN }}>Wellness that Resonates.</span>
              <br />
              <span className="text-brand-gold">Impact that Lasts.</span>
            </h2>
            <SectionFlourish />
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#4a453c] sm:text-[0.95rem] md:text-base lg:mt-6 lg:max-w-2xl lg:text-[1.1rem] lg:leading-relaxed">
              We partner with organizations to create long-term wellness journeys that nurture
              well-being, creativity and connection. From monthly mindfulness sessions to immersive
              retreats, our programs are tailored to your team&apos;s needs.
            </p>
          </div>

          <div className="relative w-full">
            <div className="relative aspect-[67/46] overflow-hidden rounded-[1.75rem] shadow-card sm:rounded-[2rem]">
              <Image
                src="/images/home/corporate-wellness.png"
                alt="Corporate sound healing and mindfulness session with singing bowls"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover object-center"
              />
            </div>
            <div className="mt-5 flex justify-center lg:mt-6 lg:justify-start">
              <Link
                href="/corporate-wellness"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold tracking-wide text-white transition-colors hover:brightness-95 lg:min-h-[52px] lg:px-9 lg:text-base"
                style={{ backgroundColor: HOME_GREEN }}
              >
                Explore Our Corporate Programs
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <HomeTrustedPartners />
    </>
  );
}
