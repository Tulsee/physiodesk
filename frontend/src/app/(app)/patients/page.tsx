"use client";

import Link from "next/link";
import { useState } from "react";

import { PatientForm } from "@/components/patients/PatientForm";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui/Primitives";
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/ui/States";
import { PatientStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { Page, Patient, Therapist } from "@/lib/types";
import { useDebounced, useMutation, useQuery } from "@/lib/useApi";

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  // Debounced so typing does not fire a request per keystroke.
  const debouncedSearch = useDebounced(search);

  const patients = useQuery<Page<Patient>>("/patients", {
    search: debouncedSearch,
    therapist_id: therapistId,
    status,
    page,
    page_size: 10,
  });

  const therapists = useQuery<Page<Therapist>>("/therapists", { page_size: 100 });
  const therapistList = therapists.data?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);

  const remove = useMutation(async (id: number) => api.delete(`/patients/${id}`));

  /** Any filter change returns to page 1 — page 3 of the old result set is meaningless. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const hasFilters = Boolean(search || therapistId || status);

  return (
    <>
      <PageHeader
        title="Patients"
        description="Everyone registered at the clinic."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add patient
          </Button>
        }
      />

      <Card>
        {/* Filters in one row above the list; all applied server-side. */}
        <div className="flex flex-wrap gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-[220px] flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => changeFilter(() => setSearch(e.target.value))}
              placeholder="Search name, phone or condition…"
              aria-label="Search patients"
            />
          </div>
          <Select
            value={therapistId}
            onChange={(e) => changeFilter(() => setTherapistId(e.target.value))}
            aria-label="Filter by therapist"
            className="w-auto min-w-[170px]"
          >
            <option value="">All therapists</option>
            {therapistList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="discharged">Discharged</option>
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() =>
                changeFilter(() => {
                  setSearch("");
                  setTherapistId("");
                  setStatus("");
                })
              }
            >
              Clear
            </Button>
          ) : null}
        </div>

        {patients.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : patients.error ? (
          <ErrorState message={patients.error} onRetry={patients.refetch} />
        ) : !patients.data?.items.length ? (
          <EmptyState
            title={hasFilters ? "No matching patients" : "No patients yet"}
            message={
              hasFilters
                ? "Try a different search or clear the filters."
                : "Add your first patient to get started."
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    changeFilter(() => {
                      setSearch("");
                      setTherapistId("");
                      setStatus("");
                    })
                  }
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setFormOpen(true)}>Add patient</Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
                  <th className="px-5 py-2.5 font-medium">Patient</th>
                  <th className="px-5 py-2.5 font-medium">Condition</th>
                  <th className="px-5 py-2.5 font-medium">Therapist</th>
                  <th className="px-5 py-2.5 font-medium">Sessions</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {patients.data.items.map((patient) => {
                  const therapist = therapistList.find(
                    (t) => t.id === patient.therapist_id,
                  );
                  return (
                    <tr key={patient.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {patient.name}
                        </Link>
                        <p className="text-xs text-ink-500">
                          {patient.phone ?? "No phone"}
                          {patient.age !== null ? ` · ${patient.age} yrs` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-ink-600">
                        {patient.condition ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-ink-600">
                        {therapist?.name ?? "Unassigned"}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-ink-600">
                        {patient.sessions_total
                          ? `${patient.sessions_used} / ${patient.sessions_total}`
                          : patient.sessions_used}
                      </td>
                      <td className="px-5 py-3">
                        <PatientStatusBadge status={patient.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(patient);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting(patient)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {patients.data ? (
          <Pagination page={patients.data} onPageChange={setPage} label="patients" />
        ) : null}
      </Card>

      {formOpen ? (
        <PatientForm
          key={editing?.id ?? "new"}
          onClose={() => setFormOpen(false)}
          onSaved={patients.refetch}
          patient={editing}
          therapists={therapistList}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await remove.run(deleting.id);
          if (ok !== null) {
            setDeleting(null);
            patients.refetch();
          }
        }}
        title="Delete patient"
        message={`Delete ${deleting?.name}? Their appointments, notes, reports and invoices will be removed too. This cannot be undone.`}
        loading={remove.isPending}
        error={remove.error}
      />
    </>
  );
}
