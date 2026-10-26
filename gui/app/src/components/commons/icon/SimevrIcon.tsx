// SlimeVR Mod : le logo SlimeVR est remplace par Bob
export function SlimeVRIcon({ drag }: { drag?: boolean }) {
  return (
    <img
      src="/images/bob-logo.png"
      alt="SlimeVR Mod"
      draggable={false}
      className="keep-colors h-[30px] w-[30px] object-contain"
      data-electron-drag-region={drag}
    />
  );
}
