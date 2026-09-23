"use client";

import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/Modal";
import { Button, Card, CardHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, FormError, LoadingState } from "@/components/ui/States";
import { API_URL, ApiError, api } from "@/lib/api";
import { formatDateTime, formatFileSize } from "@/lib/format";
import type { ReportFile } from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.txt";

export function ReportsTab({ patientId }: { patientId: number }) {
  const reports = useQuery<ReportFile[]>(`/patients/${patientId}/reports`);
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<ReportFile | null>(null);

  const upload = useMutation(async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return api.upload<ReportFile>(`/patients/${patientId}/reports`, body);
  });

  const remove = useMutation(async (id: number) => api.delete(`/reports/${id}`));

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const result = await upload.run(files[0]);
    if (result) reports.refetch();
    // Reset so selecting the same file twice in a row still fires a change event.
    if (inputRef.current) inputRef.current.value = "";
  }

  /**
   * Downloads go through fetch rather than a plain link: the endpoint needs the
   * Authorization header, which a browser navigation would not send.
   */
  async function download(report: ReportFile) {
    try {
      const blob = await api.blob(`/reports/${report.id}/download`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : "That file could not be downloaded.",
      );
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Documents"
          description="Scans, referrals and lab reports for this patient."
          action={
            <Button
              size="sm"
              loading={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              Upload
            </Button>
          }
        />

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {upload.error ? (
          <div className="px-5 pt-4">
            <FormError message={upload.error} />
          </div>
        ) : null}

        {reports.isLoading ? (
          <LoadingState />
        ) : reports.error ? (
          <ErrorState message={reports.error} onRetry={reports.refetch} />
        ) : !reports.data?.length ? (
          <EmptyState
            title="No documents"
            message={`Upload a PDF, image or document. Maximum size is set by the server (${API_URL.replace(
              /^https?:\/\//,
              "",
            )}).`}
            action={
              <Button onClick={() => inputRef.current?.click()}>Upload a file</Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {reports.data.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {report.filename}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatFileSize(report.size)} · {formatDateTime(report.uploaded_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => download(report)}>
                    Download
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(report)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
            reports.refetch();
          }
        }}
        title="Delete document"
        message={`Delete ${deleting?.filename}? The file is removed from the server and cannot be recovered.`}
        loading={remove.isPending}
        error={remove.error}
      />
    </>
  );
}
