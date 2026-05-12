import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="hidden border-t border-stone-200 bg-stone-100 md:block">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <p className="font-serif text-2xl italic text-amber-700">☸ Sarveda</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
            Authentic yoga, Ayurveda, and sound healing products — curated with care for practitioners worldwide.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Explore</p>
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            <li>
              <Link href="/shop" className="transition-colors hover:text-amber-700">
                Shop
              </Link>
            </li>
            <li>
              <Link href="/#courses" className="transition-colors hover:text-amber-700">
                Courses
              </Link>
            </li>
            <li>
              <Link href="/search" className="transition-colors hover:text-amber-700">
                Search
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Account</p>
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            <li>
              <Link href="/login" className="transition-colors hover:text-amber-700">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/signup" className="transition-colors hover:text-amber-700">
                Create account
              </Link>
            </li>
            <li>
              <Link href="/cart" className="transition-colors hover:text-amber-700">
                Cart
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-stone-200 px-4 py-4 text-center text-xs text-stone-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Sarveda. All rights reserved.
      </div>
    </footer>
  );
}
