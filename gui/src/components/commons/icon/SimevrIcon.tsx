import { VitalVRLogo } from './VitalVRLogo';

// VitalVR : logo de l'appli (barre du haut, accueil)
export function SlimeVRIcon({ drag }: { drag?: boolean }) {
  return (
    <div data-electron-drag-region={drag} className="flex">
      <VitalVRLogo size={30} />
    </div>
  );
}
