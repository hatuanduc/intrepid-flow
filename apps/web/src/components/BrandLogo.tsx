export default function BrandLogo({ height = 40 }: { height?: number }) {
  const width = Math.round(height * (170 / 40));
  return (
    <svg
      viewBox="0 0 170 40"
      width={width}
      height={height}
      aria-label="Intrepid"
      role="img"
    >
      <text
        y="30"
        style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}
        fontSize="30"
        fontWeight="800"
        fill="#0f172a"
        letterSpacing="-1.5"
      >
        intrepid
      </text>
    </svg>
  );
}
