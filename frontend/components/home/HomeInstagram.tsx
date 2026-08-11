import Image from "next/image";

/**
 * Homepage Instagram strip — mockup heading + live sarveda.com post links/media.
 */

const PROFILE_URL = "https://www.instagram.com/sarveda.shaala/";

function Flourish() {
  return (
    <svg viewBox="0 0 120 20" className="mx-auto mt-3 h-4 w-28 text-brand-gold" fill="none" aria-hidden>
      <path
        d="M8 10h28M84 10h28M52 10c-6-8 6-8 0 0 6 8-6 8 0 0M60 10c-6-8 6-8 0 0 6 8-6 8 0 0M68 10c-6-8 6-8 0 0 6 8-6 8 0 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="60" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

const POSTS = [
  {
    href: "https://www.instagram.com/reel/DbqP9IJARLF/",
    src: "/images/home/instagram/post-1.jpg",
    type: "VIDEO" as const,
    alt: "Wind chimes reel — If wind had a sound, this would be it"
  },
  {
    href: "https://www.instagram.com/p/DbaqkTRxjfu/",
    src: "/images/home/instagram/post-2.jpg",
    type: "IMAGE" as const,
    alt: "New Arrivals — Tuned Pipe, wind chimes and Guiro"
  },
  {
    href: "https://www.instagram.com/p/DbTJwLRAbT0/",
    src: "/images/home/instagram/post-3.jpg",
    type: "IMAGE" as const,
    alt: "Nada Chikitsa — Cosmic Hum Sound Bath with Vinayak Honnavar & Sangha"
  },
  {
    href: "https://www.instagram.com/reel/Da2huQOgGBg/",
    src: "/images/home/instagram/post-4.jpg",
    type: "VIDEO" as const,
    alt: "Frequency made visible — singing bowl cymatics reel"
  },
  {
    href: "https://www.instagram.com/p/DZulYuOgemF/",
    src: "/images/home/instagram/post-5.jpg",
    type: "IMAGE" as const,
    alt: "Sound Healing Experience with Gani"
  },
  {
    href: "https://www.instagram.com/p/DZsABLIjecS/",
    src: "/images/home/instagram/post-6.jpg",
    type: "CAROUSEL_ALBUM" as const,
    alt: "Sound Therapy Fundamentals — 8-session live online course"
  },
  {
    href: "https://www.instagram.com/p/DZcrZDWDV_U/",
    src: "/images/home/instagram/post-7.jpg",
    type: "CAROUSEL_ALBUM" as const,
    alt: "Did you know sound has a shape? — Cymatics"
  },
  {
    href: "https://www.instagram.com/p/DZU9_9oGFZ3/",
    src: "/images/home/instagram/post-8.jpg",
    type: "CAROUSEL_ALBUM" as const,
    alt: "An Evening of Collective Resonance — gathering at Sarveda warehouse"
  }
];

function PlayIcon() {
  return (
    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
      <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function CarouselIcon() {
  return (
    <span className="absolute right-2 top-2 text-white drop-shadow">
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M7 5h12a1 1 0 011 1v10h-2V8a1 1 0 00-1-1H7V5zm-3 3h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
      </svg>
    </span>
  );
}

export function HomeInstagram() {
  return (
    <section className="bg-white py-14 md:py-16 lg:py-20" aria-labelledby="home-instagram-heading">
      <div className="mx-auto w-[90%] max-w-[1600px] md:w-[80%]">
        <div className="text-center">
          <h2
            id="home-instagram-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-3xl md:text-[2.15rem]"
          >
            Follow us on <span className="text-brand-gold">Instagram</span>
          </h2>
          <Flourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-ink/70 sm:text-[0.95rem]">
            Stay connected with our latest workshops, new arrivals, sound healing insights and
            moments from our growing community.
          </p>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-3 md:mt-10 md:grid-cols-4 md:gap-3">
          {POSTS.map((post) => (
            <li key={post.href}>
              <a
                href={post.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden bg-brand-cream"
                aria-label={post.alt}
              >
                <Image
                  src={post.src}
                  alt={post.alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 20vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
                {post.type === "VIDEO" ? <PlayIcon /> : null}
                {post.type === "CAROUSEL_ALBUM" ? <CarouselIcon /> : null}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-8 text-center md:mt-10">
          <a
            href={PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand-forest px-8 text-sm font-semibold tracking-wide text-brand-cream transition-colors hover:bg-brand-night"
          >
            Follow us on Instagram
            <span aria-hidden>→</span>
          </a>
          <p className="mt-3">
            <a
              href={PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-gold hover:underline"
            >
              @sarveda.shaala
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
