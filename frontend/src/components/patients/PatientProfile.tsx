"use client";

/**
 * Patient profile with six tabs.
 *
 * Tab switching is client-side state — no navigation, no reload. Each tab
 * component runs its own query, so a tab only loads when it is first opened and
 * carries its own loading / empty / error states.
 */

import Link from "next/link";
import { useState } from "react";

import { BillingTab } from "@/components/patients/tabs/BillingTab";
import { NotesTab } from "@/components/patients/tabs/NotesTab";
import { OverviewTab } from "@/components/patients/tabs/OverviewTab";
import { ProgressTab } from "@/components/patients/tabs/ProgressTab";
import { ReportsTab } from "@/components/patients/tabs/ReportsTab";
import { SessionsTab } from "@/components/patients/tabs/SessionsTab";
import { Card } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { PatientStatusBadge } from "@/components/ui/StatusBadge";
import { initials } from "@/lib/format";
import type { PatientDetail } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "sessions", label: "Session history" },
  { key: "notes", label: "Clinical notes" },
  { key: "progress", label: "Progress" },
  { key: "reports", label: "Reports" },
  { key: "billing", label: "Billing" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PatientProfile({ patientId }: { patientId: number }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const patient = useQuery<PatientDetail>(`/patients/${patientId}`);

  if (patient.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading patient…" />
      </Card>
    );
  }

  if (patient.error || !patient.data) {
    return (
      <Card>
        <ErrorState
          message={patient.error ?? "That patient could not be found."}
          onRetry={patient.refetch}
        />
      </Card>
    );
  }

  const p = patient.data;

  return (
    <>
      <Link
        href="/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink-800"
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
        All patients
      </Link>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4 px-5 py-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initials(p.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-ink-950">
                {p.name}
              </h1>
              <PatientStatusBadge status={p.status} />
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {p.condition ?? "No condition recorded"}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
              <Fact label="Age" value={p.age !== null ? `${p.age}` : "—"} />
              <Fact label="Phone" value={p.phone ?? "—"} />
              <Fact
                label="Therapist"
                value={
                  p.therapist ? (
                    <Link
                      href={`/therapists/${p.therapist.id}`}
                      className="text-brand-600 hover:text-brand-700"
                    >
                      {p.therapist.name}
                    </Link>
                  ) : (
                    "Unassigned"
                  )
                }
              />
              <Fact
                label="Sessions"
                value={
                  p.sessions_total
                    ? `${p.sessions_used} of ${p.sessions_total}`
                    : `${p.sessions_used}`
                }
              />
            </dl>
          </div>
        </div>
      </Card>

      <div className="mb-5 border-b border-[var(--border)]">
        <div role="tablist" aria-label="Patient sections" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              id={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
                tab === t.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {/* Mounted only when selected, so each tab's request fires on first open. */}
        {tab === "overview" ? <OverviewTab patient={p} /> : null}
        {tab === "sessions" ? <SessionsTab patientId={patientId} /> : null}
        {tab === "notes" ? <NotesTab patient={p} /> : null}
        {tab === "progress" ? <ProgressTab patientId={patientId} /> : null}
        {tab === "reports" ? <ReportsTab patientId={patientId} /> : null}
        {tab === "billing" ? <BillingTab patientId={patientId} /> : null}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-ink-400">{label}</dt>
      <dd className="font-medium text-ink-700">{value}</dd>
    </div>
  );
}
