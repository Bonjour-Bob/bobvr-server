import { useEffect, useState } from 'react';
import { BaseModal } from './commons/BaseModal';
import { Button } from './commons/Button';
import { Typography } from './commons/Typography';
import { useElectron } from '@/hooks/electron';
import { openUrl } from '@/hooks/crossplatform';
import { MOD_VERSION } from '@/mod-version';

// SlimeVR Mod : previent quand une version plus recente de BOBvr est sur le
// site. Le site peut avoir un fichier version.json :
//   { "version": "0.7.3", "url": "https://...", "notes": ["...", "..."] }
// sinon le numero est lu sur la page d'accueil (le premier "v0.7.3").

const MOD_SITE = 'https://bonjour-bobvr.netlify.app';
const CHECK_EVERY_MS = 30 * 60 * 1000;
const DISMISSED_KEY = 'slimevr-mod-update-dismissed';

type SiteUpdate = { version: string; url: string; notes: string[] };

function parseVersion(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
}

function isNewer(remote: string, local: string): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function readSite(json: string | null, html: string | null): SiteUpdate | null {
  if (json) {
    try {
      const data = JSON.parse(json);
      if (typeof data.version === 'string') {
        return {
          version: data.version.replace(/^v/i, ''),
          url: typeof data.url === 'string' ? data.url : MOD_SITE,
          notes: Array.isArray(data.notes)
            ? data.notes.filter((n: unknown) => typeof n === 'string')
            : [],
        };
      }
    } catch {
      // version.json illisible, on essaie la page
    }
  }
  if (html) {
    const match = html.match(/v(\d+\.\d+(?:\.\d+)?)/);
    if (match) return { version: match[1], url: MOD_SITE, notes: [] };
  }
  return null;
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function ModUpdateAlert() {
  const electron = useElectron();
  const [update, setUpdate] = useState<SiteUpdate | null>(null);

  useEffect(() => {
    if (!electron.isElectron) return;
    const check = async () => {
      try {
        const { json, html } = await electron.api.ghGet({ type: 'mod-site' });
        const site = readSite(json, html);
        if (
          site &&
          isNewer(site.version, MOD_VERSION) &&
          readDismissed() !== site.version
        ) {
          setUpdate(site);
        }
      } catch {
        // pas d'internet ou site indisponible : on reessaiera plus tard
      }
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  const later = () => {
    if (update) {
      try {
        localStorage.setItem(DISMISSED_KEY, update.version);
      } catch {
        // ignore
      }
    }
    setUpdate(null);
  };

  return (
    <BaseModal isOpen={!!update} onRequestClose={later}>
      {update && (
        <div className="flex flex-col gap-4 max-w-md">
          <Typography variant="main-title" bold>
            Mise à jour disponible
          </Typography>
          <Typography>
            BOBvr v{update.version} est sortie (tu as la v{MOD_VERSION}).
          </Typography>
          {update.notes.length > 0 && (
            <ul className="list-disc pl-5 flex flex-col gap-1">
              {update.notes.map((note) => (
                <li key={note}>
                  <Typography color="secondary">{note}</Typography>
                </li>
              ))}
            </ul>
          )}
          <Typography color="secondary">
            Télécharge le nouvel installeur et lance-le : il met à jour SlimeVR
            Mod en gardant tes réglages.
          </Typography>
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={later}>
              Plus tard
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                openUrl(update.url);
                setUpdate(null);
              }}
            >
              Télécharger
            </Button>
          </div>
        </div>
      )}
    </BaseModal>
  );
}
