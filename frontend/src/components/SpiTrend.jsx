import { useEffect, useState } from 'react';
import { api, classify, CLASS_STYLE, fmtDate } from '../lib/api.js';

const W = 300; const H = 96; const PAD = { l: 26, r: 8, t: 8, b: 18 };

/** SPI over time for one school (single series, 0-100 scale, class thresholds as guides). */
export default function SpiTrend({ schoolId, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let alive = true;
    api.history(schoolId).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [schoolId, refreshKey]);

  if (!rows) return <div className="h-[96px] animate-pulse rounded-xl bg-gray-50" />;
  if (rows.length < 2) {
    return <p className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-400">The trend appears after the second assessment.</p>;
  }

  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / (rows.length - 1);
  const y = (v) => PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / 100;
  const pts = rows.map((r, i) => [x(i), y(r.spi)]);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const last = rows[rows.length - 1];
  const delta = Math.round((last.spi - rows[rows.length - 2].spi) * 10) / 10;
  const shown = hover === null ? null : rows[hover];

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-gray-700">SPI trend · {rows.length} assessments</span>
        <span className={delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-gray-500'}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {delta > 0 ? '+' : ''}{delta} since last
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`SPI from ${rows[0].spi}% to ${last.spi}%`}
          onMouseLeave={() => setHover(null)}>
          {[0, 60, 80, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#eef0f3" strokeDasharray={v === 60 || v === 80 ? '3 3' : undefined} />
              <text x={PAD.l - 5} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{v}</text>
            </g>
          ))}
          <path d={line} fill="none" stroke="#0f0f10" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([a, b], i) => (
            <g key={rows[i].id}>
              <circle cx={a} cy={b} r={hover === i ? 5 : 4} fill={CLASS_STYLE[classify(rows[i].spi)].color} stroke="#fff" strokeWidth="2" />
              <rect x={a - 12} y={0} width={24} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          ))}
          <text x={PAD.l} y={H - 4} fontSize="8" fill="#9ca3af">{fmtDate(rows[0].assessed_on)}</text>
          <text x={W - PAD.r} y={H - 4} fontSize="8" fill="#9ca3af" textAnchor="end">{fmtDate(last.assessed_on)}</text>
        </svg>
        {shown && (
          <div className="pointer-events-none absolute -top-1 rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow"
            style={{ left: `${(pts[hover][0] / W) * 100}%`, transform: 'translate(-50%, -100%)' }}>
            <b>{shown.spi}%</b> · {fmtDate(shown.assessed_on)}
          </div>
        )}
      </div>
    </div>
  );
}
