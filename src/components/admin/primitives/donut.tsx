type Props = {
  /** Current count, e.g. 38. */
  value: number;
  /** Cap, e.g. 40. */
  max: number;
  /** Lower-case label like "Sisters" or "Brothers". */
  label: string;
  color?: string;
};

/**
 * 140×140 ring chart used by the Registration pool tile. Fills the
 * arc clockwise from 12 o'clock proportional to value/max. Center
 * label shows "{value}/{max}" + the label in muted small caps.
 */
export function Donut({ value, max, label, color = "var(--accent)" }: Props) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 58;
  const c = 2 * Math.PI * r;
  return (
    <div className="donut">
      <svg width="140" height="140" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line-2)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${c * pct} ${c}`}
          strokeDashoffset={c * 0.25}
          transform="rotate(-90 70 70)"
          strokeLinecap="round"
        />
      </svg>
      <div className="donut-lbl">
        <div>
          <div className="big">
            {value}
            <span style={{ color: "var(--mute)", fontSize: 20 }}>/{max}</span>
          </div>
          <div className="sm">{label}</div>
        </div>
      </div>
    </div>
  );
}
