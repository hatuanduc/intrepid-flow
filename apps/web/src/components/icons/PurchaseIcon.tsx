export default function PurchaseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M1.5 1.5h1.5l1.5 7h6.5l1-5H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6" cy="12" r="1" fill="currentColor"/>
      <circle cx="10" cy="12" r="1" fill="currentColor"/>
    </svg>
  );
}
