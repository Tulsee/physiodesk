"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Select } from "@/components/ui/Primitives";
import { FormError } from "@/components/ui/States";
import { api } from "@/lib/api";
import { formatMoney, moneyValue, todayISO } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type InvoiceDetail, type PaymentMethod } from "@/lib/types";
import { useMutation } from "@/lib/useApi";

/**
 * Records a payment or a refund.
 *
 * A refund is the same endpoint with a negative amount — the form collects a
 * positive figure and negates it on submit, because asking a user to type a
 * minus sign invites mistakes.
 */
export function PaymentForm({
  mode,
  onClose,
  onSaved,
  invoice,
}: {
  mode: "payment" | "refund";
  onClose: () => void;
  onSaved: () => void;
  invoice: InvoiceDetail;
}) {
  const isRefund = mode === "refund";
  const due = moneyValue(invoice.net_due);
  const received = moneyValue(invoice.paid_amount);
  const ceiling = isRefund ? received : due;

  // Initialized on mount rather than reset in an effect: the parent mounts this
  // only while the dialog is open, with a key, so every open starts fresh.
  // Pre-filled with the full outstanding balance, since settling in full is the
  // common case and it is easier to edit down than to type out.
  const [amount, setAmount] = useState(() => (ceiling > 0 ? ceiling.toFixed(2) : ""));
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation(async (body: Record<string, unknown>) =>
    api.post(`/invoices/${invoice.id}/payments`, body),
  );

  /** The same ceilings the server enforces, checked here for a faster answer. */
  function validate(): boolean {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return false;
    }
    if (value > ceiling) {
      setLocalError(
        isRefund
          ? `A refund cannot exceed the ${formatMoney(invoice.paid_amount)} received on this invoice.`
          : `That exceeds the outstanding balance of ${formatMoney(invoice.net_due)}.`,
      );
      return false;
    }
    if (!date) {
      setLocalError("Choose a date.");
      return false;
    }
    setLocalError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const signed = isRefund ? -Number(amount) : Number(amount);
    const result = await save.run({
      date,
      amount: signed.toFixed(2),
      method,
      details: reference.trim() ? { reference: reference.trim() } : null,
      note: note.trim() || null,
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
      title={isRefund ? "Record refund" : "Record payment"}
      description={
        isRefund
          ? `Up to ${formatMoney(invoice.paid_amount)} can be refunded.`
          : `${formatMoney(invoice.net_due)} outstanding on this invoice.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={save.isPending}>
            {isRefund ? "Record refund" : "Record payment"}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={localError ?? save.error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={isRefund ? "Refund amount" : "Amount"}
            htmlFor="pay-amount"
            required
            error={save.fieldErrors.amount}
          >
            <Input
              id="pay-amount"
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={Boolean(localError || save.fieldErrors.amount)}
            />
          </Field>

          <Field label="Date" htmlFor="pay-date" required>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Method" htmlFor="pay-method" required>
          <Select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reference"
          htmlFor="pay-ref"
          hint="Transaction id, card last 4, or insurer reference."
        >
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>

        <Field label="Note" htmlFor="pay-note">
          <Input
            id="pay-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isRefund ? "Why is this being refunded?" : "Optional"}
          />
        </Field>
      </form>
    </Modal>
  );
}
