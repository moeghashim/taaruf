type Props = {
  data: number[];
  color?: string;
};

/**
 * Tiny inline sparkline used inside stat cards. 60×24 viewport,
 * pure SVG polyline, no axes or tooltips. Pass an array of
 * 4-12 numbers; min/max auto-scale.
 */
export function Sparkline({ data, color = "var(--accent)" }: Props) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${24 - ((v - min) / range) * 20 - 2}`)
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 60 24" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.2" points={points} />
    </svg>
  );
}
