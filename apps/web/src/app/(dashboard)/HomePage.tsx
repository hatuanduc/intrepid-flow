'use client';

import React, { useMemo } from 'react';
import s from './HomePage.module.css';

/* ── Mock data ── */
const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const ORDER_DATA   = [14, 22, 17, 30, 19, 28, 24]; // last 7 days
const REVENUE_DATA = [18.2, 31.5, 24.1, 44.0, 27.3, 39.8, 35.4]; // triệu VND

const RECENT_ORDERS = [
  { id: 'DH-1042', customer: 'Nguyễn Văn A', items: 3, amount: '4.200.000 ₫', status: 'done',    time: '14:32' },
  { id: 'DH-1041', customer: 'Trần Thị B',    items: 1, amount: '850.000 ₫',   status: 'pending', time: '13:15' },
  { id: 'DH-1040', customer: 'Lê Minh C',     items: 5, amount: '9.750.000 ₫', status: 'done',    time: '11:48' },
  { id: 'DH-1039', customer: 'Phạm Quỳnh D',  items: 2, amount: '2.100.000 ₫', status: 'pending', time: '10:22' },
  { id: 'DH-1038', customer: 'Hoàng Văn E',   items: 4, amount: '6.400.000 ₫', status: 'done',    time: '09:05' },
];

/* ── SVG Sparkline ── */
function Sparkline({ data, color, fillColor, w = 700, h = 140 }: {
  data: number[];
  color: string;
  fillColor: string;
  w?: number;
  h?: number;
}) {
  const points = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padX = 8;
    const padY = 10;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    return data.map((v, i) => ({
      x: padX + (i / (data.length - 1)) * innerW,
      y: padY + innerH - ((v - min) / range) * innerH,
    }));
  }, [data, w, h]);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;
  const xStep = (w - 16) / (data.length - 1);

  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} width="100%" style={{ display: 'block' }}>
      {/* Y grid lines */}
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={8} x2={w - 8} y1={10 + (1 - t) * (h - 20)} y2={10 + (1 - t) * (h - 20)}
          stroke="#f0f4f8" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <path d={areaPath} fill={fillColor} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}
      {/* X labels */}
      {DAYS.map((d, i) => (
        <text key={d} x={8 + i * xStep} y={h + 20} textAnchor="middle"
          fontSize="11" fill="#8898aa" fontFamily="inherit">
          {d}
        </text>
      ))}
    </svg>
  );
}

/* ── Stat card ── */
function StatCard({ label, value, delta, positive }: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
}) {
  return (
    <div className={s.statCard}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      <div className={s.statDelta}>
        <span className={positive ? s.deltaUp : s.deltaDown}>
          {positive ? '▲' : '▼'} {delta}
        </span>
        <span>so với hôm qua</span>
      </div>
    </div>
  );
}

/* ── Status badge ── */
function Badge({ status }: { status: string }) {
  if (status === 'done')    return <span className={`${s.badge} ${s.badgeGreen}`}>Hoàn thành</span>;
  if (status === 'pending') return <span className={`${s.badge} ${s.badgeYellow}`}>Chờ xử lý</span>;
  return <span className={`${s.badge} ${s.badgeGray}`}>{status}</span>;
}

/* ── Page ── */
export default function HomePage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.greeting}>Tổng quan</h1>
        <p className={s.date}>{dateStr}</p>
      </div>

      {/* Stats */}
      <div className={s.statsRow}>
        <StatCard label="Đơn hàng hôm nay"   value="24"          delta="12%"      positive />
        <StatCard label="Doanh thu"           value="35,4 tr ₫"   delta="8%"       positive />
        <StatCard label="Khách hàng mới"      value="6"           delta="2"        positive />
        <StatCard label="Đơn chờ xử lý"       value="8"           delta="3"        positive={false} />
      </div>

      {/* Chart */}
      <div className={s.chartCard}>
        <div className={s.chartHeader}>
          <span className={s.chartTitle}>Đơn hàng 7 ngày qua</span>
          <span className={s.chartMeta}>Tổng: {ORDER_DATA.reduce((a, b) => a + b, 0)} đơn</span>
        </div>
        <div className={s.chartWrap}>
          <Sparkline data={ORDER_DATA} color="#625afa" fillColor="rgba(98,90,250,0.08)" />
        </div>
      </div>

      {/* Recent orders */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.sectionTitle}>Đơn hàng gần đây</span>
          <a href="/orders" className={s.sectionLink}>Xem tất cả →</a>
        </div>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Số SP</th>
              <th>Giờ</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Tổng tiền</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_ORDERS.map(o => (
              <tr key={o.id}>
                <td style={{ fontWeight: 600, color: '#625afa' }}>{o.id}</td>
                <td>{o.customer}</td>
                <td>{o.items}</td>
                <td style={{ color: '#8898aa' }}>{o.time}</td>
                <td><Badge status={o.status} /></td>
                <td style={{ textAlign: 'right' }} className={s.amount}>{o.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
