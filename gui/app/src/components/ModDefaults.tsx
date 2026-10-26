import { useEffect } from 'react';
import { useConfig } from '@/hooks/config';

// SlimeVR Mod : reglages de base du mod, appliques une seule fois par PC
// (ensuite l'utilisateur peut les changer librement).
const THEME_DEFAULT_KEY = 'slimevr-mod-theme-default';

export function ModDefaults() {
  const { config, setConfig } = useConfig();

  useEffect(() => {
    if (!config) return;
    let done = false;
    try {
      done = localStorage.getItem(THEME_DEFAULT_KEY) === '1';
    } catch {
      done = true;
    }
    if (done) return;
    try {
      localStorage.setItem(THEME_DEFAULT_KEY, '1');
    } catch {
      // ignore
    }
    // Theme noir et blanc par defaut
    if (config.theme !== 'noir-blanc') setConfig({ theme: 'noir-blanc' });
  }, [config]);

  return null;
}
