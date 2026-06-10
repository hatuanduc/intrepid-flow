export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="2.5" />
      <circle
        cx="12" cy="12" r="10"
        stroke="#94a3b8" strokeWidth="2.5"
        strokeDasharray="15.7 47.1"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.75s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

export default function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
    }}>
      <Spinner size={32} />
    </div>
  );
}
