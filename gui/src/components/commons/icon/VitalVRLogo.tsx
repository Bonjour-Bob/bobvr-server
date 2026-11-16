// VitalVR : logo (un battement qui forme un V)
export function VitalVRLogo({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="VitalVR"
    >
      <defs>
        <linearGradient id="vitalvr-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12303A" />
          <stop offset="1" stopColor="#061015" />
        </linearGradient>
        <linearGradient id="vitalvr-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2EE6A8" />
          <stop offset="1" stopColor="#25B9F5" />
        </linearGradient>
      </defs>
      <rect
        x="8"
        y="8"
        width="240"
        height="240"
        rx="56"
        fill="url(#vitalvr-bg)"
      />
      <polyline
        points="30,126 72,126 90,98 128,198 170,58 188,126 226,126"
        fill="none"
        stroke="url(#vitalvr-line)"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
