export default function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="1" width="5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M2.5 4.5h7M6 4.5v6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}
