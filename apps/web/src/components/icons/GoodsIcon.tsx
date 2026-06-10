export default function GoodsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M1.5 3.5h11l-1 7h-9l-1-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5 3.5V2.5a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
