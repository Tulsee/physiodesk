"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/Primitives";
import { FormError } from "@/components/ui/States";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { useMutation } from "@/lib/useApi";

export function InvoiceForm({
  onClose,
  onSaved,
  patients,
  presetPatientId,
}: {
  onClose: () => void;
  onSaved: () => void;
  patients: Patient[];
  presetPatientId?: number;
}) {
  // Initialized on mount rather than reset in an effect: the parent mounts
  // this only while the dialog is open, with a key, so every open starts fresh.
  const [patientId, setPatientId] = useState(
    presetPatientId ? String(presetPatientId) : "",
  );
  const [service, setService] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation(async (body: Record<string, unknown>) =>
    api.post("/invoices", body),
  );

  /** Mirrors the backend: amount >= 0, discount >= 0, discount <= amount. */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!patientId) errors.patient_id = "Choose a patient.";
    if (!service.trim()) errors.service = "Describe the service.";
    if (!date) errors.date = "Date is required.";

    const amt = Number(amount);
    const disc = Number(discount || 0);
    if (!amount || Number.isNaN(amt) || amt < 0) {
      errors.amount = "Enter an amount of zero or more.";
    }
    if (disc < 0) errors.discount = "Discount cannot be negative.";
    else if (!Number.isNaN(amt) && disc > amt) {
      errors.discount = "Discount cannot exceed the amount.";
    }

    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const result = await save.run({
      patient_id: Number(patientId),
      service: service.trim(),
      date,
      // Sent as fixed-2 strings so the Decimal column receives exactly what was typed.
      amount: Number(amount).toFixed(2),
      discount: Number(discount || 0).toFixed(2),
      notes: notes.trim() || null,
    });

    if (result) {
      onSaved();
      onClose();
    }
  }

  const errorFor = (f: string) => localErrors[f] ?? save.fieldErrors[f];
  const payable = Math.max(0, Number(amount || 0) - Number(discount || 0));

  return (
    <Modal
      open
      onClose={onClose}
      title="New invoice"
      description="Status and paid amount are derived from payments — they cannot be set here."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={save.isPending}>
            Create invoice
          </Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError
          message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null}
        />

        <Field
          label="Patient"
          htmlFor="inv-patient"
          required
          error={errorFor("patient_id")}
        >
          <Select
            id="inv-patient"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            error={Boolean(errorFor("patient_id"))}
          >
            <option value="">Choose a patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Service" htmlFor="inv-service" required error={errorFor("service")}>
          <Input
            id="inv-service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            error={Boolean(errorFor("service"))}
            placeholder="Therapy session"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="inv-date" required error={errorFor("date")}>
            <Input
              id="inv-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={Boolean(errorFor("date"))}
            />
          </Field>
          <Field label="Amount" htmlFor="inv-amount" required error={errorFor("amount")}>
            <Input
              id="inv-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={Boolean(errorFor("amount"))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Discount" htmlFor="inv-discount" error={errorFor("discount")}>
            <Input
              id="inv-discount"
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              error={Boolean(errorFor("discount"))}
              placeholder="0.00"
            />
          </Field>
        </div>

        {amount ? (
          <p className="rounded-lg bg-ink-50 px-3.5 py-2.5 text-sm text-ink-600">
            Payable after discount:{" "}
            <span className="font-semibold tabular-nums text-ink-900">
              {payable.toFixed(2)}
            </span>
          </p>
        ) : null}

        <Field label="Notes" htmlFor="inv-notes">
          <Textarea
            id="inv-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
