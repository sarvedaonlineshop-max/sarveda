import Image from "next/image";

import type { CourseTeacher } from "@/lib/content-meta";

type Props = {
  people: CourseTeacher[];
  className?: string;
  /** Old listing: 50px circles on the poster/footer seam, side by side (not stacked). */
  seam?: boolean;
};

export function InstructorAvatars({ people, className = "", seam = false }: Props) {
  const shown = people.filter((p) => p.name.trim()).slice(0, seam ? 6 : 4);
  if (shown.length === 0) return null;

  const size = seam ? "h-[50px] w-[50px] border-2 border-white" : "h-11 w-11 border-2 border-white shadow-md ring-1 ring-brand-gold/35";

  return (
    <ul className={`flex items-end ${seam ? "gap-0.5" : ""} ${className}`} aria-label="Instructors">
      {shown.map((person, index) => (
        <li
          key={`${person.name}-${index}`}
          className={`relative shrink-0 overflow-hidden rounded-full bg-brand-cream ${size}`}
          style={seam ? undefined : { marginLeft: index === 0 ? 0 : -10, zIndex: shown.length - index }}
          title={person.name}
        >
          {person.imageUrl ? (
            <Image
              src={person.imageUrl}
              alt={person.name}
              fill
              className="object-cover object-center"
              sizes="50px"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-serif text-sm font-semibold text-brand-forest">
              {person.name.charAt(0).toUpperCase()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
