/**
 * Seed corporate-wellness CMS page with rich HTML content.
 * Usage: npm run seed:corporate
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const SLUG = "corporate-wellness";

const content = `
<section id="hero">
  <h1>Corporate Wellness</h1>
  <p>Transform your workplace with curated yoga, meditation, sound healing, and art therapy programs designed for modern teams.</p>
</section>

<section id="programs">
  <h2>Curated Wellness Programs</h2>
  <article>
    <h3>SAHYOG</h3>
    <h4>Yoga Asanas &amp; Breathwork</h4>
    <p>Programs to relieve back and neck pain from sedentary work through tailored yoga and breathwork.</p>
  </article>
  <article>
    <h3>SARGAM</h3>
    <h4>Sound Baths, Drum Circles &amp; Music</h4>
    <p>Sessions provide a relaxing auditory experience with therapeutic sound for stress relief and community connection.</p>
  </article>
  <article>
    <h3>SAMATVA</h3>
    <h4>Mindfulness &amp; Awareness</h4>
    <p>Mindfulness Meditation sessions reduce stress and build team well-being through guided practices.</p>
  </article>
  <article>
    <h3>SAMSARA</h3>
    <h4>Art &amp; Expression Therapy</h4>
    <p>Creative sessions like art, terrarium gardening, and clay modeling boost stress relief and teamwork.</p>
  </article>
</section>

<section id="solutions">
  <h2>Tailored Wellness Solutions for Every Need</h2>
  <article>
    <h4>Weekly Program</h4>
    <p>Our practitioner visits weekly, offering rotating sessions in yoga, meditation, sound, and art therapy.</p>
  </article>
  <article>
    <h4>Monthly Program</h4>
    <p>Benefit from monthly sessions with a practitioner, keeping experiences fresh and engaging.</p>
  </article>
  <article>
    <h4>Customized Sessions</h4>
    <p>Choose single or multiple sessions to suit your company's needs.</p>
  </article>
</section>

<section id="retreats">
  <h2>Immersive Wellness Retreats</h2>
  <p>Recharge with our wellness retreats just outside the city, featuring yoga, meditation, sound healing, and organic meals. Enjoy mindfulness activities, nature hikes, and educational sessions on holistic wellness.</p>
</section>

<section id="holistic">
  <h2>Our Holistic Approach to Wellness</h2>
  <p>Physical, Mental, and Emotional well-being are the pillars of a balanced, productive life.</p>
  <article>
    <h4>Physical Wellbeing</h4>
    <p>Yoga, deskercise, physiotherapy</p>
  </article>
  <article>
    <h4>Emotional Wellbeing</h4>
    <p>Art therapy, gratitude journals, laughter yoga</p>
  </article>
  <article>
    <h4>Mental Wellbeing</h4>
    <p>Guided meditation, breathwork, counseling</p>
  </article>
</section>

<section id="facilitators">
  <h2>Our Facilitators</h2>
  <ul>
    <li><strong>Arjun</strong> — Sound therapist and Multi-instrumentalist</li>
    <li><strong>Priya</strong> — Yoganidra Expert</li>
    <li><strong>Chetan</strong> — Mudgar Swing</li>
    <li><strong>Tejal Rathod</strong> — Sound and meditation therapist</li>
    <li><strong>Saloni</strong> — Terrarium workshop</li>
    <li><strong>Vivek</strong> — Breathwork and Animal Flow</li>
    <li><strong>Saatvika</strong> — EFT and Inner Child Healing</li>
    <li><strong>Xenkat</strong> — Drum Circle</li>
    <li><strong>Riya</strong> — Yoga</li>
  </ul>
</section>

<section id="partners">
  <h2>Our Partners in Workplace Wellness</h2>
  <p>Trusted by leading organizations across India for holistic employee wellness.</p>
</section>

<section id="testimonials">
  <h2>Our Wellness in Action</h2>
  <blockquote>
    <p>"The Corporate Wellness Program offered by Sarveda for Publicis Groupe was highly appreciated by all our colleagues. The uniqueness of sessions and qualified therapists and facilitators was such a hit that it still gets called out by everyone."</p>
    <cite>Vaishali Ramakrishan — Director - Talent and Culture, Publicis Groupe</cite>
  </blockquote>
  <blockquote>
    <p>"Partnering with Sarveda for our wellness initiatives has been a truly transformative experience. Their holistic approach, rooted in Yoga, Ayurveda, and mindfulness, has brought a profound sense of balance and well-being to our team."</p>
    <cite>Vinod — Founder, Red Chariots</cite>
  </blockquote>
</section>

<section id="contact">
  <h2>Get In Touch With Us</h2>
  <p>Fill up the form and our Team will get back to you within 24 hours.</p>
  <p><a href="mailto:care@sarveda.com">care@sarveda.com</a></p>
  <p>Phone: +91 9535975075 · +91 6363608737 · +91 8861568960</p>
</section>
`.trim();

async function main() {
  const page = await prisma.cmsPage.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      title: "Corporate Wellness",
      content,
      template: "template/template-corporate-wellness.php",
      status: "PUBLISHED",
      seoTitle: "Corporate Wellness Programs | Sarveda",
      seoDescription:
        "Curated corporate wellness programs — yoga, sound healing, mindfulness, and art therapy for teams. Weekly, monthly, and custom sessions plus immersive retreats.",
      wpPostId: 44524
    },
    update: {
      title: "Corporate Wellness",
      content,
      template: "template/template-corporate-wellness.php",
      status: "PUBLISHED",
      seoTitle: "Corporate Wellness Programs | Sarveda",
      seoDescription:
        "Curated corporate wellness programs — yoga, sound healing, mindfulness, and art therapy for teams. Weekly, monthly, and custom sessions plus immersive retreats."
    }
  });

  console.log(`✓ Seeded /${SLUG} (${page.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
