"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/Primitives";
import { FormError } from "@/components/ui/States";
import { api } from "@/lib/api";
import type { Patient, Therapist } from "@/lib/types";
import { useMutation } from "@/lib/useApi";

interface FormState {
  name: string;
  age: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  condition: string;
  therapist_id: string;
  status: string;
  package: string;
  sessions_used: string;
  sessions_total: string;
  notes: string;
}

const BLANK: FormState = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  condition: "",
  therapist_id: "",
  status: "active",
  package: "",
  sessions_used: "0",
  sessions_total: "",
  notes: "",
};

function toForm(patient: Patient): FormState {
  return {
    name: patient.name,
    age: patient.age?.toString() ?? "",
    gender: patient.gender ?? "",
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: patient.address ?? "",
    condition: patient.condition ?? "",
    therapist_id: patient.therapist_id?.toString() ?? "",
    status: patient.status,
    package: patient.package ?? "",
    sessions_used: patient.sessions_used.toString(),
    sessions_total: patient.sessions_total?.toString() ?? "",
    notes: patient.notes ?? "",
  };
}

/** Empty strings become null, numeric strings become numbers. */
function toPayload(form: FormState) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const str = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    name: form.name.trim(),
    age: num(form.age),
    gender: str(form.gender),
    phone: str(form.phone),
    email: str(form.email),
    address: str(form.address),
    condition: str(form.condition),
    therapist_id: num(form.therapist_id),
    status: form.status,
    package: str(form.package),
    sessions_used: Number(form.sessions_used || 0),
    sessions_total: num(form.sessions_total),
    notes: str(form.notes),
  };
}

export function PatientForm({
  onClose,
  onSaved,
  patient,
  therapists,
}: {
  onClose: () => void;
  onSaved: () => void;
  patient?: Patient | null;
  therapists: Therapist[];
}) {
  // Initialized on mount rather than reset in an effect: the parent mounts
  // this component only while the dialog is open, with a key, so a fresh
  // state is guaranteed for every open.
  const [form, setForm] = useState<FormState>(() => (patient ? toForm(patient) : BLANK));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation(async (body: ReturnType<typeof toPayload>) => {
    if (patient) return api.patch(`/patients/${patient.id}`, body);
    return api.post("/patients", body);
  });

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Mirrors the backend rules so the obvious mistakes never cost a round trip. */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required.";
    if (form.age && (Number(form.age) < 0 || Number(form.age) > 120)) {
      errors.age = "Age must be between 0 and 120.";
    }
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      errors.email = "Enter a valid email address.";
    }
    const used = Number(form.sessions_used || 0);
    const total = form.sessions_total ? Number(form.sessions_total) : null;
    if (used < 0) errors.sessions_used = "Cannot be negative.";
    if (total !== null && used > total) {
      errors.sessions_used = `Cannot exceed the ${total} sessions in the package.`;
    }
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    const result = await save.run(toPayload(form));
    if (result) {
      onSaved();
      onClose();
    }
  }

  const errorFor = (field: string) => localErrors[field] ?? save.fieldErrors[field];

  return (
    <Modal
      open
      onClose={onClose}
      title={patient ? "Edit patient" : "Add patient"}
      description={
        patient ? `Updating ${patient.name}.` : "Register a new patient at the clinic."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" loading={save.isPending}>
            {patient ? "Save changes" : "Add patient"}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* A field-level 422 is shown on the field; this carries anything else. */}
        <FormError
          message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" required error={errorFor("name")}>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              error={Boolean(errorFor("name"))}
              placeholder="Anil Shrestha"
            />
          </Field>

          <Field label="Condition" htmlFor="condition" error={errorFor("condition")}>
            <Input
              id="condition"
              value={form.condition}
              onChange={(e) => set("condition", e.target.value)}
              placeholder="ACL reconstruction rehab"
            />
          </Field>

          <Field label="Age" htmlFor="age" error={errorFor("age")}>
            <Input
              id="age"
              type="number"
              min={0}
              max={120}
              value={form.age}
              onChange={(e) => set("age", e.target.value)}
              error={Boolean(errorFor("age"))}
            />
          </Field>

          <Field label="Gender" htmlFor="gender">
            <Select
              id="gender"
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
            >
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          <Field label="Phone" htmlFor="phone" error={errorFor("phone")}>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="9801234567"
            />
          </Field>

          <Field label="Email" htmlFor="email" error={errorFor("email")}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              error={Boolean(errorFor("email"))}
            />
          </Field>

          <Field label="Assigned therapist" htmlFor="therapist_id">
            <Select
              id="therapist_id"
              value={form.therapist_id}
              onChange={(e) => set("therapist_id", e.target.value)}
            >
              <option value="">Unassigned</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.specialty}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="discharged">Discharged</option>
            </Select>
          </Field>

          <Field label="Package" htmlFor="package">
            <Input
              id="package"
              value={form.package}
              onChange={(e) => set("package", e.target.value)}
              placeholder="10-session package"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Sessions used"
              htmlFor="sessions_used"
              error={errorFor("sessions_used")}
            >
              <Input
                id="sessions_used"
                type="number"
                min={0}
                value={form.sessions_used}
                onChange={(e) => set("sessions_used", e.target.value)}
                error={Boolean(errorFor("sessions_used"))}
              />
            </Field>
            <Field label="Total" htmlFor="sessions_total">
              <Input
                id="sessions_total"
                type="number"
                min={0}
                value={form.sessions_total}
                onChange={(e) => set("sessions_total", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <Field label="Address" htmlFor="address">
          <Textarea
            id="address"
            rows={2}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
