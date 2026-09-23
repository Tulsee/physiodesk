"use client";

import { useState } from "react";

import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/Primitives";
import { EmptyState, ErrorState, FormError, TableSkeleton } from "@/components/ui/States";
import { NotificationStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TYPE_LABELS,
  type Notification,
  type NotificationChannel,
  type NotificationType,
  type Page,
  type Patient,
} from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

export default function NotificationsPage() {
  const [type, setType] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState<Notification | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const notifications = useQuery<Page<Notification>>("/notifications", {
    type,
    channel,
    status,
    page,
    page_size: 10,
  });

  const patients = useQuery<Page<Patient>>("/patients", { page_size: 200 });

  const send = useMutation(async (id: number) =>
    api.post<Notification>(`/notifications/${id}/send`),
  );
  const cancel = useMutation(async (id: number) =>
    api.post<Notification>(`/notifications/${id}/cancel`),
  );
  const remove = useMutation(async (id: number) => api.delete(`/notifications/${id}`));

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const hasFilters = Boolean(type || channel || status);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Reminders queued for patients. Delivery is simulated and logged by the server."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New notification
          </Button>
        }
      />

      {actionError ? (
        <div className="mb-4">
          <FormError message={actionError} />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-[var(--border)] px-5 py-4">
          <Select
            value={type}
            onChange={(e) => changeFilter(() => setType(e.target.value))}
            aria-label="Filter by type"
            className="w-auto min-w-[180px]"
          >
            <option value="">All types</option>
            {Object.entries(NOTIFICATION_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            value={channel}
            onChange={(e) => changeFilter(() => setChannel(e.target.value))}
            aria-label="Filter by channel"
            className="w-auto min-w-[130px]"
          >
            <option value="">All channels</option>
            {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
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
            <option value="scheduled">Scheduled</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() =>
                changeFilter(() => {
                  setType("");
                  setChannel("");
                  setStatus("");
                })
              }
            >
              Clear
            </Button>
          ) : null}
        </div>

        {notifications.isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : notifications.error ? (
          <ErrorState message={notifications.error} onRetry={notifications.refetch} />
        ) : !notifications.data?.items.length ? (
          <EmptyState
            title={hasFilters ? "No matching notifications" : "No notifications"}
            message={
              hasFilters
                ? "Try a different filter combination."
                : "Schedule a reminder and it appears here."
            }
            action={
              hasFilters ? null : (
                <Button onClick={() => setFormOpen(true)}>New notification</Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notifications.data.items.map((n) => {
              const editable = n.status === "scheduled" || n.status === "failed";
              return (
                <li key={n.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">
                          {NOTIFICATION_TYPE_LABELS[n.type]}
                        </span>
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">
                          {NOTIFICATION_CHANNEL_LABELS[n.channel]}
                        </span>
                        <NotificationStatusBadge status={n.status} />
                      </div>
                      <p className="mt-1 text-sm text-ink-600">{n.message}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        {n.patient_name} ·{" "}
                        {n.status === "sent" && n.sent_at
                          ? `Sent ${formatDateTime(n.sent_at)}`
                          : `Scheduled for ${formatDateTime(n.scheduled_for)}`}
                      </p>
                      {n.failure_reason ? (
                        <p className="mt-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                          {n.failure_reason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1">
                      {/* Sent notifications are a record of something that
                          happened, so only the queue is actionable. */}
                      {n.status !== "sent" && n.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={send.isPending}
                          onClick={async () => {
                            setActionError(null);
                            const result = await send.run(n.id);
                            if (result) notifications.refetch();
                            else setActionError(send.error);
                          }}
                        >
                          {n.status === "failed" ? "Retry" : "Send now"}
                        </Button>
                      ) : null}
                      {editable ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(n);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              setActionError(null);
                              const result = await cancel.run(n.id);
                              if (result) notifications.refetch();
                              else setActionError(cancel.error);
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(n)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {notifications.data ? (
          <Pagination
            page={notifications.data}
            onPageChange={setPage}
            label="notifications"
          />
        ) : null}
      </Card>

      {formOpen ? (
        <NotificationForm
          key={editing?.id ?? "new"}
          onClose={() => setFormOpen(false)}
          onSaved={notifications.refetch}
          patients={patients.data?.items ?? []}
          notification={editing}
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
            notifications.refetch();
          }
        }}
        title="Delete notification"
        message="Delete this notification? This cannot be undone."
        loading={remove.isPending}
        error={remove.error}
      />
    </>
  );
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`; the API returns a full ISO string. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function defaultSchedule(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

function NotificationForm({
  onClose,
  onSaved,
  patients,
  notification,
}: {
  onClose: () => void;
  onSaved: () => void;
  patients: Patient[];
  notification: Notification | null;
}) {
  // Initialized on mount rather than reset in an effect: the parent mounts
  // this only while the dialog is open, with a key, so every open starts fresh.
  const [patientId, setPatientId] = useState(
    notification ? String(notification.patient_id) : "",
  );
  const [type, setType] = useState<NotificationType>(
    notification?.type ?? "appointment_reminder",
  );
  const [channel, setChannel] = useState<NotificationChannel>(
    notification?.channel ?? "sms",
  );
  const [scheduledFor, setScheduledFor] = useState(() =>
    notification ? toLocalInput(notification.scheduled_for) : defaultSchedule(),
  );
  const [message, setMessage] = useState(notification?.message ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation(async (body: Record<string, unknown>) => {
    if (notification) return api.patch(`/notifications/${notification.id}`, body);
    return api.post("/notifications", body);
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!notification && !patientId) {
      setLocalError("Choose a patient.");
      return;
    }
    if (!message.trim()) {
      setLocalError("Write the message to send.");
      return;
    }
    if (!scheduledFor) {
      setLocalError("Choose when to send it.");
      return;
    }
    setLocalError(null);

    // datetime-local has no zone; convert through Date so the server gets UTC.
    const iso = new Date(scheduledFor).toISOString();
    const body = notification
      ? { type, channel, scheduled_for: iso, message: message.trim() }
      : {
          patient_id: Number(patientId),
          type,
          channel,
          scheduled_for: iso,
          message: message.trim(),
        };

    const result = await save.run(body);
    if (result) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={notification ? "Edit notification" : "New notification"}
      description="Nothing is actually sent — delivery is simulated and logged server-side."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="notification-form" loading={save.isPending}>
            {notification ? "Save changes" : "Schedule"}
          </Button>
        </>
      }
    >
      <form
        id="notification-form"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <FormError message={localError ?? save.error} />

        {!notification ? (
          <Field label="Patient" htmlFor="n-patient" required>
            <Select
              id="n-patient"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Choose a patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="n-type" required>
            <Select
              id="n-type"
              value={type}
              onChange={(e) => setType(e.target.value as NotificationType)}
            >
              {Object.entries(NOTIFICATION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Channel"
            htmlFor="n-channel"
            required
            hint="Email uses the patient's email; SMS and WhatsApp use their phone."
          >
            <Select
              id="n-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as NotificationChannel)}
            >
              {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Send at" htmlFor="n-when" required>
          <Input
            id="n-when"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </Field>

        <Field label="Message" htmlFor="n-message" required>
          <Textarea
            id="n-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Reminder: your physiotherapy session is tomorrow at 10am."
          />
        </Field>
      </form>
    </Modal>
  );
}
