"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/Primitives";
import { FormError } from "@/components/ui/States";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import {
  APPOINTMENT_TYPE_LABELS,
  type Appointment,
  type AppointmentType,
  type DaySchedule,
  type Patient,
} from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

/**
 * Booking and rescheduling.
 *
 * When rescheduling, the free-slot list is re-derived for the chosen date from
 * the same `/schedule` endpoint the grid uses — so the options offered are
 * exactly the ones the server will accept.
 */
export function AppointmentForm({
  onClose,
  onSaved,
  patients,
  date,
  presetTherapistId,
  presetTherapistName,
  presetTime,
  appointment,
}: {
  onClose: () => void;
  onSaved: () => void;
  patients: Patient[];
  date: string;
  presetTherapistId?: number;
  presetTherapistName?: string;
  presetTime?: string;
  appointment?: Appointment | null;
}) {
  const isReschedule = Boolean(appointment);

  // Initialized on mount rather than reset in an effect: the parent mounts
  // this only while the dialog is open, with a key, so every open starts fresh.
  const [patientId, setPatientId] = useState(
    appointment ? String(appointment.patient_id) : "",
  );
  const [type, setType] = useState<AppointmentType>(
    appointment?.type ?? "therapy_session",
  );
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [newDate, setNewDate] = useState(appointment?.date ?? date);
  const [newTime, setNewTime] = useState(appointment?.time ?? presetTime ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const therapistId = appointment?.therapist_id ?? presetTherapistId;

  // Only queried while rescheduling — a new booking already knows its slot.
  const slots = useQuery<DaySchedule>(
    isReschedule && therapistId ? "/schedule" : null,
    { date: newDate, therapist_id: therapistId },
  );

  const save = useMutation(async (body: Record<string, unknown>) => {
    if (appointment) return api.patch(`/appointments/${appointment.id}`, body);
    return api.post("/appointments", body);
  });

  const column = slots.data?.therapists?.[0];
  const available =
    column?.slots.filter(
      (s) => !s.is_booked || s.appointment?.id === appointment?.id,
    ) ?? [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);

    if (!isReschedule && !patientId) {
      setLocalError("Choose a patient for this appointment.");
      return;
    }
    if (!newTime) {
      setLocalError("Choose a time.");
      return;
    }

    const body = isReschedule
      ? { date: newDate, time: newTime, type, notes: notes.trim() || null }
      : {
          patient_id: Number(patientId),
          therapist_id: therapistId,
          date,
          time: newTime,
          type,
          notes: notes.trim() || null,
        };

    const result = await save.run(body);
    if (result) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isReschedule ? "Reschedule appointment" : "Book appointment"}
      description={
        isReschedule
          ? `Moving ${appointment?.patient_name}'s session with ${appointment?.therapist_name}.`
          : `${presetTherapistName} at ${presetTime ? formatTime(presetTime) : ""}.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="appointment-form" loading={save.isPending}>
            {isReschedule ? "Move appointment" : "Book"}
          </Button>
        </>
      }
    >
      <form id="appointment-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* The server rejects double bookings and out-of-hours times with a 409;
            its message is more specific than anything guessable here. */}
        <FormError message={localError ?? save.error} />

        {isReschedule ? (
          <>
            <Field label="New date" htmlFor="appt-date" required>
              <Input
                id="appt-date"
                type="date"
                value={newDate}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setNewTime("");
                }}
              />
            </Field>

            <Field
              label="New time"
              htmlFor="appt-time"
              required
              hint={
                slots.isLoading
                  ? "Checking availability…"
                  : slots.error || column?.is_off
                    ? undefined
                    : `${available.length} slot${available.length === 1 ? "" : "s"} free.`
              }
              error={
                // A failed availability lookup must say so: an empty dropdown
                // otherwise reads as "fully booked".
                slots.error
                  ? `Could not check availability — ${slots.error}`
                  : column?.is_off
                    ? `${appointment?.therapist_name} is not working then — ${column.off_reason}.`
                    : undefined
              }
            >
              <Select
                id="appt-time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                disabled={slots.isLoading || Boolean(slots.error) || available.length === 0}
                error={Boolean(slots.error || column?.is_off)}
              >
                <option value="">
                  {slots.isLoading
                    ? "Loading…"
                    : slots.error
                      ? "Unavailable"
                      : "Choose a slot"}
                </option>
                {available.map((s) => (
                  <option key={s.time} value={s.time}>
                    {formatTime(s.time)} – {formatTime(s.end_time)}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Patient" htmlFor="appt-patient" required>
            <Select
              id="appt-patient"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Choose a patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.condition ? ` — ${p.condition}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Type" htmlFor="appt-type">
          <Select
            id="appt-type"
            value={type}
            onChange={(e) => setType(e.target.value as AppointmentType)}
          >
            {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" htmlFor="appt-notes">
          <Textarea
            id="appt-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the therapist should know beforehand…"
          />
        </Field>
      </form>
    </Modal>
  );
}
