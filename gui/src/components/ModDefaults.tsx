import { useEffect } from 'react';
import { useConfig } from '@/hooks/config';

// VitalVR : reglages de base, appliques une seule fois par PC
// (ensuite l'utilisateur peut les changer librement).
const THEME_DEFAULT_KEY = 'vitalvr-theme-default';

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
    // Theme VitalVR par defaut (meme si les reglages viennent de BOBvr)
    if (config.theme !== 'vitalvr') setConfig({ theme: 'vitalvr' });
  }, [config]);

  return null;
}
