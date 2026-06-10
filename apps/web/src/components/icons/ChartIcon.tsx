export default function ChartIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M1.5 12.5V2.5M1.5 12.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4 9.5L6.5 6 9 8l3-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
