import { BaseModal } from './commons/BaseModal';
import { Button } from './commons/Button';
import { Typography } from './commons/Typography';
import { MOD_CHANGELOG, MOD_VERSION, ModChangelogEntry } from '@/mod-version';

// SlimeVR Mod : nouveautes de chaque mise a jour (bouton « ? » en haut)
export function ModChangelogModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  // Cette version, puis (si c'est une petite mise a jour) la derniere grosse
  // mise a jour et les petites entre les deux, puis le reste de l'historique
  const [current, ...older] = MOD_CHANGELOG;
  const sections: {
    title: string;
    entries: ModChangelogEntry[];
    highlight: boolean;
  }[] = [{ title: 'Cette version', entries: [current], highlight: true }];
  let history = older;
  if (current && !current.major) {
    const lastMajor = older.findIndex((entry) => entry.major);
    if (lastMajor >= 0) {
      sections.push({
        title: 'Dernière grosse mise à jour',
        entries: older.slice(0, lastMajor + 1),
        highlight: true,
      });
      history = older.slice(lastMajor + 1);
    }
  }
  if (history.length > 0) {
    sections.push({ title: 'Historique', entries: history, highlight: false });
  }

  return (
    <BaseModal isOpen={isOpen} onRequestClose={onClose}>
      <div className="flex flex-col gap-4 max-w-lg max-h-[70vh]">
        <Typography variant="main-title" bold>
          Nouveautés de BOBvr v{MOD_VERSION}
        </Typography>
        <div className="flex flex-col gap-5 overflow-y-auto pr-2">
          {sections.map(({ title, entries, highlight }) => (
            <div key={title} className="flex flex-col gap-3">
              <Typography variant="section-title" color="secondary">
                {title}
              </Typography>
              {entries.map(({ version, changes }) => (
                <div key={version} className="flex flex-col gap-1">
                  <Typography variant="section-title" bold>
                    v{version}
                  </Typography>
                  <ul className="list-disc pl-5 flex flex-col gap-1">
                    {changes.map((change) => (
                      <li key={change}>
                        <Typography color={highlight ? 'primary' : 'secondary'}>
                          {change}
                        </Typography>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
