"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Textarea } from "@/components/ui/Primitives";
import { FormError } from "@/components/ui/States";
import { api } from "@/lib/api";
import { WEEKDAY_LABELS, type Therapist } from "@/lib/types";
import { useMutation } from "@/lib/useApi";

export function TherapistForm({
  onClose,
  onSaved,
  therapist,
}: {
  onClose: () => void;
  onSaved: () => void;
  therapist?: Therapist | null;
}) {
  // Initialized on mount rather than reset in an effect: the parent mounts
  // this only while the dialog is open, with a key, so every open starts fresh.
  const [name, setName] = useState(therapist?.name ?? "");
  const [specialty, setSpecialty] = useState(therapist?.specialty ?? "");
  const [email, setEmail] = useState(therapist?.email ?? "");
  const [phone, setPhone] = useState(therapist?.phone ?? "");
  const [qualifications, setQualifications] = useState(therapist?.qualifications ?? "");
  const [experience, setExperience] = useState(
    therapist?.experience_years?.toString() ?? "",
  );
  const [bio, setBio] = useState(therapist?.bio ?? "");
  const [workDays, setWorkDays] = useState<number[]>(
    therapist?.work_days ?? [0, 1, 2, 3, 4],
  );
  const [startTime, setStartTime] = useState(
    therapist?.start_time.slice(0, 5) ?? "09:00",
  );
  const [endTime, setEndTime] = useState(therapist?.end_time.slice(0, 5) ?? "17:00");
  const [slotMinutes, setSlotMinutes] = useState(
    therapist?.slot_minutes.toString() ?? "45",
  );
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation(async (body: Record<string, unknown>) => {
    if (therapist) return api.patch(`/therapists/${therapist.id}`, body);
    return api.post("/therapists", body);
  });

  function toggleDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  /** Mirrors the backend, including the "window shorter than one slot" rule. */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required.";
    if (!specialty.trim()) errors.specialty = "Specialty is required.";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const span = toMinutes(endTime) - toMinutes(startTime);
    const slot = Number(slotMinutes);

    if (span <= 0) {
      errors.end_time = "End time must be after start time.";
    } else if (slot > 0 && span < slot) {
      errors.slot_minutes = `The working window is ${span} minutes, shorter than one ${slot}-minute slot.`;
    }
    if (!slot || slot < 5 || slot > 240) {
      errors.slot_minutes = "Slot length must be between 5 and 240 minutes.";
    }

    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const result = await save.run({
      name: name.trim(),
      specialty: specialty.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      qualifications: qualifications.trim() || null,
      experience_years: experience.trim() === "" ? null : Number(experience),
      bio: bio.trim() || null,
      work_days: workDays,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      slot_minutes: Number(slotMinutes),
    });

    if (result) {
      onSaved();
      onClose();
    }
  }

  const errorFor = (f: string) => localErrors[f] ?? save.fieldErrors[f];

  return (
    <Modal
      open
      onClose={onClose}
      title={therapist ? "Edit therapist" : "Add therapist"}
      description="Working hours here determine the slots the schedule offers."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="therapist-form" loading={save.isPending}>
            {therapist ? "Save changes" : "Add therapist"}
          </Button>
        </>
      }
    >
      <form id="therapist-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormError
          message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="t-name" required error={errorFor("name")}>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(errorFor("name"))}
              placeholder="Dr. Meera Rao"
            />
          </Field>
          <Field
            label="Specialty"
            htmlFor="t-specialty"
            required
            error={errorFor("specialty")}
          >
            <Input
              id="t-specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              error={Boolean(errorFor("specialty"))}
              placeholder="Sports Rehabilitation"
            />
          </Field>
          <Field label="Email" htmlFor="t-email" error={errorFor("email")}>
            <Input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={Boolean(errorFor("email"))}
            />
          </Field>
          <Field label="Phone" htmlFor="t-phone">
            <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Qualifications" htmlFor="t-quals">
            <Input
              id="t-quals"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="BPT, MPT (Sports Medicine)"
            />
          </Field>
          <Field label="Years of experience" htmlFor="t-exp">
            <Input
              id="t-exp"
              type="number"
              min={0}
              max={70}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Bio" htmlFor="t-bio">
          <Textarea id="t-bio" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-700">Working days</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, day) => {
              const on = workDays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={on}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-[var(--border)] bg-white text-ink-500 hover:bg-ink-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {workDays.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600">
              With no working days, this therapist will have no slots at all.
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start time" htmlFor="t-start" required>
            <Input
              id="t-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="End time" htmlFor="t-end" required error={errorFor("end_time")}>
            <Input
              id="t-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              error={Boolean(errorFor("end_time"))}
            />
          </Field>
          <Field
            label="Slot length"
            htmlFor="t-slot"
            required
            error={errorFor("slot_minutes")}
            hint="Minutes per appointment."
          >
            <Input
              id="t-slot"
              type="number"
              min={5}
              max={240}
              step={5}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(e.target.value)}
              error={Boolean(errorFor("slot_minutes"))}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
