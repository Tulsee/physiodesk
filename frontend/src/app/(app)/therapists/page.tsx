"use client";

import Link from "next/link";
import { useState } from "react";

import { TherapistForm } from "@/components/therapists/TherapistForm";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { formatTime, initials } from "@/lib/format";
import { WEEKDAY_LABELS, type Page, type Therapist } from "@/lib/types";
import { useDebounced, useMutation, useQuery } from "@/lib/useApi";

export default function TherapistsPage() {
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const therapists = useQuery<Page<Therapist>>("/therapists", {
    search: debouncedSearch,
    specialty,
    page,
    page_size: 10,
  });
  const specialties = useQuery<string[]>("/therapists/specialties");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Therapist | null>(null);
  const [deleting, setDeleting] = useState<Therapist | null>(null);

  const remove = useMutation(async (id: number) => api.delete(`/therapists/${id}`));

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const hasFilters = Boolean(search || specialty);

  return (
    <>
      <PageHeader
        title="Therapists"
        description="Practitioners and their working patterns."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add therapist
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-[220px] flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => changeFilter(() => setSearch(e.target.value))}
              placeholder="Search name or specialty…"
              aria-label="Search therapists"
            />
          </div>
          <Select
            value={specialty}
            onChange={(e) => changeFilter(() => setSpecialty(e.target.value))}
            aria-label="Filter by specialty"
            className="w-auto min-w-[200px]"
          >
            <option value="">All specialties</option>
            {(specialties.data ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() =>
                changeFilter(() => {
                  setSearch("");
                  setSpecialty("");
                })
              }
            >
              Clear
            </Button>
          ) : null}
        </div>

        {therapists.isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : therapists.error ? (
          <ErrorState message={therapists.error} onRetry={therapists.refetch} />
        ) : !therapists.data?.items.length ? (
          <EmptyState
            title={hasFilters ? "No matching therapists" : "No therapists yet"}
            message={
              hasFilters
                ? "Try a different search or clear the filters."
                : "Add a therapist so appointments can be booked."
            }
            action={
              hasFilters ? null : (
                <Button onClick={() => setFormOpen(true)}>Add therapist</Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {therapists.data.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials(t.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/therapists/${t.id}`}
                    className="text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {t.name}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {t.specialty}
                    {t.experience_years !== null
                      ? ` · ${t.experience_years} yrs experience`
                      : ""}
                  </p>
                </div>
                <div className="hidden min-w-[190px] sm:block">
                  <WorkDays days={t.work_days} />
                  <p className="mt-1 text-xs text-ink-500">
                    {formatTime(t.start_time)} – {formatTime(t.end_time)} ·{" "}
                    {t.slot_minutes} min
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(t)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {therapists.data ? (
          <Pagination page={therapists.data} onPageChange={setPage} label="therapists" />
        ) : null}
      </Card>

      {formOpen ? (
        <TherapistForm
          key={editing?.id ?? "new"}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            therapists.refetch();
            specialties.refetch();
          }}
          therapist={editing}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await remove.run(deleting.id);
          if (ok !== null) {
            setDeleting(null);
            therapists.refetch();
          }
        }}
        title="Delete therapist"
        message={`Delete ${deleting?.name}? The server refuses if patients are still assigned to them.`}
        loading={remove.isPending}
        // The 409 guard message arrives here and is shown verbatim, because it
        // says exactly how many patients must be reassigned first.
        error={remove.error}
      />
    </>
  );
}

export function WorkDays({ days }: { days: number[] }) {
  return (
    <div className="flex gap-0.5" aria-label={`Works ${days.length} days a week`}>
      {WEEKDAY_LABELS.map((label, day) => (
        <span
          key={label}
          title={label}
          className={`flex h-5 w-6 items-center justify-center rounded text-[10px] font-medium ${
            days.includes(day)
              ? "bg-brand-100 text-brand-700"
              : "bg-ink-100 text-ink-300"
          }`}
        >
          {label[0]}
        </span>
      ))}
    </div>
  );
}
