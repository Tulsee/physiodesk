"use client";

import { Card, CardHeader } from "@/components/ui/Primitives";
import { formatDate } from "@/lib/format";
import { PATIENT_STATUS_LABELS, type PatientDetail } from "@/lib/types";

/** Renders what the profile already fetched — no second request for the header data. */
export function OverviewTab({ patient }: { patient: PatientDetail }) {
  const pct =
    patient.sessions_total && patient.sessions_total > 0
      ? Math.min(100, Math.round((patient.sessions_used / patient.sessions_total) * 100))
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Patient details" />
        <dl className="divide-y divide-[var(--border)]">
          <Row label="Full name" value={patient.name} />
          <Row label="Age" value={patient.age !== null ? `${patient.age} years` : "—"} />
          <Row
            label="Gender"
            value={patient.gender ? capitalize(patient.gender) : "—"}
          />
          <Row label="Phone" value={patient.phone ?? "—"} />
          <Row label="Email" value={patient.email ?? "—"} />
          <Row label="Address" value={patient.address ?? "—"} />
          <Row label="Registered" value={formatDate(patient.created_at)} />
        </dl>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Treatment" />
          <dl className="divide-y divide-[var(--border)]">
            <Row label="Condition" value={patient.condition ?? "—"} />
            <Row
              label="Therapist"
              value={patient.therapist?.name ?? "Unassigned"}
            />
            <Row
              label="Specialty"
              value={patient.therapist?.specialty ?? "—"}
            />
            <Row label="Status" value={PATIENT_STATUS_LABELS[patient.status]} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Package" />
          <div className="px-5 py-4">
            {patient.package ? (
              <>
                <p className="text-sm font-medium text-ink-900">{patient.package}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {patient.sessions_used} of {patient.sessions_total ?? "—"} sessions
                  used
                </p>
                {pct !== null ? (
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
                    role="img"
                    aria-label={`${pct}% of the package used`}
                  >
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(pct, patient.sessions_used > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-400">No package assigned.</p>
            )}
          </div>
        </Card>

        {patient.notes ? (
          <Card>
            <CardHeader title="Notes" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink-600">
              {patient.notes}
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-5 py-2.5 text-sm">
      <dt className="w-28 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-800">{value}</dd>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
