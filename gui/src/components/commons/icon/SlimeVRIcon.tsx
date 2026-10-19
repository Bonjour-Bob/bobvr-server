// SlimeVR Mod : le logo SlimeVR est remplace par Bob
export function SlimeVRIcon({ width = 28 }: { width?: number }) {
  return (
    <img
      src="/images/bob-logo.png"
      alt="SlimeVR Mod"
      draggable={false}
      className="keep-colors object-contain"
      style={{ width, height: width }}
    />
  );
}
