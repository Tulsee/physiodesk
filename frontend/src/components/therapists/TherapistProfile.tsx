"use client";

import Link from "next/link";
import { useState } from "react";

import { WorkDays } from "@/app/(app)/therapists/page";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
} from "@/components/ui/Primitives";
import { EmptyState, ErrorState, FormError, LoadingState } from "@/components/ui/States";
import { PatientStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { addDays, formatDate, formatTime, initials, todayISO } from "@/lib/format";
import type {
  DaySchedule,
  Page,
  Patient,
  ScheduleException,
  Therapist,
} from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

export function TherapistProfile({ therapistId }: { therapistId: number }) {
  const therapist = useQuery<Therapist>(`/therapists/${therapistId}`);
  const patients = useQuery<Page<Patient>>("/patients", {
    therapist_id: therapistId,
    page_size: 50,
  });
  const overrides = useQuery<ScheduleException[]>(
    `/therapists/${therapistId}/schedule-exceptions`,
  );

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [deletingOverride, setDeletingOverride] = useState<ScheduleException | null>(
    null,
  );

  const removeOverride = useMutation(async (id: number) =>
    api.delete(`/therapists/${therapistId}/schedule-exceptions/${id}`),
  );

  if (therapist.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading therapist…" />
      </Card>
    );
  }

  if (therapist.error || !therapist.data) {
    return (
      <Card>
        <ErrorState
          message={therapist.error ?? "That therapist could not be found."}
          onRetry={therapist.refetch}
        />
      </Card>
    );
  }

  const t = therapist.data;

  return (
    <>
      <Link
        href="/therapists"
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
        All therapists
      </Link>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4 px-5 py-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initials(t.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink-950">{t.name}</h1>
            <p className="mt-0.5 text-sm text-ink-500">{t.specialty}</p>
            {t.bio ? <p className="mt-2 text-sm text-ink-600">{t.bio}</p> : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Working hours"
              description="These determine the slots the schedule offers."
              action={
                <Button size="sm" variant="secondary" onClick={() => setOverrideOpen(true)}>
                  Add override
                </Button>
              }
            />
            <div className="space-y-3 px-5 py-4">
              <WorkDays days={t.work_days} />
              <p className="text-sm text-ink-600">
                {formatTime(t.start_time)} – {formatTime(t.end_time)} ·{" "}
                {t.slot_minutes}-minute slots
              </p>
            </div>

            <div className="border-t border-[var(--border)]">
              <p className="px-5 pt-3 text-xs font-medium text-ink-500">
                Date overrides
              </p>
              {overrides.isLoading ? (
                <LoadingState />
              ) : overrides.error ? (
                <ErrorState message={overrides.error} onRetry={overrides.refetch} />
              ) : !overrides.data?.length ? (
                <p className="px-5 py-4 text-sm text-ink-400">
                  No overrides. Add one to mark a day off or set different hours.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {overrides.data.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-900">
                          {formatDate(o.date)}
                        </p>
                        <p className="text-xs text-ink-500">
                          {o.is_off
                            ? "Not working"
                            : `${formatTime(o.custom_start)} – ${formatTime(o.custom_end)}`}
                          {o.reason ? ` · ${o.reason}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingOverride(o)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <WeekSchedule therapistId={therapistId} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <dl className="divide-y divide-[var(--border)]">
              <Row label="Email" value={t.email ?? "—"} />
              <Row label="Phone" value={t.phone ?? "—"} />
              <Row label="Qualifications" value={t.qualifications ?? "—"} />
              <Row
                label="Experience"
                value={
                  t.experience_years !== null ? `${t.experience_years} years` : "—"
                }
              />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Assigned patients"
              description={
                patients.data ? `${patients.data.total} in total.` : undefined
              }
            />
            {patients.isLoading ? (
              <LoadingState />
            ) : patients.error ? (
              <ErrorState message={patients.error} onRetry={patients.refetch} />
            ) : !patients.data?.items.length ? (
              <EmptyState
                title="No patients assigned"
                message="Assign patients to this therapist from the patient list."
              />
            ) : (
              <ul className="max-h-[420px] divide-y divide-[var(--border)] overflow-y-auto">
                {patients.data.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/patients/${p.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-ink-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {p.condition ?? "No condition recorded"}
                        </p>
                      </div>
                      <PatientStatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {overrideOpen ? (
        <OverrideForm
          onClose={() => setOverrideOpen(false)}
          onSaved={overrides.refetch}
          therapistId={therapistId}
        />
      ) : null}

      <ConfirmDialog
        open={deletingOverride !== null}
        onClose={() => {
          setDeletingOverride(null);
          removeOverride.reset();
        }}
        onConfirm={async () => {
          if (!deletingOverride) return;
          const ok = await removeOverride.run(deletingOverride.id);
          if (ok !== null) {
            setDeletingOverride(null);
            overrides.refetch();
          }
        }}
        title="Remove override"
        message={`Remove the override for ${
          deletingOverride ? formatDate(deletingOverride.date) : ""
        }? Normal working hours apply again on that date.`}
        confirmLabel="Remove"
        loading={removeOverride.isPending}
        error={removeOverride.error}
      />
    </>
  );
}

/** The next seven days, built from the same /schedule endpoint as the grid. */
function WeekSchedule({ therapistId }: { therapistId: number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i));

  return (
    <Card>
      <CardHeader title="This week" description="Booked and free slots, next 7 days." />
      <ul className="divide-y divide-[var(--border)]">
        {days.map((date) => (
          <DayRow key={date} date={date} therapistId={therapistId} />
        ))}
      </ul>
    </Card>
  );
}

function DayRow({ date, therapistId }: { date: string; therapistId: number }) {
  const schedule = useQuery<DaySchedule>("/schedule", {
    date,
    therapist_id: therapistId,
  });
  const column = schedule.data?.therapists?.[0];
  const booked = column?.slots.filter((s) => s.is_booked).length ?? 0;
  const total = column?.slots.length ?? 0;

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="w-32 shrink-0">
        <p className="text-sm font-medium text-ink-900">{formatDate(date)}</p>
        <p className="text-xs text-ink-400">
          {date === todayISO() ? "Today" : ""}
        </p>
      </div>

      {schedule.isLoading ? (
        <div className="h-5 flex-1 animate-pulse rounded bg-ink-100" />
      ) : schedule.error ? (
        <p className="flex-1 text-xs text-red-600">Could not load this day.</p>
      ) : column?.is_off || total === 0 ? (
        <p className="flex-1 text-xs text-ink-400">{column?.off_reason ?? "Not working"}</p>
      ) : (
        <>
          <div className="flex flex-1 flex-wrap gap-1">
            {column!.slots.map((s) => (
              <span
                key={s.time}
                title={`${formatTime(s.time)} — ${
                  s.is_booked ? s.appointment?.patient_name : "free"
                }`}
                className={`h-5 w-5 rounded ${
                  s.is_booked ? "bg-brand-500" : "bg-ink-100"
                }`}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-500">
            {booked}/{total}
          </span>
        </>
      )}
    </li>
  );
}

function OverrideForm({
  onClose,
  onSaved,
  therapistId,
}: {
  onClose: () => void;
  onSaved: () => void;
  therapistId: number;
}) {
  const [date, setDate] = useState(todayISO());
  const [isOff, setIsOff] = useState(true);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation(async (body: Record<string, unknown>) =>
    api.post(`/therapists/${therapistId}/schedule-exceptions`, body),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!date) {
      setLocalError("Choose a date.");
      return;
    }
    if (!isOff && end <= start) {
      setLocalError("End time must be after start time.");
      return;
    }
    setLocalError(null);

    const result = await save.run({
      date,
      is_off: isOff,
      // The API rejects a day marked off that also carries custom hours.
      custom_start: isOff ? null : `${start}:00`,
      custom_end: isOff ? null : `${end}:00`,
      reason: reason.trim() || null,
    });

    if (result) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule override"
      description="Mark a single date as off, or give it different hours. Custom hours also turn a normal day off into a working day."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="override-form" loading={save.isPending}>
            Save override
          </Button>
        </>
      }
    >
      <form id="override-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={localError ?? save.error} />

        <Field label="Date" htmlFor="o-date" required>
          <Input
            id="o-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsOff(true)}
            aria-pressed={isOff}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              isOff
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-[var(--border)] bg-white text-ink-500 hover:bg-ink-50"
            }`}
          >
            Day off
          </button>
          <button
            type="button"
            onClick={() => setIsOff(false)}
            aria-pressed={!isOff}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              !isOff
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-[var(--border)] bg-white text-ink-500 hover:bg-ink-50"
            }`}
          >
            Custom hours
          </button>
        </div>

        {!isOff ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" htmlFor="o-start" required>
              <Input
                id="o-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="o-end" required>
              <Input
                id="o-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Reason" htmlFor="o-reason">
          <Input
            id="o-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isOff ? "Conference, leave, public holiday…" : "Late start"}
          />
        </Field>
      </form>
    </Modal>
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
