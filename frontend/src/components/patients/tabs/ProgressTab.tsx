"use client";

import { useState } from "react";

import { ProgressChart, SERIES_COLORS } from "@/components/charts/ProgressChart";
import { Card, CardHeader } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { formatDate } from "@/lib/format";
import type { ProgressSeries } from "@/lib/types";
import { useQuery } from "@/lib/useApi";

export function ProgressTab({ patientId }: { patientId: number }) {
  const progress = useQuery<ProgressSeries>(`/patients/${patientId}/progress`);
  const [showTable, setShowTable] = useState(false);

  if (progress.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading progress…" />
      </Card>
    );
  }

  if (progress.error || !progress.data) {
    return (
      <Card>
        <ErrorState
          message={progress.error ?? "Progress could not be loaded."}
          onRetry={progress.refetch}
        />
      </Card>
    );
  }

  const { pain, rom, strength, milestones } = progress.data;
  const hasAnything =
    pain.length > 0 || rom.length > 0 || strength.length > 0 || milestones.length > 0;

  if (!hasAnything) {
    return (
      <Card>
        <EmptyState
          title="No progress data yet"
          message="Progress is derived from clinical notes. Record a note with pain, range-of-motion or strength scores and the charts appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          Derived from this patient&apos;s clinical notes.
        </p>
        {/* Table view: the relief path for anyone who cannot read the charts. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-brand-600 transition hover:text-brand-700"
        >
          {showTable ? "Show charts" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <ProgressTable pain={pain} rom={rom} strength={strength} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <ProgressChart
            title="Pain"
            scaleHint="Numeric rating scale, 0–10. Lower is better."
            points={pain}
            series="pain"
            domain={[0, 10]}
            ticks={[0, 5, 10]}
            lowerIsBetter
          />
          <ProgressChart
            title="Range of motion"
            scaleHint="Percentage of normal range, 0–100%."
            points={rom}
            series="rom"
            domain={[0, 100]}
            ticks={[0, 50, 100]}
          />
          <ProgressChart
            title="Strength"
            scaleHint="Manual muscle test grade, 0–5."
            points={strength}
            series="strength"
            domain={[0, 5]}
            ticks={[0, 2.5, 5]}
          />

          <Card>
            <CardHeader
              title="Milestones"
              description="Flagged sessions, oldest first."
            />
            {milestones.length === 0 ? (
              <EmptyState
                title="No milestones yet"
                message="Add a milestone to a clinical note to mark a turning point in recovery."
              />
            ) : (
              <ol className="px-5 py-4">
                {milestones.map((m, i) => (
                  <li key={`${m.date}-${i}`} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                      {i < milestones.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-ink-200" />
                      ) : null}
                    </div>
                    <div className="-mt-0.5 pb-1">
                      <p className="text-sm font-medium text-ink-900">{m.milestone}</p>
                      <p className="text-xs text-ink-400">{formatDate(m.date)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/** Every measurement as rows — the accessible equivalent of the three charts. */
function ProgressTable({
  pain,
  rom,
  strength,
}: Pick<ProgressSeries, "pain" | "rom" | "strength">) {
  const dates = Array.from(
    new Set([...pain, ...rom, ...strength].map((p) => p.date)),
  ).sort();

  const lookup = (points: { date: string; value: number }[], date: string) =>
    points.find((p) => p.date === date)?.value ?? null;

  return (
    <Card>
      <CardHeader title="All measurements" description="One row per session." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
              <th className="px-5 py-2.5 font-medium">Date</th>
              <th className="px-5 py-2.5 font-medium">
                <ColourKey colour={SERIES_COLORS.pain} /> Pain (0–10)
              </th>
              <th className="px-5 py-2.5 font-medium">
                <ColourKey colour={SERIES_COLORS.rom} /> ROM (%)
              </th>
              <th className="px-5 py-2.5 font-medium">
                <ColourKey colour={SERIES_COLORS.strength} /> Strength (0–5)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {dates.map((date) => (
              <tr key={date}>
                <td className="px-5 py-2.5 font-medium text-ink-900">
                  {formatDate(date)}
                </td>
                <td className="px-5 py-2.5 tabular-nums text-ink-700">
                  {lookup(pain, date) ?? "—"}
                </td>
                <td className="px-5 py-2.5 tabular-nums text-ink-700">
                  {lookup(rom, date) ?? "—"}
                </td>
                <td className="px-5 py-2.5 tabular-nums text-ink-700">
                  {lookup(strength, date) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ColourKey({ colour }: { colour: string }) {
  return (
    <span
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: colour }}
      aria-hidden="true"
    />
  );
}
