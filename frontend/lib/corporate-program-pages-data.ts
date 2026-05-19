import { CORPORATE_IMG, CORPORATE_PROGRAMS } from "@/lib/corporate-wellness-data";
import { corporateThemeAsset } from "@/lib/media-cdn";
const c = corporateThemeAsset;


export type ProgramPillar = { title: string; image: string };
export type ProgramContentBlock = {
  title: string;
  body: string;
  image: string;
  imagePosition: "left" | "right";
  background: "#F2FAF8" | "#FFF2E9";
};

export type CorporateProgramPageData = {
  slug: string;
  title: string;
  hero: { banner: string; subtitle: string };
  frameworkIntro: string;
  pillars: ProgramPillar[];
  quoteBlock?: { title: string; paragraphs: string[] };
  sections: ProgramContentBlock[];
};

export const CORPORATE_PROGRAM_SLUGS = ["sahyog", "sargam", "samatva", "samsara"] as const;
export type CorporateProgramSlug = (typeof CORPORATE_PROGRAM_SLUGS)[number];

export function isCorporateProgramSlug(slug: string): slug is CorporateProgramSlug {
  return (CORPORATE_PROGRAM_SLUGS as readonly string[]).includes(slug);
}

/** Cards for “Explore Wellness Programs” carousel — includes retreats + all programs */
export const EXPLORE_WELLNESS_CARDS = [
  {
    name: "RETREATS",
    subtitle: "Explore Programs",
    description:
      "Recharge with our wellness retreats just outside the city, featuring yoga, meditation, sound healing, and organic meals.",
    href: "/retreat",
    image: CORPORATE_IMG.retreat
  },
  ...CORPORATE_PROGRAMS.map((p) => ({ ...p, subtitle: "Explore Programs" }))
];

export const CORPORATE_PROGRAM_PAGES: Record<CorporateProgramSlug, CorporateProgramPageData> = {
  sahyog: {
    slug: "sahyog",
    title: "SAHYOG",
    hero: {
      banner: c("corporate/prayog/banner.jpg"),
      subtitle: "Pranayama, Aasana, and Yoga Tailored for the Modern Workplace"
    },
    frameworkIntro:
      "Our unique SAHYOG framework is inspired by ancient yogic practices specifically designed for today’s modern workspace. This framework is structured around three core elements:",
    pillars: [
      { title: "Pranayama", image: c("corporate/prayog/pranayama.jpg") },
      { title: "Aasana", image: c("corporate/prayog/aasna.jpg") },
      { title: "Yoga", image: c("corporate/prayog/yoga.jpg") }
    ],
    sections: [
      {
        title: "Pranayama or Energetic Breathwork for Clarity and Vitality",
        body: "Our approach provides a scientific understanding of breathing, coupled with practical techniques to harness energy through Pranayama. This foundation empowers individuals to improve focus, reduce stress, and enhance overall vitality.",
        image: c("corporate/prayog/pranayama_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      },
      {
        title: "Mindfully Curated Aasanas for Workplace Health",
        body: "We have carefully selected aasanas that address common workplace-related issues for stiffness of the back and neck, frozen shoulder, and poor posture and lack of movement. These movement exercises are tailored to counteract the effects of prolonged sitting and limited mobility, helping employees maintain better health and improved productivity.",
        image: c("corporate/prayog/aasna_1.jpg"),
        imagePosition: "left",
        background: "#FFF2E9"
      },
      {
        title: "The Power of Alignment Through Yoga",
        body: "Finally, our program emphasizes alignment—not just of physical movements but also of thoughts and emotions. With the right blend of mindful techniques that are a part of our unique SAHYOG program, individuals can achieve balance and regulation in their physical, mental and emotional states, making wellness accessible right in the workplace.",
        image: c("corporate/prayog/yoga_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      }
    ]
  },
  sargam: {
    slug: "sargam",
    title: "SARGAM",
    hero: {
      banner: c("corporate/vibe/banner.jpg"),
      subtitle:
        "SARGAM stands on the 4 pillars of Vibration, Immersion, Balance, and Energy. This framework leverages sound, music and vibration-based modalities like sound baths, drum circles, group singing to enhance relaxation, team cohesion, and overall well-being in the workplace."
    },
    frameworkIntro:
      "Our simple yet powerful techniques such as sound therapy sessions, sound baths, immersive music experiments and drum circles help support employees in building unity, reducing anxiety, and boosting positivity. By boosting energy levels and reducing fatigue, we create a more productive and harmonious work environment:",
    pillars: [
      { title: "Sound Therapy", image: c("corporate/vibe/soundbath.jpg") },
      { title: "Drum Circle", image: c("corporate/vibe/drumcircle.jpg") }
    ],
    sections: [
      {
        title: "Sound Therapy",
        body: "Our simple yet powerful techniques such as sound therapy sessions, sound baths, immersive music experiments and drum circles help support employees in building unity, reducing anxiety, and boosting positivity. By boosting energy levels and reducing fatigue, we create a more productive and harmonious work environment.",
        image: c("corporate/vibe/image2.jpg"),
        imagePosition: "left",
        background: "#FFF2E9"
      },
      {
        title: "Drum Circle",
        body: "We offer various sound-based modalities that foster collaboration, relaxation and also collectively uplift the team’s energy and morale.",
        image: c("corporate/vibe/image1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      }
    ]
  },
  samatva: {
    slug: "samatva",
    title: "SAMATVA",
    hero: {
      banner: c("corporate/fares/banner.jpg"),
      subtitle:
        "Our unique Mindfulness based program, called SAMATVA is tailored for today’s high performing corporate teams to mindfully grow in 5 different dimensions namely, Focus, Awareness, Resilience, Expression, Synergy."
    },
    frameworkIntro:
      "We offer thoughtfully curated mindfulness sessions that empower today’s corporate workforce. By integrating mindfulness into the workplace, we help improve well-being, leading to enhanced performance and productivity. Our sessions are grounded in SAMATVA, a unique approach that focuses on five core pillars essential for both personal and organizational growth:",
    pillars: [
      { title: "Focus", image: c("corporate/fares/focus.jpg") },
      { title: "Awareness", image: c("corporate/fares/awareness.jpg") },
      { title: "Resilience", image: c("corporate/fares/resilience.jpg") },
      { title: "Expression", image: c("corporate/fares/expression.jpg") },
      { title: "Synergy/Collaboration", image: c("corporate/fares/collaboration.jpg") }
    ],
    sections: [
      {
        title: "Focus",
        body: "In an age of constant distractions, it’s critical to regain and sustain concentration. Our mindfulness sessions train employees to tune out distractions through meditative practices, fostering improved focus. An increase in the ability to concentrate for longer periods of time has a direclt correlation critical thinking, clarity and overall performance.",
        image: c("corporate/fares/focus_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      },
      {
        title: "Awareness",
        body: "Mindfulness is rooted in awareness of the present moment. Our sessions are designed to increase self-awareness, improve emotional regulation, and enhance interpersonal connections, helping employees interact more effectively with teams and colleagues.",
        image: c("corporate/fares/awareness_1.jpg"),
        imagePosition: "left",
        background: "#FFF2E9"
      },
      {
        title: "Resilience",
        body: "In the fast-paced corporate world, resilience is essential. We teach employees how to manage stress, recover from setbacks, and stay balanced during periods of high pressure. Our resilience-building practices encourage emotional flexibility and mental toughness, boosting overall well-being.",
        image: c("corporate/fares/resilience_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      },
      {
        title: "Expression",
        body: "Creative self-expression is key to unlocking innovation. Our expressive arts sessions provide a safe space for employees to share ideas, emotions, and insights, encouraging openness and sparking new perspectives that can lead to creative breakthroughs.",
        image: c("corporate/fares/expression_1.jpg"),
        imagePosition: "left",
        background: "#FFF2E9"
      },
      {
        title: "Synergy & Collaboration",
        body: "Mindful collaboration fosters empathy, cooperation, and mutual respect. Our programs focus on building strong, cohesive teams by emphasizing empathy over competition, leading to better communication, stronger relationships, and enhanced team performance.",
        image: c("corporate/fares/collaboration_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      }
    ]
  },
  samsara: {
    slug: "samsara",
    title: "SAMSARA",
    hero: {
      banner: c("corporate/earth/banner.jpg"),
      subtitle: "Expressive Art therapy"
    },
    frameworkIntro:
      "SAMSARA is a unique corporate wellness experience combining art, expression, and movement-based programs to promote mental well-being, creativity, and emotional resilience. These sessions allow participants to explore their inner world through creative practices, helping them de-stress, reconnect, and enhance their overall well-being:",
    pillars: [
      { title: "Art Therapy", image: c("corporate/earth/art.jpg") },
      { title: "Expression", image: c("corporate/earth/expression.jpg") },
      { title: "Movement", image: c("corporate/earth/sharing.jpg") }
    ],
    quoteBlock: {
      title:
        "Creativity ignites transformation, where art and expression become the language of healing and release",
      paragraphs: [
        "At our core, we believe creativity drives transformation. By blending art and expressive activities, we offer innovative solutions that support employees in releasing emotional and mental stress, fostering personal growth, and aligning teams around shared goals.",
        "Our thoughtfully designed framework includes a range of therapeutic art collaborations, group exercises, and individual expression opportunities. These activities spark joy and positivity in the workplace while also building trust, transparency, empathy, and unity within teams.",
        "Empower your workforce with experiences that enhance well-being, elevate team dynamics, and inspire new perspectives."
      ]
    },
    sections: [
      {
        title: "Art Therapy",
        body: "The art-based program encourages self-expression through visual art using colors, textures, and forms. It focuses on the creative process rather than the final outcome, making it accessible to everyone, regardless of artistic experience. This program helps participants cultivate emotional awareness, focus, and relaxation through activities such as intuitive drawing, painting, and creative journaling.",
        image: c("corporate/earth/art_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      },
      {
        title: "Expression",
        body: "In the expression-based program, participants are guided to explore verbal and non-verbal communication as a form of emotional release and self-discovery. Through guided storytelling, voice work, and mindful dialogue, this program creates a safe space for self-expression while improving communication skills, boosting confidence, and encouraging deeper personal reflection.",
        image: c("corporate/earth/expression_1.jpg"),
        imagePosition: "left",
        background: "#FFF2E9"
      },
      {
        title: "Movement",
        body: "The movement-based program focuses on using physical movement as a tool for self-expression, body awareness, and grounding. Through mindful movement, dance therapy, and breath-based exercises, participants experience enhanced energy flow, stress relief, and a deeper connection with their body. This program helps release emotional blockages, promoting a sense of freedom and vitality.",
        image: c("corporate/earth/sharing_1.jpg"),
        imagePosition: "right",
        background: "#F2FAF8"
      }
    ]
  }
};

export function getCorporateProgramPage(slug: string): CorporateProgramPageData | null {
  if (!isCorporateProgramSlug(slug)) return null;
  return CORPORATE_PROGRAM_PAGES[slug];
}
