export default function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5A4.5 4.5 0 003.5 6c0 2.21-.9 3.5-1.5 4h12c-.6-.5-1.5-1.79-1.5-4A4.5 4.5 0 008 1.5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M6.5 14a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
