import Image from "next/image";

import type { CourseTeacher } from "@/lib/content-meta";

type Props = {
  people: CourseTeacher[];
  className?: string;
};

export function InstructorAvatars({ people, className = "" }: Props) {
  const shown = people.filter((p) => p.name.trim()).slice(0, 4);
  if (shown.length === 0) return null;

  return (
    <ul className={`flex items-end ${className}`} aria-label="Instructors">
      {shown.map((person, index) => (
        <li
          key={`${person.name}-${index}`}
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-white bg-brand-cream shadow-md ring-1 ring-brand-gold/35"
          style={{ marginLeft: index === 0 ? 0 : -10, zIndex: shown.length - index }}
          title={person.name}
        >
          {person.imageUrl ? (
            <Image
              src={person.imageUrl}
              alt={person.name}
              fill
              className="object-cover object-center"
              style={{ objectFit: "cover" }}
              sizes="44px"
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
