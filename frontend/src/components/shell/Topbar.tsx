"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — a menu that traps the user is worse
  // than no menu.
  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const name = user?.full_name || user?.username || "";

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--border)] bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="-ml-1 rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
        aria-label="Open navigation"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex-1" />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition hover:bg-ink-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials(name) || "?"}
          </span>
          <span className="hidden text-sm font-medium text-ink-800 sm:block">
            {name}
          </span>
          <svg
            className={`h-4 w-4 text-ink-400 transition ${menuOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="truncate text-sm font-medium text-ink-900">{name}</p>
              <p className="mt-0.5 text-xs text-ink-500">Front desk</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="w-full px-4 py-2.5 text-left text-sm text-ink-700 transition hover:bg-ink-50"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
