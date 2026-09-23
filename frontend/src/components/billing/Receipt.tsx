"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { formatDate, formatDateTime, formatMoney, moneyValue } from "@/lib/format";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type Receipt as ReceiptData,
} from "@/lib/types";
import { useQuery } from "@/lib/useApi";

/**
 * Printable receipt.
 *
 * The data comes from `/invoices/{id}/receipt` rather than being assembled
 * client-side, so the printed totals are the server's numbers. Printing uses
 * the browser's own dialog; `.no-print` hides the surrounding chrome.
 */
export function Receipt({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: number;
}) {
  const receipt = useQuery<ReceiptData>(open ? `/invoices/${invoiceId}/receipt` : null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receipt"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()} disabled={!receipt.data}>
            Print
          </Button>
        </>
      }
    >
      {receipt.isLoading ? (
        <LoadingState />
      ) : receipt.error || !receipt.data ? (
        <ErrorState
          message={receipt.error ?? "The receipt could not be loaded."}
          onRetry={receipt.refetch}
        />
      ) : (
        <ReceiptBody data={receipt.data} />
      )}
    </Modal>
  );
}

function ReceiptBody({ data }: { data: ReceiptData }) {
  const payable = moneyValue(data.amount) - moneyValue(data.discount);

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-base font-semibold tracking-tight text-ink-950">
            PhysioDesk
          </p>
          <p className="text-xs text-ink-500">Physiotherapy clinic</p>
        </div>
        <div className="text-right">
          <p className="font-medium text-ink-900">Receipt #{data.invoice_id}</p>
          <p className="text-xs text-ink-500">Issued {formatDateTime(data.issued_at)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-[var(--border)] py-4">
        <Line label="Patient" value={data.patient_name} />
        <Line label="Phone" value={data.patient_phone ?? "—"} />
        <Line label="Service" value={data.service} />
        <Line label="Service date" value={formatDate(data.date)} />
      </dl>

      <dl className="space-y-2 border-b border-[var(--border)] py-4">
        <Amount label="Amount" value={formatMoney(data.amount)} />
        {moneyValue(data.discount) > 0 ? (
          <Amount label="Discount" value={`−${formatMoney(data.discount)}`} />
        ) : null}
        <Amount label="Payable" value={formatMoney(payable.toFixed(2))} />
        <Amount label="Received" value={formatMoney(data.paid_amount)} />
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
          <span className="font-semibold text-ink-900">Balance due</span>
          <span className="font-semibold tabular-nums text-ink-950">
            {formatMoney(data.net_due)}
          </span>
        </div>
      </dl>

      {data.payments.length > 0 ? (
        <div className="py-4">
          <p className="mb-2 text-xs font-medium text-ink-500">Payment history</p>
          <ul className="space-y-1.5">
            {data.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3">
                <span className="text-ink-600">
                  {formatDate(payment.date)} ·{" "}
                  {payment.is_refund ? "Refund" : PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.note ? ` · ${payment.note}` : ""}
                </span>
                <span className="shrink-0 tabular-nums text-ink-800">
                  {formatMoney(payment.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-[var(--border)] pt-3 text-center text-xs text-ink-400">
        Status: {INVOICE_STATUS_LABELS[data.status]} · Thank you for choosing PhysioDesk.
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-ink-800">{value}</dd>
    </div>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}
