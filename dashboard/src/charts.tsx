import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { num, shortDay, weekday } from "./format";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round "nice" upper bound and tick step for a y axis. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

/** Bar path with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 80), width - 80);
  return (
    <div className="tooltip" style={{ left, top: y }}>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export type DayPoint = { day: string; first: number; returning: number };

/** Stacked daily check-ins: first-time attendees under returning ones. */
export function DailyCheckIns({ data }: { data: DayPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const height = 240;
  const m = { top: 12, right: 8, bottom: 28, left: 36 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const { top, step } = niceScale(Math.max(1, ...data.map((d) => d.first + d.returning)));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(28, band - 4));
  const y = (v: number) => innerH - (v / top) * innerH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56)));
  const h = hover !== undefined ? data[hover] : undefined;

  return (
    <div ref={ref} className="chart" onMouseLeave={() => setHover(undefined)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Daily check-ins, first-time and returning attendees">
          <g transform={`translate(${m.left},${m.top})`}>
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} className={t === 0 ? "axis" : "grid"} />
                <text x={-8} dy="0.32em" textAnchor="end" className="tick">
                  {num(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = i * band + (band - barW) / 2;
              const firstH = innerH - y(d.first);
              const retH = innerH - y(d.returning);
              // 2px surface gap between the stacked segments.
              const gap = firstH > 0 && retH > 0 ? 2 : 0;
              const dim = hover !== undefined && hover !== i;
              return (
                <g key={d.day} opacity={dim ? 0.45 : 1}>
                  {d.returning === 0 ? (
                    <path d={barPath(x, innerH - firstH, barW, firstH)} fill="var(--series-1)" />
                  ) : (
                    <>
                      <rect x={x} y={innerH - firstH} width={barW} height={firstH} fill="var(--series-1)" />
                      <path d={barPath(x, innerH - firstH - retH, barW, Math.max(0, retH - gap))} fill="var(--series-2)" />
                    </>
                  )}
                  <rect
                    x={i * band}
                    y={0}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                  {i % labelEvery === 0 && (
                    <text x={i * band + band / 2} y={innerH + 18} textAnchor="middle" className="tick">
                      {shortDay(d.day)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {h && hover !== undefined && (
        <Tooltip x={m.left + hover * band + band / 2} y={m.top + y(h.first + h.returning) - 8} width={width}>
          <strong>
            {weekday(h.day)} {shortDay(h.day)}
          </strong>
          <span>
            <i style={{ background: "var(--series-1)" }} /> First check-in <b>{num(h.first)}</b>
          </span>
          <span>
            <i style={{ background: "var(--series-2)" }} /> Returning <b>{num(h.returning)}</b>
          </span>
          <span className="muted">Total {num(h.first + h.returning)}</span>
        </Tooltip>
      )}
    </div>
  );
}

/** Single-series vertical bars over a small integer domain (e.g. days attended). */
export function Histogram({ data, xLabel }: { data: { x: number; count: number }[]; xLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const height = 200;
  const m = { top: 12, right: 8, bottom: 40, left: 36 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const { top, step } = niceScale(Math.max(1, ...data.map((d) => d.count)));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(32, band - 4));
  const y = (v: number) => innerH - (v / top) * innerH;
  const h = hover !== undefined ? data[hover] : undefined;

  return (
    <div ref={ref} className="chart" onMouseLeave={() => setHover(undefined)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Attendees by ${xLabel}`}>
          <g transform={`translate(${m.left},${m.top})`}>
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} className={t === 0 ? "axis" : "grid"} />
                <text x={-8} dy="0.32em" textAnchor="end" className="tick">
                  {num(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => (
              <g key={d.x} opacity={hover !== undefined && hover !== i ? 0.45 : 1}>
                <path d={barPath(i * band + (band - barW) / 2, y(d.count), barW, innerH - y(d.count))} fill="var(--series-1)" />
                <rect x={i * band} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
                <text x={i * band + band / 2} y={innerH + 16} textAnchor="middle" className="tick">
                  {d.x}
                </text>
              </g>
            ))}
            <text x={innerW / 2} y={innerH + 34} textAnchor="middle" className="tick">
              {xLabel}
            </text>
          </g>
        </svg>
      )}
      {h && hover !== undefined && (
        <Tooltip x={m.left + hover * band + band / 2} y={m.top + y(h.count) - 8} width={width}>
          <strong>
            {h.x} {h.x === 1 ? "day" : "days"}
          </strong>
          <span>
            <b>{num(h.count)}</b> {h.count === 1 ? "attendee" : "attendees"}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars for an ordered funnel; each value labelled with its share of the first step. */
export function Funnel({ steps }: { steps: { label: string; value: number; hint: string }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="funnel">
      {steps.map((s) => (
        <div key={s.label} className="funnel-row" title={s.hint}>
          <div className="funnel-label">
            <span>{s.label}</span>
            <span className="funnel-value">
              {num(s.value)} <em>{Math.round((s.value / max) * 100)}%</em>
            </span>
          </div>
          <div className="funnel-track">
            <div className="funnel-bar" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export type SignupPoint = { day: string; added: number; total: number };

/** Running total of registrations per day, with the edition's first day marked. */
export function Signups({ data, startDay }: { data: SignupPoint[]; startDay?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const height = 200;
  const m = { top: 12, right: 8, bottom: 28, left: 36 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const { top, step } = niceScale(Math.max(1, ...data.map((d) => d.total)));
  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => innerH - (v / top) * innerH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.total)}`).join("");
  const area = data.length ? `${line}L${x(data.length - 1)},${innerH}L${x(0)},${innerH}Z` : "";
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64)));
  const startIndex = startDay ? data.findIndex((d) => d.day >= startDay) : -1;
  const h = hover !== undefined ? data[hover] : undefined;

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div ref={ref} className="chart" onMouseLeave={() => setHover(undefined)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Registrations over time">
          <defs>
            <linearGradient id="signups-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g transform={`translate(${m.left},${m.top})`}>
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} className={t === 0 ? "axis" : "grid"} />
                <text x={-8} dy="0.32em" textAnchor="end" className="tick">
                  {num(t)}
                </text>
              </g>
            ))}
            <path d={area} fill="url(#signups-fill)" />
            <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} />
            {startIndex >= 0 && (
              <g transform={`translate(${x(startIndex)},0)`}>
                <line y2={innerH} stroke="var(--sand)" strokeDasharray="3 3" />
                <text y={-2} textAnchor="middle" className="tick tick-strong">
                  day 1
                </text>
              </g>
            )}
            {data.map(
              (d, i) =>
                i % labelEvery === 0 && (
                  <text key={d.day} x={x(i)} y={innerH + 18} textAnchor="middle" className="tick">
                    {shortDay(d.day)}
                  </text>
                ),
            )}
            {h && hover !== undefined && <circle cx={x(hover)} cy={y(h.total)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
            <rect width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />
          </g>
        </svg>
      )}
      {h && hover !== undefined && (
        <Tooltip x={m.left + x(hover)} y={m.top + y(h.total) - 10} width={width}>
          <strong>{shortDay(h.day)}</strong>
          <span>
            New registrations <b>{num(h.added)}</b>
          </span>
          <span>
            Total so far <b>{num(h.total)}</b>
          </span>
        </Tooltip>
      )}
    </div>
  );
}
