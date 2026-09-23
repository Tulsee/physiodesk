"use client";

import Link from "next/link";
import { useState } from "react";

import { PaymentForm } from "@/components/billing/PaymentForm";
import { Receipt } from "@/components/billing/Receipt";
import { Button, Card, CardHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatMoney, moneyValue } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type InvoiceDetail } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export function InvoiceDetailView({ invoiceId }: { invoiceId: number }) {
  const invoice = useQuery<InvoiceDetail>(`/invoices/${invoiceId}`);
  const [payOpen, setPayOpen] = useState(false);
  const [payMode, setPayMode] = useState<"payment" | "refund">("payment");
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (invoice.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading invoice…" />
      </Card>
    );
  }

  if (invoice.error || !invoice.data) {
    return (
      <Card>
        <ErrorState
          message={invoice.error ?? "That invoice could not be found."}
          onRetry={invoice.refetch}
        />
      </Card>
    );
  }

  const inv = invoice.data;
  const due = moneyValue(inv.net_due);
  const received = moneyValue(inv.paid_amount);

  return (
    <>
      <Link
        href="/billing"
        className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink-800"
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
        All invoices
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-lg font-semibold tracking-tight text-ink-950">
                    {inv.service}
                  </h1>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  Invoice #{inv.id} ·{" "}
                  <Link
                    href={`/patients/${inv.patient_id}`}
                    className="text-brand-600 hover:text-brand-700"
                  >
                    {inv.patient_name}
                  </Link>{" "}
                  · {formatDate(inv.date)}
                </p>
              </div>
              <div className="no-print flex gap-2">
                <Button variant="secondary" onClick={() => setReceiptOpen(true)}>
                  Receipt
                </Button>
                {/* Refunds are only possible once money has been received. */}
                {received > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPayMode("refund");
                      setPayOpen(true);
                    }}
                  >
                    Refund
                  </Button>
                ) : null}
                {due > 0 ? (
                  <Button
                    onClick={() => {
                      setPayMode("payment");
                      setPayOpen(true);
                    }}
                  >
                    Record payment
                  </Button>
                ) : null}
              </div>
            </div>

            <dl className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
              <Total label="Amount" value={formatMoney(inv.amount)} />
              <Total label="Discount" value={formatMoney(inv.discount)} />
              <Total label="Received" value={formatMoney(inv.paid_amount)} />
              <Total
                label="Balance due"
                value={formatMoney(inv.net_due)}
                emphasis={due > 0}
              />
            </dl>

            {inv.notes ? (
              <p className="border-t border-[var(--border)] px-5 py-3 text-sm text-ink-600">
                {inv.notes}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Payment history"
              description="Every movement against this invoice, oldest first. A refund is a negative entry."
            />
            {inv.payments.length === 0 ? (
              <EmptyState
                title="No payments yet"
                message="Record a payment and the invoice status updates automatically."
                action={
                  <Button
                    onClick={() => {
                      setPayMode("payment");
                      setPayOpen(true);
                    }}
                  >
                    Record payment
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {inv.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        payment.is_refund
                          ? "bg-violet-50 text-violet-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={payment.is_refund ? "M19 12H5m7-7-7 7 7 7" : "M5 12h14m-7-7 7 7-7 7"} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">
                        {payment.is_refund ? "Refund" : "Payment"} ·{" "}
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDate(payment.date)}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        payment.is_refund ? "text-violet-700" : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Summary" />
          <div className="space-y-3 px-5 py-4 text-sm">
            <SummaryRow label="Gross" value={formatMoney(inv.amount)} />
            <SummaryRow label="Discount" value={`−${formatMoney(inv.discount)}`} />
            <div className="border-t border-[var(--border)] pt-3">
              <SummaryRow
                label="Payable"
                value={formatMoney(
                  (moneyValue(inv.amount) - moneyValue(inv.discount)).toFixed(2),
                )}
              />
            </div>
            <SummaryRow label="Received" value={formatMoney(inv.paid_amount)} />
            <div className="border-t border-[var(--border)] pt-3">
              <SummaryRow
                label="Balance due"
                value={formatMoney(inv.net_due)}
                strong
              />
            </div>
          </div>
        </Card>
      </div>

      {payOpen ? (
        <PaymentForm
          key={payMode}
          mode={payMode}
          onClose={() => setPayOpen(false)}
          onSaved={invoice.refetch}
          invoice={inv}
        />
      ) : null}

      <Receipt open={receiptOpen} onClose={() => setReceiptOpen(false)} invoiceId={inv.id} />
    </>
  );
}

function Total({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-white px-5 py-3.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          emphasis ? "text-amber-700" : "text-ink-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-medium text-ink-900" : "text-ink-500"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "font-semibold text-ink-950" : "text-ink-700"}`}
      >
        {value}
      </span>
    </div>
  );
}
