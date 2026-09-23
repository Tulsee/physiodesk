"use client";

import Link from "next/link";

import { Card, CardHeader, PageHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { PatientStatusBadge } from "@/components/ui/StatusBadge";
import { formatMoney, formatRelative, todayISO } from "@/lib/format";
import type { CapacityEntry, DashboardSummary, RecentPatient } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export default function DashboardPage() {
  const today = todayISO();
  const summary = useQuery<DashboardSummary>("/dashboard/summary", { date: today });
  const capacity = useQuery<CapacityEntry[]>("/dashboard/capacity", { date: today });
  const recent = useQuery<RecentPatient[]>("/dashboard/recent-patients", { limit: 8 });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Today at a glance — ${new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}`}
      />

      <section className="mb-6">
        {summary.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-[92px] animate-pulse" />
            ))}
          </div>
        ) : summary.error ? (
          <Card>
            <ErrorState message={summary.error} onRetry={summary.refetch} />
          </Card>
        ) : summary.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Patients seen today"
              value={String(summary.data.patients_seen_today)}
              sub={`${summary.data.appointments_today} appointment${
                summary.data.appointments_today === 1 ? "" : "s"
              } booked`}
            />
            <StatTile
              label="Therapists on duty"
              value={String(summary.data.therapists_on_duty)}
              sub={`${summary.data.active_patients} active patients`}
            />
            <StatTile
              label="Revenue today"
              value={formatMoney(summary.data.revenue_today)}
              sub={`${formatMoney(summary.data.outstanding_balance)} outstanding`}
            />
            <StatTile
              label="Open slots"
              value={String(summary.data.open_slots)}
              sub={`of ${summary.data.total_slots} today`}
            />
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Capacity today"
            description="Booked against available slots, per therapist."
            action={
              <Link href="/schedule" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Open schedule →
              </Link>
            }
          />
          {capacity.isLoading ? (
            <LoadingState />
          ) : capacity.error ? (
            <ErrorState message={capacity.error} onRetry={capacity.refetch} />
          ) : !capacity.data?.length ? (
            <EmptyState title="No therapists yet" message="Add a therapist to see today's capacity." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {capacity.data.map((entry) => (
                <CapacityRow key={entry.therapist_id} entry={entry} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent patients"
            description="Most recently seen."
            action={
              <Link href="/patients" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                All patients →
              </Link>
            }
          />
          {recent.isLoading ? (
            <LoadingState />
          ) : recent.error ? (
            <ErrorState message={recent.error} onRetry={recent.refetch} />
          ) : !recent.data?.length ? (
            <EmptyState title="No visits recorded" message="Patients appear here once they have an appointment." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recent.data.map((patient) => (
                <li key={patient.patient_id}>
                  <Link
                    href={`/patients/${patient.patient_id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-ink-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{patient.name}</p>
                      <p className="truncate text-xs text-ink-500">{patient.condition ?? "No condition recorded"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PatientStatusBadge status={patient.status} />
                      <span className="text-[11px] text-ink-400">{formatRelative(patient.last_visit)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

/** A headline number. No plot, so no hover layer — the number is the content. */
function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {/* Proportional figures: tabular-nums makes a large standalone number
          look loose. */}
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-950">{value}</p>
      <p className="mt-0.5 text-xs text-ink-400">{sub}</p>
    </Card>
  );
}

function CapacityRow({ entry }: { entry: CapacityEntry }) {
  const pct = entry.total > 0 ? Math.round((entry.booked / entry.total) * 100) : 0;
  const full = entry.total > 0 && entry.booked >= entry.total;

  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{entry.therapist_name}</p>
        {entry.is_off ? (
          <p className="text-xs text-ink-400">{entry.off_reason}</p>
        ) : (
          <p className="text-xs text-ink-500">
            {entry.booked} of {entry.total} slots booked
          </p>
        )}
      </div>

      {entry.is_off ? (
        <span className="shrink-0 text-xs text-ink-400">Off</span>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {/* A meter, not a chart: 24px-thin track, rounded data-end. */}
          <div
            className="h-2 w-28 overflow-hidden rounded-full bg-ink-100"
            role="img"
            aria-label={`${entry.booked} of ${entry.total} slots booked`}
          >
            <div
              className={`h-full rounded-full ${full ? "bg-amber-500" : "bg-brand-500"}`}
              style={{ width: `${Math.max(pct, entry.booked > 0 ? 6 : 0)}%` }}
            />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-ink-500">{pct}%</span>
        </div>
      )}
    </li>
  );
}
