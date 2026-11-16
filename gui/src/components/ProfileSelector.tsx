import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';
import { Typography } from './commons/Typography';
import {
  ModProfile,
  PROFILE_INFO,
  profileLabel,
  useModProfiles,
} from './settings/pages/DanceSettings';

// VitalVR : choix du profil dans la barre du haut (comme les profils de la
// v22), pour changer de mode d'un clic sans aller dans les reglages
export function ProfileSelector() {
  const { active, select } = useModProfiles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (profile: ModProfile | null) => {
    setOpen(false);
    select(profile);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={classNames(
          'flex items-center gap-2 h-7 px-3 rounded-lg',
          'bg-background-60 hover:bg-background-50'
        )}
      >
        <Typography color="secondary">Profil</Typography>
        <Typography bold>{profileLabel(active)}</Typography>
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          className={classNames(
            'fill-background-10 transition-transform',
            open && 'rotate-180'
          )}
        >
          <path d="M12 16l-7-7 1.4-1.4 5.6 5.6 5.6-5.6L19 9z" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-9 z-[100] w-72 rounded-lg bg-background-70 border border-background-50 shadow-lg p-1 flex flex-col"
        >
          {PROFILE_INFO.map((profile) => (
            <button
              type="button"
              role="option"
              aria-selected={active === profile.id}
              key={profile.id}
              onClick={() => choose(profile.id)}
              className={classNames(
                'flex flex-col items-start text-left rounded-md px-3 py-2',
                active === profile.id
                  ? 'bg-accent-background-40'
                  : 'hover:bg-background-60'
              )}
            >
              <Typography bold>{profile.label}</Typography>
              <Typography color="secondary">{profile.description}</Typography>
            </button>
          ))}
          <div className="border-t border-background-50 my-1" />
          <button
            type="button"
            role="option"
            aria-selected={active === null}
            onClick={() => choose(null)}
            className={classNames(
              'flex flex-col items-start text-left rounded-md px-3 py-2',
              active === null
                ? 'bg-accent-background-40'
                : 'hover:bg-background-60'
            )}
          >
            <Typography bold>Mes réglages</Typography>
            <Typography color="secondary">
              Tes propres réglages, sans profil
            </Typography>
          </button>
        </div>
      )}
    </div>
  );
}
