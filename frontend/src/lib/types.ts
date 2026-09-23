export type UserRole = "front_desk";
export type Gender = "male" | "female" | "other";
export type PatientStatus = "active" | "on_hold" | "discharged";

export type AppointmentType = "initial_assessment" | "follow_up" | "therapy_session" | "review";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export type PaymentMethod = "cash" | "card" | "online" | "bank_transfer" | "insurance";
export type InvoiceStatus = "due" | "partial" | "paid" | "refunded";

export type NotificationType = "appointment_reminder" | "payment_reminder" | "follow_up" | "exercise_reminder";
export type NotificationChannel = "sms" | "email" | "whatsapp";
export type NotificationStatus = "scheduled" | "sent" | "failed" | "cancelled";

// --- envelopes ---

/** Shape returned by every list endpoint. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** One field-level problem from a 422. */
export interface FieldError {
  field: string;
  message: string;
  type: string;
}

// --- auth ---

export interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

// --- therapists ---

export interface Therapist {
  id: number;
  name: string;
  specialty: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  qualifications: string | null;
  experience_years: number | null;
  avatar_url: string | null;
  is_active: boolean;
  /** 0 = Monday ... 6 = Sunday, matching Python's date.weekday(). */
  work_days: number[];
  start_time: string;
  end_time: string;
  slot_minutes: number;
}

export interface ScheduleException {
  id: number;
  therapist_id: number;
  date: string;
  is_off: boolean;
  custom_start: string | null;
  custom_end: string | null;
  reason: string | null;
}

// --- patients ---

export interface Patient {
  id: number;
  name: string;
  age: number | null;
  gender: Gender | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  condition: string | null;
  therapist_id: number | null;
  status: PatientStatus;
  package: string | null;
  sessions_used: number;
  sessions_total: number | null;
  notes: string | null;
  created_at: string;
}

export interface PatientDetail extends Patient {
  therapist: Therapist | null;
}

// --- clinical notes and progress ---

export interface ClinicalNote {
  id: number;
  patient_id: number;
  therapist_id: number | null;
  date: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatment_given: string | null;
  exercises_prescribed: string | null;
  pain_score: number | null;
  rom_score: number | null;
  strength_score: number | null;
  milestone: string | null;
  created_at: string;
}

export interface ProgressPoint {
  date: string;
  value: number;
}

export interface MilestonePoint {
  date: string;
  milestone: string;
}

export interface ProgressSeries {
  patient_id: number;
  pain: ProgressPoint[];
  rom: ProgressPoint[];
  strength: ProgressPoint[];
  milestones: MilestonePoint[];
}

// --- reports ---

export interface ReportFile {
  id: number;
  patient_id: number;
  filename: string;
  content_type: string | null;
  size: number;
  uploaded_at: string;
}

// --- schedule ---

export interface Appointment {
  id: number;
  patient_id: number;
  therapist_id: number;
  date: string;
  time: string;
  duration_minutes: number;
  type: AppointmentType;
  status: AppointmentStatus;
  payment_method: PaymentMethod | null;
  payment_details: Record<string, unknown> | null;
  notes: string | null;
  outcome_note: string | null;
  cancellation_reason: string | null;
  patient_name: string | null;
  therapist_name: string | null;
}

export interface Slot {
  time: string;
  end_time: string;
  is_booked: boolean;
  appointment: Appointment | null;
}

export interface TherapistDaySchedule {
  therapist_id: number;
  therapist_name: string;
  slots: Slot[];
  is_off: boolean;
  off_reason: string | null;
}

export interface DaySchedule {
  date: string;
  therapists: TherapistDaySchedule[];
}

// --- billing ---

export interface Payment {
  id: number;
  invoice_id: number;
  date: string;
  /** Negative for a refund. */
  amount: string;
  method: PaymentMethod;
  details: Record<string, unknown> | null;
  note: string | null;
  is_refund: boolean;
}

export interface Invoice {
  id: number;
  patient_id: number;
  service: string;
  date: string;
  amount: string;
  discount: string;
  paid_amount: string;
  status: InvoiceStatus;
  notes: string | null;
  net_due: string;
}

export interface InvoiceDetail extends Invoice {
  patient_name: string | null;
  payments: Payment[];
}

export interface Receipt {
  invoice_id: number;
  issued_at: string;
  patient_name: string;
  patient_phone: string | null;
  service: string;
  date: string;
  amount: string;
  discount: string;
  paid_amount: string;
  net_due: string;
  status: InvoiceStatus;
  payments: Payment[];
}

// --- notifications ---

export interface Notification {
  id: number;
  patient_id: number;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  scheduled_for: string;
  sent_at: string | null;
  message: string;
  failure_reason: string | null;
  patient_name: string | null;
}

// --- dashboard ---

export interface DashboardSummary {
  date: string;
  patients_seen_today: number;
  appointments_today: number;
  therapists_on_duty: number;
  revenue_today: string;
  open_slots: number;
  total_slots: number;
  active_patients: number;
  outstanding_balance: string;
}

export interface CapacityEntry {
  therapist_id: number;
  therapist_name: string;
  booked: number;
  total: number;
  is_off: boolean;
  off_reason: string | null;
}

export interface RecentPatient {
  patient_id: number;
  name: string;
  condition: string | null;
  last_visit: string;
  status: PatientStatus;
}

// --- display labels ---

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  discharged: "Discharged",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  initial_assessment: "Initial assessment",
  follow_up: "Follow-up",
  therapy_session: "Therapy session",
  review: "Review",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  due: "Due",
  partial: "Partial",
  paid: "Paid",
  refunded: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  online: "Online",
  bank_transfer: "Bank transfer",
  insurance: "Insurance",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  appointment_reminder: "Appointment reminder",
  payment_reminder: "Payment reminder",
  follow_up: "Follow-up",
  exercise_reminder: "Exercise reminder",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  scheduled: "Scheduled",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** 0 = Monday, matching the backend's work_days encoding. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
