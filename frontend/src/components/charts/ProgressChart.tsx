"use client";

/**
 * A single-series line chart for one clinical measure over time.
 *
 * Pain (0-10), ROM (0-100%) and strength (0-5) are three different scales, so
 * they render as three small multiples rather than one chart with three
 * y-axes. A dual-axis chart would let the viewer read a crossing as meaningful
 * when it is an artefact of the scaling.
 *
 * One series per chart means no legend is needed — the chart title names it.
 */

import { useState } from "react";

import { formatDate, parseDate } from "@/lib/format";
import type { ProgressPoint } from "@/lib/types";

// Validated with the dataviz palette checker against a white surface
// (all-pairs: CVD ΔE 13.0, normal-vision ΔE 16.3, contrast ≥ 3:1).
export const SERIES_COLORS = {
  pain: "#e34948",
  rom: "#2a78d6",
  strength: "#4a3aa7",
} as const;

export type SeriesKey = keyof typeof SERIES_COLORS;

const W = 560;
const H = 180;
const PAD = { top: 16, right: 20, bottom: 30, left: 34 };

interface Props {
  title: string;
  /** Shown under the title — what the scale actually means. */
  scaleHint: string;
  points: ProgressPoint[];
  series: SeriesKey;
  domain: [number, number];
  /** Ticks drawn on the y-axis; also the gridlines. */
  ticks: number[];
  /** True when a lower number is the better outcome (pain). */
  lowerIsBetter?: boolean;
}

export function ProgressChart({
  title,
  scaleHint,
  points,
  series,
  domain,
  ticks,
  lowerIsBetter = false,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const color = SERIES_COLORS[series];

  // Fewer than two points is not a trend; a single dot would imply one.
  if (points.length < 2) {
    return (
      <figure className="rounded-xl border border-[var(--border)] bg-white p-5">
        <ChartTitle title={title} hint={scaleHint} />
        <div className="flex h-[180px] items-center justify-center">
          <p className="max-w-[240px] text-center text-xs text-ink-400">
            {points.length === 0
              ? "No measurements recorded yet."
              : "Only one measurement so far — a second is needed to show a trend."}
          </p>
        </div>
      </figure>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const [min, max] = domain;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = last - first;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;

  // Only the first and last x labels are drawn: a date under every point
  // collides once a patient has more than a handful of sessions.
  const edgeLabels = [0, points.length - 1];

  return (
    <figure className="rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <ChartTitle title={title} hint={scaleHint} />
        {delta !== 0 ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              improved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta} {improved ? "improved" : "worsened"}
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        style={{ height: H }}
        role="img"
        aria-label={`${title}: ${points.length} measurements from ${formatDate(
          points[0].date,
        )} to ${formatDate(points[points.length - 1].date)}. Started at ${first}, now ${last}.`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          // Map the pointer back into viewBox space, then snap to the nearest point.
          const vx = ((event.clientX - rect.left) / rect.width) * W;
          const ratio = (vx - PAD.left) / plotW;
          const idx = Math.round(ratio * (points.length - 1));
          setHover(Math.min(points.length - 1, Math.max(0, idx)));
        }}
      >
        {/* Gridlines: solid hairlines, one step off the surface. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#eeeff1"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-400"
              style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
            >
              {t}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="#d9dce0"
          strokeWidth="1"
        />

        {/* Crosshair under the marks so it never sits on top of the data. */}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="#b8bec6"
            strokeWidth="1"
          />
        ) : null}

        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5 : 4}
            fill={color}
            // 2px surface ring keeps markers legible where they overlap the line.
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}

        {edgeLabels.map((i) => (
          <text
            key={`xl-${i}`}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-ink-400"
            style={{ fontSize: 10 }}
          >
            {parseDate(points[i].date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </text>
        ))}

        {/* Direct label on the endpoint only — a number on every point is chaos. */}
        <text
          x={x(points.length - 1)}
          y={y(last) - 12}
          textAnchor="end"
          style={{ fontSize: 11, fontWeight: 600 }}
          fill={color}
        >
          {last}
        </text>
      </svg>

      {/* Tooltip lives in the DOM rather than the SVG so it can use normal text styles. */}
      <div className="mt-1 h-8">
        {hover !== null ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs shadow-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="text-ink-500">{formatDate(points[hover].date)}</span>
            <span className="font-semibold tabular-nums text-ink-900">
              {points[hover].value}
            </span>
          </div>
        ) : (
          <p className="text-xs text-ink-400">Hover the chart for a reading.</p>
        )}
      </div>
    </figure>
  );
}

function ChartTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-400">{hint}</p>
    </div>
  );
}
