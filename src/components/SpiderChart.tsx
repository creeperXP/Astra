/**
 * Student-actionable feature attribution (Dallas AI track).
 * Shows % plus short insight per axis so students know what to do.
 */
export interface SpiderAxis {
  value: number;
  insight: string;
}

interface SpiderChartProps {
  values: Record<string, number>;
  insights?: Record<string, string>;
  size?: number;
}

const DEFAULT_INSIGHTS: Record<string, string> = {
  'Prereq mastery': 'Focus on prerequisites first to avoid gaps.',
  'Course DFW': 'Lower DFW = historically more students succeed.',
  'Career fit': 'Aligns with your stated career goals.',
  'Difficulty': 'Based on workload and historical grades.',
  'Readiness': 'Your predicted readiness for this course.',
};

function getInsight(key: string, value: number, custom?: Record<string, string>): string {
  const v = value;
  if (custom?.[key]) return custom[key];
  const pct = Math.round(v * 100);
  if (key.toLowerCase().includes('prereq')) {
    if (pct >= 80) return 'You’re well prepared; consider helping peers.';
    if (pct >= 60) return 'Solid base. Review weak prereq topics before start.';
    return 'Spend time on prerequisites; they’re your main risk.';
  }
  if (key.toLowerCase().includes('dfw')) {
    if (pct >= 85) return 'Historically high pass rate. Good pick.';
    if (pct >= 70) return 'Moderate risk. Attend office hours early.';
    return 'Higher DFW rate. Plan extra study time and use TAs.';
  }
  if (key.toLowerCase().includes('career')) {
    if (pct >= 75) return 'Strong fit for your goals. Prioritize this.';
    if (pct >= 50) return 'Relevant. Balance with required courses.';
    return 'Lower alignment. Still take if required for degree.';
  }
  if (key.toLowerCase().includes('difficulty')) {
    if (pct >= 80) return 'Manageable load. Good for this semester.';
    if (pct >= 50) return 'Moderate. Don’t stack with other hard courses.';
    return 'High difficulty. Consider spreading load.';
  }
  return DEFAULT_INSIGHTS[key] ?? `${pct}% — review and plan accordingly.`;
}

export function SpiderChart({ values, insights, size = 140 }: SpiderChartProps) {
  const keys = Object.keys(values);
  if (keys.length === 0) return null;
  const n = keys.length;
  const radius = size / 2 - 10;
  const center = size / 2;
  const points: string[] = [];
  keys.forEach((k, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = radius * Math.max(0, Math.min(1, values[k]));
    const x = center + r * Math.cos(angle);
    const y = center - r * Math.sin(angle);
    points.push(`${x},${y}`);
  });
  const pathD = points.length ? `M ${points.join(' L ')} Z` : '';

  return (
    <div className="spider-chart">
      <p className="spider-title">Readiness & fit</p>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((f) => (
          <circle key={f} cx={center} cy={center} r={radius * f} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {keys.map((k, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center - radius * Math.sin(angle);
          return (
            <line key={k} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          );
        })}
        <path d={pathD} fill="rgba(96,165,250,0.22)" stroke="rgba(96,165,250,0.65)" strokeWidth="1.5" />
      </svg>
      <ul className="spider-legend">
        {keys.map((k) => (
          <li key={k} className="spider-legend-item">
            <div className="spider-legend-row">
              <span className="label">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="pct">{(values[k] * 100).toFixed(0)}%</span>
            </div>
            <p className="spider-insight">{getInsight(k, values[k], insights)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
