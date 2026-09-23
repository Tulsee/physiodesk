"use client";

import Link from "next/link";
import { useState } from "react";

import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Button, Card, Input, PageHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { addDays, formatDate, formatTime, todayISO } from "@/lib/format";
import {
  APPOINTMENT_TYPE_LABELS,
  type Appointment,
  type DaySchedule,
  type Page,
  type Patient,
  type Slot,
} from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

export default function SchedulePage() {
  const [date, setDate] = useState(todayISO());
  const schedule = useQuery<DaySchedule>("/schedule", { date });
  const patients = useQuery<Page<Patient>>("/patients", {
    page_size: 100,
    status: "active",
  });

  const [booking, setBooking] = useState<{
    therapistId: number;
    therapistName: string;
    time: string;
  } | null>(null);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const cancel = useMutation(async (id: number) =>
    api.patch(`/appointments/${id}`, { status: "cancelled" }),
  );

  const columns = schedule.data?.therapists ?? [];
  const working = columns.filter((c) => !c.is_off);
  // Slot times differ per therapist (30/45/60-minute lengths), so the rows are
  // the union of every start time on the day rather than a fixed grid.
  const rows = Array.from(
    new Set(working.flatMap((c) => c.slots.map((s) => s.time))),
  ).sort();

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Slots are derived from each therapist's working hours."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setDate(addDays(date, -1))}>
              ‹
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Schedule date"
              className="w-auto"
            />
            <Button variant="secondary" onClick={() => setDate(addDays(date, 1))}>
              ›
            </Button>
            {date !== todayISO() ? (
              <Button variant="ghost" onClick={() => setDate(todayISO())}>
                Today
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        {schedule.isLoading ? (
          <LoadingState label="Building the day…" />
        ) : schedule.error ? (
          <ErrorState message={schedule.error} onRetry={schedule.refetch} />
        ) : columns.length === 0 ? (
          <EmptyState
            title="No therapists"
            message="Add a therapist before booking appointments."
            action={
              <Link
                href="/therapists"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Go to therapists →
              </Link>
            }
          />
        ) : working.length === 0 ? (
          <EmptyState
            title="Nobody is working on this date"
            message={`${formatDate(date)} falls outside every therapist's working days, or they are all marked off.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-20 border-b border-[var(--border)] bg-white px-3 py-2.5 text-left text-xs font-medium text-ink-500">
                    Time
                  </th>
                  {working.map((column) => (
                    <th
                      key={column.therapist_id}
                      className="min-w-[160px] border-b border-l border-[var(--border)] px-3 py-2.5 text-left"
                    >
                      <Link
                        href={`/therapists/${column.therapist_id}`}
                        className="text-xs font-semibold text-ink-800 hover:text-brand-700"
                      >
                        {column.therapist_name}
                      </Link>
                      <p className="text-[11px] font-normal text-ink-400">
                        {column.slots.filter((s) => s.is_booked).length} of{" "}
                        {column.slots.length} booked
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((time) => (
                  <tr key={time}>
                    <th className="sticky left-0 z-10 border-b border-[var(--border)] bg-white px-3 py-2 text-left text-xs font-normal tabular-nums text-ink-500">
                      {formatTime(time)}
                    </th>
                    {working.map((column) => {
                      const slot = column.slots.find((s) => s.time === time);
                      return (
                        <td
                          key={column.therapist_id}
                          className="border-b border-l border-[var(--border)] p-1 align-top"
                        >
                          {!slot ? (
                            // This therapist has no slot starting at this time —
                            // different slot length, not availability.
                            <div className="h-11 rounded-md bg-ink-50/60" />
                          ) : slot.is_booked && slot.appointment ? (
                            <BookedSlot
                              slot={slot}
                              onOpen={() => setViewing(slot.appointment)}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setBooking({
                                  therapistId: column.therapist_id,
                                  therapistName: column.therapist_name,
                                  time: slot.time,
                                })
                              }
                              className="h-11 w-full rounded-md border border-dashed border-ink-200 text-xs text-ink-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                            >
                              Free
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Therapists who are off still deserve a mention — otherwise their
            absence from the grid looks like a bug. */}
        {columns.some((c) => c.is_off) ? (
          <div className="border-t border-[var(--border)] px-5 py-3">
            <p className="text-xs text-ink-500">
              Not working:{" "}
              {columns
                .filter((c) => c.is_off)
                .map((c) => `${c.therapist_name} (${c.off_reason})`)
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </Card>

      {booking !== null || rescheduling !== null ? (
        <AppointmentForm
          key={rescheduling?.id ?? `${booking?.therapistId}-${booking?.time}`}
          onClose={() => {
            setBooking(null);
            setRescheduling(null);
          }}
          onSaved={schedule.refetch}
          patients={patients.data?.items ?? []}
          date={date}
          presetTherapistId={booking?.therapistId}
          presetTherapistName={booking?.therapistName}
          presetTime={booking?.time}
          appointment={rescheduling}
        />
      ) : null}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title="Appointment"
        size="sm"
        footer={
          viewing && viewing.status === "scheduled" ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRescheduling(viewing);
                  setViewing(null);
                }}
              >
                Reschedule
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setCancelling(viewing);
                  setViewing(null);
                }}
              >
                Cancel appointment
              </Button>
            </>
          ) : null
        }
      >
        {viewing ? (
          <dl className="space-y-2.5 text-sm">
            <DetailRow
              label="Patient"
              value={
                <Link
                  href={`/patients/${viewing.patient_id}`}
                  className="text-brand-600 hover:text-brand-700"
                >
                  {viewing.patient_name}
                </Link>
              }
            />
            <DetailRow label="Therapist" value={viewing.therapist_name ?? "—"} />
            <DetailRow
              label="When"
              value={`${formatDate(viewing.date)} at ${formatTime(viewing.time)} (${
                viewing.duration_minutes
              } min)`}
            />
            <DetailRow label="Type" value={APPOINTMENT_TYPE_LABELS[viewing.type]} />
            <DetailRow
              label="Status"
              value={<AppointmentStatusBadge status={viewing.status} />}
            />
            {viewing.notes ? (
              <DetailRow label="Notes" value={viewing.notes} />
            ) : null}
            {viewing.outcome_note ? (
              <DetailRow label="Outcome" value={viewing.outcome_note} />
            ) : null}
            {viewing.cancellation_reason ? (
              <DetailRow label="Cancelled" value={viewing.cancellation_reason} />
            ) : null}
          </dl>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => {
          setCancelling(null);
          cancel.reset();
        }}
        onConfirm={async () => {
          if (!cancelling) return;
          const ok = await cancel.run(cancelling.id);
          if (ok !== null) {
            setCancelling(null);
            schedule.refetch();
          }
        }}
        title="Cancel appointment"
        message={`Cancel ${cancelling?.patient_name}'s appointment at ${
          cancelling ? formatTime(cancelling.time) : ""
        }? The slot becomes free again and the record is kept.`}
        confirmLabel="Cancel appointment"
        loading={cancel.isPending}
        error={cancel.error}
      />
    </>
  );
}

function BookedSlot({ slot, onOpen }: { slot: Slot; onOpen: () => void }) {
  const appt = slot.appointment!;
  const tone =
    appt.status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : appt.status === "no_show"
        ? "border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
        : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`h-11 w-full rounded-md border px-2 text-left transition ${tone}`}
    >
      <span className="block truncate text-xs font-medium">{appt.patient_name}</span>
      <span className="block truncate text-[11px] opacity-70">
        {APPOINTMENT_TYPE_LABELS[appt.type]}
      </span>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-800">{value}</dd>
    </div>
  );
}
