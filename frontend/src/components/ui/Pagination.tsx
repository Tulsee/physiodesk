"use client";

import type { Page } from "@/lib/types";

/**
 * Pagination footer for a list.
 *
 * Reads the server's envelope directly, so the counts shown are the server's
 * totals rather than anything derived on the client.
 */
export function Pagination({
  page,
  onPageChange,
  label = "results",
}: {
  page: Pick<Page<unknown>, "page" | "pages" | "total" | "page_size">;
  onPageChange: (next: number) => void;
  label?: string;
}) {
  const { page: current, pages, total, page_size } = page;

  // Hide the control entirely when everything fits on one page — but still show
  // the count, which is useful on its own.
  const first = total === 0 ? 0 : (current - 1) * page_size + 1;
  const last = Math.min(current * page_size, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
      <p className="text-xs text-ink-500">
        {total === 0 ? (
          `No ${label}`
        ) : (
          <>
            Showing <span className="font-medium text-ink-700">{first}</span>–
            <span className="font-medium text-ink-700">{last}</span> of{" "}
            <span className="font-medium text-ink-700">{total}</span> {label}
          </>
        )}
      </p>

      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <PageButton
            onClick={() => onPageChange(current - 1)}
            disabled={current <= 1}
            label="Previous page"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </PageButton>

          <span className="px-2 text-xs text-ink-500">
            Page <span className="font-medium text-ink-700">{current}</span> of{" "}
            <span className="font-medium text-ink-700">{pages}</span>
          </span>

          <PageButton
            onClick={() => onPageChange(current + 1)}
            disabled={current >= pages}
            label="Next page"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </PageButton>
        </div>
      ) : null}
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg border border-[var(--border)] bg-white p-1.5 text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
