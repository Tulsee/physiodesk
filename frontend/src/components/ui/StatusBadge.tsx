/**
 * Enum values rendered as badges.
 *
 * Keeping the value-to-tone mapping here means a status looks the same
 * wherever it appears — the list, the detail page and the dashboard.
 */

import {
  APPOINTMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  NOTIFICATION_STATUS_LABELS,
  PATIENT_STATUS_LABELS,
  type AppointmentStatus,
  type InvoiceStatus,
  type NotificationStatus,
  type PatientStatus,
} from "@/lib/types";

import { Badge, type Tone } from "./Primitives";

const PATIENT_TONES: Record<PatientStatus, Tone> = {
  active: "green",
  on_hold: "amber",
  discharged: "neutral",
};

const APPOINTMENT_TONES: Record<AppointmentStatus, Tone> = {
  scheduled: "blue",
  completed: "green",
  cancelled: "neutral",
  no_show: "red",
};

const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  due: "amber",
  partial: "blue",
  paid: "green",
  // Refunded is not a failure, so it reads as distinct rather than alarming.
  refunded: "violet",
};

const NOTIFICATION_TONES: Record<NotificationStatus, Tone> = {
  scheduled: "blue",
  sent: "green",
  failed: "red",
  cancelled: "neutral",
};

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return <Badge tone={PATIENT_TONES[status]}>{PATIENT_STATUS_LABELS[status]}</Badge>;
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge tone={APPOINTMENT_TONES[status]}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return (
    <Badge tone={NOTIFICATION_TONES[status]}>
      {NOTIFICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
