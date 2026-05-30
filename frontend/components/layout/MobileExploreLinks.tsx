import Link from "next/link";

const links = [
  { href: "/shop", label: "Shop" },
  { href: "/courses", label: "Courses" },
  { href: "/events", label: "Events" },
  { href: "/corporate-wellness", label: "Corporate Wellness" },
  { href: "/insights", label: "Insights" }
];

/** Quick explore links on mobile (footer is desktop-only). */
export function MobileExploreLinks() {
  return (
    <nav
      className="border-t border-stone-200 bg-white px-4 py-4 md:hidden"
      aria-label="Explore Sarveda"
    >
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-stone-400">
        Explore
      </p>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-medium text-stone-700 underline-offset-2 hover:text-amber-800 hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
