"use client";

import { useState } from "react";

import { Pagination } from "@/components/ui/Pagination";
import { Card } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatTime } from "@/lib/format";
import { APPOINTMENT_TYPE_LABELS, type Appointment, type Page } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export function SessionsTab({ patientId }: { patientId: number }) {
  const [page, setPage] = useState(1);
  const sessions = useQuery<Page<Appointment>>("/appointments", {
    patient_id: patientId,
    page,
    page_size: 10,
  });

  return (
    <Card>
      {sessions.isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : sessions.error ? (
        <ErrorState message={sessions.error} onRetry={sessions.refetch} />
      ) : !sessions.data?.items.length ? (
        <EmptyState
          title="No sessions yet"
          message="Appointments booked for this patient appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 font-medium">Time</th>
                <th className="px-5 py-2.5 font-medium">Therapist</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sessions.data.items.map((appt) => (
                <tr key={appt.id} className="hover:bg-ink-50">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink-900">
                    {formatDate(appt.date)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-600">
                    {formatTime(appt.time)}
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {appt.therapist_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {APPOINTMENT_TYPE_LABELS[appt.type]}
                  </td>
                  <td className="px-5 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </td>
                  <td className="max-w-[220px] px-5 py-3 text-ink-500">
                    <span className="line-clamp-2">
                      {appt.outcome_note ?? appt.cancellation_reason ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sessions.data ? (
        <Pagination page={sessions.data} onPageChange={setPage} label="sessions" />
      ) : null}
    </Card>
  );
}
