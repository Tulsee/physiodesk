"use client";

import { useState } from "react";

import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui/Primitives";
import { EmptyState, ErrorState, FormError, LoadingState } from "@/components/ui/States";
import { api } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/format";
import type { ClinicalNote, Page, PatientDetail } from "@/lib/types";
import { useMutation, useQuery } from "@/lib/useApi";

interface NoteForm {
  date: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  treatment_given: string;
  exercises_prescribed: string;
  pain_score: string;
  rom_score: string;
  strength_score: string;
  milestone: string;
}

const BLANK: NoteForm = {
  date: todayISO(),
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  treatment_given: "",
  exercises_prescribed: "",
  pain_score: "",
  rom_score: "",
  strength_score: "",
  milestone: "",
};

export function NotesTab({ patient }: { patient: PatientDetail }) {
  const [page, setPage] = useState(1);
  const notes = useQuery<Page<ClinicalNote>>(
    `/patients/${patient.id}/clinical-notes`,
    { page, page_size: 5 },
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalNote | null>(null);
  const [deleting, setDeleting] = useState<ClinicalNote | null>(null);

  const remove = useMutation(async (id: number) => api.delete(`/clinical-notes/${id}`));

  return (
    <>
      <Card>
        <CardHeader
          title="Clinical notes"
          description="Newest first. Scores here drive the progress charts."
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add note
            </Button>
          }
        />

        {notes.isLoading ? (
          <LoadingState />
        ) : notes.error ? (
          <ErrorState message={notes.error} onRetry={notes.refetch} />
        ) : !notes.data?.items.length ? (
          <EmptyState
            title="No clinical notes"
            message="Record a session note to start tracking this patient's progress."
            action={<Button onClick={() => setFormOpen(true)}>Add note</Button>}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notes.data.items.map((note) => (
              <li key={note.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      {formatDate(note.date)}
                    </p>
                    {note.milestone ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {note.milestone}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(note);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(note)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Score label="Pain" value={note.pain_score} suffix="/10" />
                  <Score label="ROM" value={note.rom_score} suffix="%" />
                  <Score label="Strength" value={note.strength_score} suffix="/5" />
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <SoapEntry label="Subjective" value={note.subjective} />
                  <SoapEntry label="Objective" value={note.objective} />
                  <SoapEntry label="Assessment" value={note.assessment} />
                  <SoapEntry label="Plan" value={note.plan} />
                  <SoapEntry label="Treatment given" value={note.treatment_given} />
                  <SoapEntry label="Exercises" value={note.exercises_prescribed} />
                </dl>
              </li>
            ))}
          </ul>
        )}

        {notes.data ? (
          <Pagination page={notes.data} onPageChange={setPage} label="notes" />
        ) : null}
      </Card>

      {formOpen ? (
        <NoteForm
          key={editing?.id ?? "new"}
          onClose={() => setFormOpen(false)}
          onSaved={notes.refetch}
          patientId={patient.id}
          note={editing}
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
            notes.refetch();
          }
        }}
        title="Delete note"
        message={`Delete the note from ${
          deleting ? formatDate(deleting.date) : ""
        }? Its scores will disappear from the progress charts.`}
        loading={remove.isPending}
        error={remove.error}
      />
    </>
  );
}

function Score({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix: string;
}) {
  if (value === null) return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg bg-ink-50 px-2.5 py-1 text-xs">
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold tabular-nums text-ink-900">
        {value}
        {suffix}
      </span>
    </span>
  );
}

function SoapEntry({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-700">{value}</dd>
    </div>
  );
}

function NoteForm({
  onClose,
  onSaved,
  patientId,
  note,
}: {
  onClose: () => void;
  onSaved: () => void;
  patientId: number;
  note: ClinicalNote | null;
}) {
  // Initialized on mount rather than reset in an effect: the parent mounts
  // this only while the dialog is open, with a key, so every open starts fresh.
  const [form, setForm] = useState<NoteForm>(() =>
    note
      ? {
          date: note.date,
          subjective: note.subjective ?? "",
          objective: note.objective ?? "",
          assessment: note.assessment ?? "",
          plan: note.plan ?? "",
          treatment_given: note.treatment_given ?? "",
          exercises_prescribed: note.exercises_prescribed ?? "",
          pain_score: note.pain_score?.toString() ?? "",
          rom_score: note.rom_score?.toString() ?? "",
          strength_score: note.strength_score?.toString() ?? "",
          milestone: note.milestone ?? "",
        }
      : BLANK,
  );
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation(async (body: Record<string, unknown>) => {
    if (note) return api.patch(`/clinical-notes/${note.id}`, body);
    return api.post(`/patients/${patientId}/clinical-notes`, body);
  });

  function set<K extends keyof NoteForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Same bounds the API enforces, so an out-of-range score never costs a round trip. */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.date) errors.date = "Date is required.";
    const range = (v: string, lo: number, hi: number) =>
      v !== "" && (Number(v) < lo || Number(v) > hi);
    if (range(form.pain_score, 0, 10)) errors.pain_score = "Pain is scored 0–10.";
    if (range(form.rom_score, 0, 100)) errors.rom_score = "ROM is a percentage, 0–100.";
    if (range(form.strength_score, 0, 5))
      errors.strength_score = "Strength is graded 0–5.";
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const str = (v: string) => (v.trim() === "" ? null : v.trim());

    const result = await save.run({
      date: form.date,
      subjective: str(form.subjective),
      objective: str(form.objective),
      assessment: str(form.assessment),
      plan: str(form.plan),
      treatment_given: str(form.treatment_given),
      exercises_prescribed: str(form.exercises_prescribed),
      pain_score: num(form.pain_score),
      rom_score: num(form.rom_score),
      strength_score: num(form.strength_score),
      milestone: str(form.milestone),
    });

    if (result) {
      onSaved();
      onClose();
    }
  }

  const errorFor = (f: string) => localErrors[f] ?? save.fieldErrors[f];

  return (
    <Modal
      open
      onClose={onClose}
      title={note ? "Edit clinical note" : "Add clinical note"}
      description="Scores are optional — leave blank if not measured this session."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="note-form" loading={save.isPending}>
            {note ? "Save changes" : "Add note"}
          </Button>
        </>
      }
    >
      <form id="note-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormError
          message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null}
        />

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date" htmlFor="note-date" required error={errorFor("date")}>
            <Input
              id="note-date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              error={Boolean(errorFor("date"))}
            />
          </Field>
          <Field label="Pain (0–10)" htmlFor="pain" error={errorFor("pain_score")}>
            <Input
              id="pain"
              type="number"
              min={0}
              max={10}
              value={form.pain_score}
              onChange={(e) => set("pain_score", e.target.value)}
              error={Boolean(errorFor("pain_score"))}
            />
          </Field>
          <Field label="ROM (0–100%)" htmlFor="rom" error={errorFor("rom_score")}>
            <Input
              id="rom"
              type="number"
              min={0}
              max={100}
              value={form.rom_score}
              onChange={(e) => set("rom_score", e.target.value)}
              error={Boolean(errorFor("rom_score"))}
            />
          </Field>
          <Field
            label="Strength (0–5)"
            htmlFor="strength"
            error={errorFor("strength_score")}
          >
            <Input
              id="strength"
              type="number"
              min={0}
              max={5}
              value={form.strength_score}
              onChange={(e) => set("strength_score", e.target.value)}
              error={Boolean(errorFor("strength_score"))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subjective" htmlFor="subjective">
            <Textarea
              id="subjective"
              rows={3}
              value={form.subjective}
              onChange={(e) => set("subjective", e.target.value)}
              placeholder="What the patient reports…"
            />
          </Field>
          <Field label="Objective" htmlFor="objective">
            <Textarea
              id="objective"
              rows={3}
              value={form.objective}
              onChange={(e) => set("objective", e.target.value)}
              placeholder="What you measured or observed…"
            />
          </Field>
          <Field label="Assessment" htmlFor="assessment">
            <Textarea
              id="assessment"
              rows={3}
              value={form.assessment}
              onChange={(e) => set("assessment", e.target.value)}
            />
          </Field>
          <Field label="Plan" htmlFor="plan">
            <Textarea
              id="plan"
              rows={3}
              value={form.plan}
              onChange={(e) => set("plan", e.target.value)}
            />
          </Field>
          <Field label="Treatment given" htmlFor="treatment">
            <Textarea
              id="treatment"
              rows={2}
              value={form.treatment_given}
              onChange={(e) => set("treatment_given", e.target.value)}
            />
          </Field>
          <Field label="Exercises prescribed" htmlFor="exercises">
            <Textarea
              id="exercises"
              rows={2}
              value={form.exercises_prescribed}
              onChange={(e) => set("exercises_prescribed", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Milestone"
          htmlFor="milestone"
          hint="Set this on the sessions worth flagging — it appears on the progress timeline."
        >
          <Input
            id="milestone"
            value={form.milestone}
            onChange={(e) => set("milestone", e.target.value)}
            placeholder="Full weight bearing achieved"
          />
        </Field>
      </form>
    </Modal>
  );
}
