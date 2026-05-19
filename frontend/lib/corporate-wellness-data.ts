/** WordPress theme assets — same URLs as sarveda.com/corporate-wellness/ */
const T = "https://sarveda.com/wp-content/themes/sarveda/assets/img";

export const CORPORATE_IMG = {
  programs: {
    sahyog: `${T}/corporate/prayog.jpg`,
    sargam: `${T}/corporate/vibe.png`,
    samatva: `${T}/corporate/fares.jpg`,
    samsara: `${T}/corporate/earth.jpg`
  },
  weeklyIcon: `${T}/corporate/weekly_icon.png`,
  monthlyIcon: `${T}/corporate/monthly_icon.png`,
  customizedIcon: `${T}/corporate/customized_icon.png`,
  retreat: `${T}/corporate/retreat_1.jpg`,
  holistic: `${T}/corporate/holistic_approach_to_wellness.jpg`,
  pillarPhysical: `${T}/img-001.svg`,
  pillarEmotional: `${T}/img-002.svg`,
  pillarMental: `${T}/img-003.svg`,
  gallery: [
    `${T}/corporate/gallery/masnory-01.jpg`,
    `${T}/corporate/gallery/masnory-02.jpg`,
    `${T}/corporate/gallery/masnory-03.jpg`,
    `${T}/corporate/gallery/masnory-04.jpg`,
    `${T}/corporate/gallery/masnory-05.jpg`,
    `${T}/corporate/gallery/masnory-06.jpg`
  ],
  star: `${T}/star.svg`,
  mailIcon: `${T}/mail-icon.svg`,
  phoneIcon: `${T}/phone-icon.svg`,
  testimonialVaishali: `${T}/testimonial/Vaishali.jpeg`,
  testimonialVinod: `${T}/testimonial/Vinod.jpeg`
} as const;

export const CORPORATE_PROGRAMS = [
  {
    name: "SAHYOG",
    subtitle: "Yoga Asanas & Breathwork",
    description:
      "Programs to relieve back and neck pain from sedentary work through tailored yoga and breathwork.",
    href: "/sahyog",
    image: CORPORATE_IMG.programs.sahyog
  },
  {
    name: "SARGAM",
    subtitle: "Sound Baths, Drum Circles & Music",
    description:
      "Sessions provide a relaxing auditory experience with therapeutic sound for stress relief and community connection.",
    href: "/sargam",
    image: CORPORATE_IMG.programs.sargam
  },
  {
    name: "SAMATVA",
    subtitle: "Mindfulness & Awareness",
    description:
      "Mindfulness Meditation sessions reduce stress and build team well-being through guided practices.",
    href: "/samatva",
    image: CORPORATE_IMG.programs.samatva
  },
  {
    name: "SAMSARA",
    subtitle: "Art & Expression Therapy",
    description:
      "Creative sessions like art, terrarium gardening, and clay modeling boost stress relief and teamwork.",
    href: "/samsara",
    image: CORPORATE_IMG.programs.samsara
  }
] as const;

export const CORPORATE_SOLUTIONS = [
  {
    title: "Weekly Program",
    icon: CORPORATE_IMG.weeklyIcon,
    description:
      "Our practitioner visits weekly, offering rotating sessions in yoga, meditation, sound, and art therapy."
  },
  {
    title: "Monthly Program",
    icon: CORPORATE_IMG.monthlyIcon,
    description:
      "Benefit from monthly sessions with a practitioner, keeping experiences fresh and engaging."
  },
  {
    title: "Customized Sessions",
    icon: CORPORATE_IMG.customizedIcon,
    description: "Choose single or multiple sessions to suit your company's needs."
  }
] as const;

export const CORPORATE_FACILITATORS = [
  { name: "Arjun", role: "Sound therapist and Multi-instrumentalist", image: `${T}/facilitatos/Arjun.jpg` },
  { name: "Priya", role: "Yoganidra Expert", image: `${T}/facilitatos/Priya.jpg` },
  { name: "Chetan", role: "Mudgar Swing", image: `${T}/facilitatos/Chetan.jpg` },
  { name: "Tejal Rathod", role: "Sound and meditation therapist", image: `${T}/facilitatos/tejal_rathod.jpg` },
  { name: "Saloni", role: "Terrarium workshop", image: `${T}/facilitatos/Saloni.jpg` },
  { name: "Vivek", role: "Breathwork and Animal Flow", image: `${T}/facilitatos/Vivek.jpg` },
  { name: "Saatvika", role: "EFT and Inner Child Healing", image: `${T}/facilitatos/Saatvika.jpg` },
  { name: "Xenkat", role: "Drum Circle", image: `${T}/facilitatos/Xenkat.jpg` },
  { name: "Riya", role: "Yoga", image: `${T}/facilitatos/Riya.jpg` }
] as const;

export const CORPORATE_PARTNER_LOGOS = [
  { src: `${T}/t-logo-8.png`, alt: "Partner" },
  { src: `${T}/t-logo-9.svg`, alt: "Publicis Groupe" },
  { src: `${T}/t-logo-10.webp`, alt: "The Times Group" },
  { src: `${T}/Veeam_logo.png`, alt: "Veeam" },
  { src: `${T}/paypal_logo.png`, alt: "PayPal" },
  { src: `${T}/t-logo-12.svg`, alt: "Rotary" },
  { src: `${T}/t-logo-13.jpeg`, alt: "Partner" },
  { src: `${T}/t-logo-14.png`, alt: "Partner" }
] as const;

export const CORPORATE_TESTIMONIALS = [
  {
    quote:
      "The Corporate Wellness Program offered by Sarveda for Publicis Groupe was highly appreciated by all our colleagues. The uniqueness of sessions and qualified therapists and facilitators was such a hit that it still gets called out by everyone.",
    author: "Vaishali Ramakrishan",
    role: "Director - Talent and Culture, Publicis Groupe",
    image: CORPORATE_IMG.testimonialVaishali
  },
  {
    quote:
      "Partnering with Sarveda for our wellness initiatives has been a truly transformative experience. Their holistic approach, rooted in Yoga, Ayurveda, and mindfulness, has brought a profound sense of balance and well-being to our team.",
    author: "Vinod",
    role: "Founder, Red Chariots",
    image: CORPORATE_IMG.testimonialVinod
  }
] as const;

export const CORPORATE_CONTACT = {
  emails: ["care@sarveda.com", "vivek@sarveda.com", "arjun@sarveda.com"],
  phones: ["+91 9535975075", "+91 6363608737", "+91 8861568960"]
} as const;
