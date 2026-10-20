import { BaseModal } from './commons/BaseModal';
import { Button } from './commons/Button';
import { Typography } from './commons/Typography';
import { MOD_CHANGELOG, MOD_VERSION } from '@/mod-version';

// SlimeVR Mod : nouveautes de chaque mise a jour (bouton « ? » en haut)
export function ModChangelogModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <BaseModal isOpen={isOpen} onRequestClose={onClose}>
      <div className="flex flex-col gap-4 max-w-lg max-h-[70vh]">
        <Typography variant="main-title" bold>
          Nouveautés de BOBvr v{MOD_VERSION}
        </Typography>
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          {MOD_CHANGELOG.map(({ version, changes }, index) => (
            <div key={version} className="flex flex-col gap-1">
              <Typography variant="section-title" bold>
                v{version}
                {index === 0 ? ' (cette version)' : ''}
              </Typography>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                {changes.map((change) => (
                  <li key={change}>
                    <Typography color={index === 0 ? 'primary' : 'secondary'}>
                      {change}
                    </Typography>
                  </li>
                ))}
              </ul>
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
