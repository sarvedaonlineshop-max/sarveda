import { corporateThemeAsset } from "@/lib/media-cdn";
import { SARVEDA_WHATSAPP_E164 } from "./enquiry";

const c = corporateThemeAsset;

export const CORPORATE_IMG = {
  programs: {
    sahyog: c("corporate/prayog.jpg"),
    sargam: c("corporate/vibe.png"),
    samatva: c("corporate/fares.jpg"),
    samsara: c("corporate/earth.jpg")
  },
  weeklyIcon: c("corporate/weekly_icon.png"),
  monthlyIcon: c("corporate/monthly_icon.png"),
  customizedIcon: c("corporate/customized_icon.png"),
  retreat: c("corporate/retreat_1.jpg"),
  holistic: c("corporate/holistic_approach_to_wellness.jpg"),
  pillarPhysical: c("img-001.svg"),
  pillarEmotional: c("img-002.svg"),
  pillarMental: c("img-003.svg"),
  gallery: [
    c("corporate/gallery/masnory-01.jpg"),
    c("corporate/gallery/masnory-02.jpg"),
    c("corporate/gallery/masnory-03.jpg"),
    c("corporate/gallery/masnory-04.jpg"),
    c("corporate/gallery/masnory-05.jpg"),
    c("corporate/gallery/masnory-06.jpg")
  ],
  star: c("star.svg"),
  mailIcon: c("mail-icon.svg"),
  phoneIcon: c("phone-icon.svg"),
  testimonialVaishali: c("testimonial/Vaishali.jpeg"),
  testimonialVinod: c("testimonial/Vinod.jpeg")
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
  { name: "Arjun", role: "Sound therapist and Multi-instrumentalist", image: c("facilitatos/Arjun.jpg") },
  { name: "Priya", role: "Yoganidra Expert", image: c("facilitatos/Priya.jpg") },
  { name: "Chetan", role: "Mudgar Swing", image: c("facilitatos/Chetan.jpg") },
  { name: "Tejal Rathod", role: "Sound and meditation therapist", image: c("facilitatos/tejal_rathod.jpg") },
  { name: "Saloni", role: "Terrarium workshop", image: c("facilitatos/Saloni.jpg") },
  { name: "Vivek", role: "Breathwork and Animal Flow", image: c("facilitatos/Vivek.jpg") },
  { name: "Saatvika", role: "EFT and Inner Child Healing", image: c("facilitatos/Saatvika.jpg") },
  { name: "Xenkat", role: "Drum Circle", image: c("facilitatos/Xenkat.jpg") },
  { name: "Riya", role: "Yoga", image: c("facilitatos/Riya.jpg") }
] as const;

export const CORPORATE_PARTNER_LOGOS = [
  { src: c("t-logo-8.png"), alt: "Partner" },
  { src: c("t-logo-9.svg"), alt: "Publicis Groupe" },
  { src: c("t-logo-10.webp"), alt: "The Times Group" },
  { src: c("Veeam_logo.png"), alt: "Veeam" },
  { src: c("paypal_logo.png"), alt: "PayPal" },
  { src: c("t-logo-12.svg"), alt: "Rotary" },
  { src: c("t-logo-13.jpeg"), alt: "Partner" },
  { src: c("t-logo-14.png"), alt: "Partner" }
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

const primaryPhoneDisplay = `+91 ${SARVEDA_WHATSAPP_E164.replace(/^91/, "")}`;

export const CORPORATE_CONTACT = {
  emails: ["care@sarveda.com", "vivek@sarveda.com", "arjun@sarveda.com"],
  phones: [primaryPhoneDisplay] as const
};
