/**
 * About page — redesigned section copy (Aug/Sep 2026 brand narrative).
 * Photo assets live under /public/images/about/.
 */

export const aboutPage = {
  metaTitle: "About Sarveda — Instruments, Learning & Experiences",
  metaDescription:
    "Tools, knowledge and experiences for the journey within. Sarveda brings together instruments, learning, experiences and wellbeing from Mysore, India.",
  hero: {
    eyebrow: "About",
    title: "Sarveda",
    tagline: "Tools, knowledge and experiences for the journey within.",
    intro:
      "Sarveda brings together instruments, learning, experiences and wellbeing to inspire exploration, creativity and a deeper relationship with ourselves.",
    image: {
      src: "/images/about/hero-mysore-warehouse.jpg",
      alt: "Sarveda Mysore warehouse — singing bowls, handpans and instrument collection"
    }
  },
  story: {
    eyebrow: "Our story",
    title: "Born from exploration",
    paragraphs: [
      "Founded in 2021 by Arjun Arora, Sarveda grew from a personal exploration of music, philosophy, yoga and mindful living into a platform for instruments, learning and experiences.",
      "From our facility in Mysore, we curate and develop a wide range of sound and musical instruments and mindful-living products, working with craftspeople, makers and specialist manufacturers in India and internationally.",
      "Alongside this, we collaborate with musicians, facilitators, teachers and practitioners to create courses, workshops, retreats, performances and wellbeing experiences.",
      "The intention remains the same as when we began: to create meaningful tools and experiences that encourage exploration — within and beyond."
    ]
  },
  whatWeDo: {
    eyebrow: "What we do",
    items: [
      {
        key: "instruments",
        title: "Instruments & Mindful Living",
        body: "Curated sound and musical instruments, yoga and meditation accessories, and tools for practitioners, musicians and explorers worldwide.",
        href: "/store"
      },
      {
        key: "learning",
        title: "Learning",
        body: "Courses and certification programs across sound therapy, music, yoga, meditation and related practices — online and in person.",
        href: "/courses"
      },
      {
        key: "experiences",
        title: "Experiences",
        body: "Workshops, retreats, sound experiences, performances and gatherings created with artists and facilitators.",
        href: "/events"
      },
      {
        key: "organisations",
        title: "Wellbeing for Organisations",
        body: "Sound, mindfulness, yoga and creative wellbeing programs for companies, hotels, spas, retreats and other organisations.",
        href: "/corporate-wellness"
      }
    ]
  },
  founder: {
    eyebrow: "Meet the founder",
    name: "Arjun Arora",
    role: "Founder, Sarveda",
    image: {
      src: "/images/about/founder-arjun-instruments.jpg",
      alt: "Arjun Arora, founder of Sarveda, seated among sound instruments"
    },
    paragraphs: [
      "An engineering graduate from IIT Madras, musician, yoga practitioner and lifelong explorer, Arjun's journey has moved through startups, music, philosophy and an enduring curiosity about the inner workings of human experience.",
      "Sarveda emerged from this exploration — as a space where instruments, knowledge and experiences come together to support deeper understanding, creativity and wellbeing."
    ],
    closing:
      "For Arjun, Sarveda is less about arriving at answers and more about staying curious and creating opportunities to explore."
  },
  team: {
    eyebrow: "Our team",
    title: "The people behind Sarveda",
    paragraphs: [
      "Sarveda is built by a team working across product development, quality, operations, customer experience, design, education, content and partnerships.",
      "Our Mysore team works alongside a wider network of craftspeople, musicians, practitioners, educators and collaborators across India and internationally."
    ],
    image: {
      src: "/images/about/team-mysore.jpg",
      alt: "The Sarveda team"
    },
    caption: "The Sarveda team."
  },
  guides: {
    eyebrow: "What guides us",
    items: [
      {
        key: "quality",
        title: "Quality through continuous improvement",
        body: "We listen, learn and improve — from our instruments and courses to customer support and experiences."
      },
      {
        key: "craft",
        title: "Respect for craft",
        body: "We value the makers, musical traditions and knowledge behind every instrument while continuing to explore new ideas from around the world."
      },
      {
        key: "collaboration",
        title: "Learning through collaboration",
        body: "We work with musicians, practitioners, artists and thinkers to bring different perspectives and experiences together."
      },
      {
        key: "curiosity",
        title: "Creativity & Curiosity",
        body: "Music, movement, art and exploration are fundamental expressions of being human. Curiosity remains at the heart of what we do."
      }
    ]
  },
  journey: {
    title: "An evolving journey",
    body: "Sarveda continues to expand, explore and create — bringing together tools, knowledge and experiences that inspire the journey within.",
    ctas: [
      { label: "Explore Instruments", href: "/store" },
      { label: "Explore Courses & Experiences", href: "/courses" },
      { label: "Work With Sarveda", href: "/corporate-wellness" }
    ]
  }
} as const;
