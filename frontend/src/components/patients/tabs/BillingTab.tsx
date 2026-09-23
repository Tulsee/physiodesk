"use client";

import Link from "next/link";
import { useState } from "react";

import { Pagination } from "@/components/ui/Pagination";
import { Card, CardHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatMoney, moneyValue } from "@/lib/format";
import type { Invoice, Page } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export function BillingTab({ patientId }: { patientId: number }) {
  const [page, setPage] = useState(1);
  const invoices = useQuery<Page<Invoice>>("/invoices", {
    patient_id: patientId,
    page,
    page_size: 10,
  });

  const items = invoices.data?.items ?? [];
  // Totals for the visible page only — stated as such, so the number is not
  // mistaken for the patient's lifetime balance.
  const outstanding = items.reduce((sum, i) => sum + moneyValue(i.net_due), 0);

  return (
    <Card>
      <CardHeader
        title="Invoices"
        description={
          items.length
            ? `${formatMoney(outstanding.toFixed(2))} outstanding on this page.`
            : undefined
        }
        action={
          <Link
            href={`/billing?patient_id=${patientId}`}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Open in billing →
          </Link>
        }
      />

      {invoices.isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : invoices.error ? (
        <ErrorState message={invoices.error} onRetry={invoices.refetch} />
      ) : !items.length ? (
        <EmptyState
          title="No invoices"
          message="Invoices raised for this patient appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
                <th className="px-5 py-2.5 font-medium">Service</th>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                <th className="px-5 py-2.5 text-right font-medium">Paid</th>
                <th className="px-5 py-2.5 text-right font-medium">Due</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-ink-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/billing/${invoice.id}`}
                      className="font-medium text-ink-900 hover:text-brand-700"
                    >
                      {invoice.service}
                    </Link>
                    {moneyValue(invoice.discount) > 0 ? (
                      <p className="text-xs text-ink-500">
                        {formatMoney(invoice.discount)} discount
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-600">
                    {formatDate(invoice.date)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-600">
                    {formatMoney(invoice.amount)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-600">
                    {formatMoney(invoice.paid_amount)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-ink-900">
                    {formatMoney(invoice.net_due)}
                  </td>
                  <td className="px-5 py-3">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoices.data ? (
        <Pagination page={invoices.data} onPageChange={setPage} label="invoices" />
      ) : null}
    </Card>
  );
}
