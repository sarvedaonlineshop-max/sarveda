"use client";

import { useEffect, useState } from "react";

import { AdminSidebar } from "@/components/admin/AdminSidebar";

const THEME_STORAGE_KEY = "sarveda-admin-theme";

function readStoredTheme(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preferDarkMain, setPreferDarkMain] = useState(false);

  useEffect(() => {
    setPreferDarkMain(readStoredTheme());
  }, []);

  function toggleMainTheme() {
    setPreferDarkMain((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      }
      return next;
    });
  }

  return (
    <div className={preferDarkMain ? "dark" : ""}>
      <div className="min-h-screen bg-stone-100 text-stone-900 transition-colors dark:bg-stone-950 dark:text-stone-100">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <AdminSidebar
            onNavigate={() => setSidebarOpen(false)}
            preferDarkMain={preferDarkMain}
            onToggleMainTheme={toggleMainTheme}
          />
        </aside>

        <div className="flex min-h-screen flex-col md:pl-64">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur dark:border-stone-700 dark:bg-stone-900/95 md:hidden">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-serif text-lg italic text-stone-800 dark:text-stone-100">Admin</span>
            <button
              type="button"
              onClick={toggleMainTheme}
              className="ml-auto inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              title={preferDarkMain ? "Use light workspace" : "Use dark workspace"}
            >
              {preferDarkMain ? "Light" : "Dark"}
            </button>
          </header>

          <main className="flex-1">
            <div className="mx-auto w-full max-w-none px-4 py-6 md:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
