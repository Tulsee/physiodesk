"use client";

import Link from "next/link";
import { useState } from "react";

import { InvoiceForm } from "@/components/billing/InvoiceForm";
import { Pagination } from "@/components/ui/Pagination";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatMoney, moneyValue } from "@/lib/format";
import type { Invoice, Page, Patient } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export default function BillingPage() {
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const invoices = useQuery<Page<Invoice>>("/invoices", {
    patient_id: patientId,
    status,
    date_from: dateFrom,
    date_to: dateTo,
    page,
    page_size: 10,
  });

  const patients = useQuery<Page<Patient>>("/patients", { page_size: 200 });
  const patientList = patients.data?.items ?? [];
  const nameFor = (id: number) => patientList.find((p) => p.id === id)?.name ?? `#${id}`;

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const hasFilters = Boolean(patientId || status || dateFrom || dateTo);

  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices, payments and refunds."
        action={<Button onClick={() => setFormOpen(true)}>New invoice</Button>}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] px-5 py-4">
          <Select
            value={patientId}
            onChange={(e) => changeFilter(() => setPatientId(e.target.value))}
            aria-label="Filter by patient"
            className="w-auto min-w-[180px]"
          >
            <option value="">All patients</option>
            {patientList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => changeFilter(() => setStatus(e.target.value))}
            aria-label="Filter by status"
            className="w-auto min-w-[140px]"
          >
            <option value="">All statuses</option>
            <option value="due">Due</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
          </Select>
          <div className="flex items-end gap-2">
            <label className="text-xs text-ink-500">
              From
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => changeFilter(() => setDateFrom(e.target.value))}
                className="mt-1 w-auto"
              />
            </label>
            <label className="text-xs text-ink-500">
              To
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => changeFilter(() => setDateTo(e.target.value))}
                className="mt-1 w-auto"
              />
            </label>
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() =>
                changeFilter(() => {
                  setPatientId("");
                  setStatus("");
                  setDateFrom("");
                  setDateTo("");
                })
              }
            >
              Clear
            </Button>
          ) : null}
        </div>

        {invoices.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : invoices.error ? (
          <ErrorState message={invoices.error} onRetry={invoices.refetch} />
        ) : !invoices.data?.items.length ? (
          <EmptyState
            title={hasFilters ? "No matching invoices" : "No invoices yet"}
            message={
              hasFilters
                ? "Try a different filter combination."
                : "Raise an invoice to start tracking payments."
            }
            action={
              hasFilters ? null : (
                <Button onClick={() => setFormOpen(true)}>New invoice</Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
                  <th className="px-5 py-2.5 font-medium">Patient</th>
                  <th className="px-5 py-2.5 font-medium">Service</th>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-5 py-2.5 text-right font-medium">Due</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {invoices.data.items.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/billing/${invoice.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {nameFor(invoice.patient_id)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {invoice.service}
                      {moneyValue(invoice.discount) > 0 ? (
                        <span className="ml-1.5 text-xs text-ink-400">
                          −{formatMoney(invoice.discount)}
                        </span>
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

      {formOpen ? (
        <InvoiceForm
          onClose={() => setFormOpen(false)}
          onSaved={invoices.refetch}
          patients={patientList}
        />
      ) : null}
    </>
  );
}
