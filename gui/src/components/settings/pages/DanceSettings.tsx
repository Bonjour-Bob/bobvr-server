import { ReactNode, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ChangeSettingsRequestT,
  DriftCompensationSettingsT,
  FilteringSettingsT,
  FilteringType,
  LegTweaksSettingsT,
  ModelSettingsT,
  ModelTogglesT,
  ResetsSettingsT,
  RpcMessage,
  SettingsRequestT,
  SettingsResponseT,
} from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { Typography } from '@/components/commons/Typography';
import { CheckBox } from '@/components/commons/Checkbox';
import { Radio } from '@/components/commons/Radio';
import { NumberSelector } from '@/components/commons/NumberSelector';
import { Button } from '@/components/commons/Button';
import { WrenchIcon } from '@/components/commons/icon/WrenchIcons';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';

// Page "Danse" de SlimeVR Mod : tous les reglages utiles pour danser au meme
// endroit, avec des explications et un profil en un clic.

export type DanceForm = {
  filtering: { type: string; amount: number };
  toggles: {
    floorClip: boolean;
    skatingCorrection: boolean;
    footPlant: boolean;
    toeSnap: boolean;
    extendedSpine: boolean;
    extendedPelvis: boolean;
    extendedKnee: boolean;
    enforceConstraints: boolean;
  };
  legTweaks: { correctionStrength: number };
  drift: {
    enabled: boolean;
    prediction: boolean;
    amount: number;
    maxResets: number;
  };
  resets: { yawResetSmoothTime: number };
};

// Point de depart conseille pour la danse (a ajuster selon ton style).
// v2 : pieds colles au sol (glissade + pied a plat), prediction plus douce et
// compensation de derive coupee (Garder Aligne s'en charge, les deux se genent).
// v3 : correction de glissade moins forte et limites des articulations coupees,
// pour eviter les petits blocages quand on tourne les hanches en danse basse.
// v4 : plus de correction de glissade (les pieds se bloquaient puis se
// relachaient d'un coup en les levant)
// v5 : plus de blocage au sol ni de pied a plat (le pied restait accroche au
// sol puis se liberait d'un coup en le levant)
const DANCE_PRESET_VERSION = '5';
const DANCE_PRESET: DanceForm = {
  filtering: { type: FilteringType.PREDICTION.toString(), amount: 0.2 },
  toggles: {
    floorClip: false,
    skatingCorrection: false,
    footPlant: false,
    toeSnap: false,
    extendedSpine: true,
    extendedPelvis: true,
    extendedKnee: true,
    enforceConstraints: false,
  },
  legTweaks: { correctionStrength: 0.3 },
  drift: { enabled: false, prediction: false, amount: 0.8, maxResets: 6 },
  resets: { yawResetSmoothTime: 0.2 },
};

// Profil 1:1 : suivre les trackers le plus fidelement possible. Filtrage
// leger (prediction 20 %, sans filtrage les jambes saccadent), pas de genoux etendus (ce qui coupe aussi les corrections du mod
// sur les hanches, les genoux et le dos), et juste ce qu'il faut pour que les
// pieds ne traversent pas le sol. Pas de correction de glissade : elle bloque
// les pieds au sol puis les relache d'un coup, ce n'est pas fluide.
const ONE_TO_ONE_PRESET: DanceForm = {
  filtering: { type: FilteringType.PREDICTION.toString(), amount: 0.2 },
  toggles: {
    floorClip: false,
    skatingCorrection: false,
    footPlant: false,
    toeSnap: false,
    extendedSpine: true,
    extendedPelvis: true,
    extendedKnee: false,
    enforceConstraints: false,
  },
  legTweaks: { correctionStrength: 0.2 },
  drift: { enabled: false, prediction: false, amount: 0.8, maxResets: 6 },
  resets: { yawResetSmoothTime: 0.2 },
};

export type ModProfile = 'dance' | 'one-to-one';

const PROFILE_PRESETS: Record<ModProfile, DanceForm> = {
  dance: DANCE_PRESET,
  'one-to-one': ONE_TO_ONE_PRESET,
};

// The backup holds the user's own settings while a profile is on (one backup
// shared by both profiles, so switching between them keeps the real settings)
const BACKUP_KEY = 'slimevr-mod-dance-backup';
const ACTIVE_PROFILE_KEY = 'slimevr-mod-active-profile';

function readActiveProfile(): ModProfile | null {
  if (readBackup() === null) return null;
  try {
    const value = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return value === 'one-to-one' ? 'one-to-one' : 'dance';
  } catch {
    return 'dance';
  }
}

// SlimeVR Mod : le mode 1:1 est devenu les reglages de base. Applique une seule
// fois (sur ce PC), ensuite l'utilisateur peut tout changer librement.
const ONE_TO_ONE_DEFAULT_KEY = 'slimevr-mod-1to1-default';
// v2 : sans correction de glissade
// v3 : prediction 20 % (sans filtrage c'etait saccade)
// v4 : sans blocage au sol (il retenait le pied quand on leve la jambe)
// v5 : recentrage par double tap en douceur (0,2 s) comme en mode danse
const ONE_TO_ONE_DEFAULT_VERSION = '5';

function needsOneToOneDefault(): boolean {
  try {
    return (
      localStorage.getItem(ONE_TO_ONE_DEFAULT_KEY) !==
      ONE_TO_ONE_DEFAULT_VERSION
    );
  } catch {
    return false;
  }
}

function markOneToOneDefault() {
  try {
    localStorage.setItem(ONE_TO_ONE_DEFAULT_KEY, ONE_TO_ONE_DEFAULT_VERSION);
  } catch {
    // ignore
  }
}

function saveActiveProfile(profile: ModProfile) {
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, profile);
  } catch {
    // ignore
  }
}
const PRESET_VERSION_KEY = 'slimevr-mod-dance-preset-version';

function readPresetVersion(): string | null {
  try {
    return localStorage.getItem(PRESET_VERSION_KEY);
  } catch {
    return null;
  }
}

function savePresetVersion() {
  try {
    localStorage.setItem(PRESET_VERSION_KEY, DANCE_PRESET_VERSION);
  } catch {
    // ignore
  }
}

const percent = (value: number) => `${Math.round(value * 100)} %`;
const seconds = (value: number) => `${value.toFixed(2)} s`;

function formFromSettings(s: SettingsResponseT): DanceForm {
  const t = s.modelSettings?.toggles;
  return {
    filtering: {
      type: String(s.filtering?.type ?? FilteringType.PREDICTION),
      amount: s.filtering?.amount || 0.2,
    },
    toggles: {
      floorClip: !!t?.floorClip,
      skatingCorrection: !!t?.skatingCorrection,
      footPlant: !!t?.footPlant,
      toeSnap: !!t?.toeSnap,
      extendedSpine: !!t?.extendedSpine,
      extendedPelvis: !!t?.extendedPelvis,
      extendedKnee: !!t?.extendedKnee,
      enforceConstraints: !!t?.enforceConstraints,
    },
    legTweaks: {
      correctionStrength: s.modelSettings?.legTweaks?.correctionStrength || 0.3,
    },
    drift: {
      enabled: !!s.driftCompensation?.enabled,
      prediction: !!s.driftCompensation?.prediction,
      amount: s.driftCompensation?.amount || 0.8,
      maxResets: s.driftCompensation?.maxResets || 6,
    },
    resets: {
      yawResetSmoothTime: s.resetsSettings?.yawResetSmoothTime ?? 0,
    },
  };
}

// Builds the settings change for these dance values, keeping every other
// setting as it currently is on the server
export function buildDanceRequest(
  values: DanceForm,
  current: SettingsResponseT
): ChangeSettingsRequestT {
  const req = new ChangeSettingsRequestT();

  const filtering = new FilteringSettingsT();
  filtering.type = Number(values.filtering.type);
  filtering.amount = values.filtering.amount;
  req.filtering = filtering;

  // The server always reads every toggle, so start from the current ones
  const old = current.modelSettings?.toggles;
  const toggles = new ModelTogglesT(
    values.toggles.extendedSpine,
    values.toggles.extendedPelvis,
    values.toggles.extendedKnee,
    !!old?.forceArmsFromHmd,
    values.toggles.floorClip,
    values.toggles.skatingCorrection,
    values.toggles.toeSnap,
    values.toggles.footPlant,
    !!old?.selfLocalization,
    old?.usePosition ?? true,
    values.toggles.enforceConstraints,
    old?.correctConstraints ?? true
  );
  const legTweaks = new LegTweaksSettingsT();
  legTweaks.correctionStrength = values.legTweaks.correctionStrength;
  req.modelSettings = new ModelSettingsT(toggles, null, legTweaks, null);

  req.driftCompensation = new DriftCompensationSettingsT(
    values.drift.enabled,
    values.drift.prediction,
    values.drift.amount,
    values.drift.maxResets
  );

  const r = current.resetsSettings;
  if (r) {
    req.resetsSettings = new ResetsSettingsT(
      r.resetMountingFeet,
      r.armsMountingResetMode,
      values.resets.yawResetSmoothTime,
      r.saveMountingReset,
      r.resetHmdPitch
    );
  }

  return req;
}

function readBackup(): DanceForm | null {
  try {
    const saved = localStorage.getItem(BACKUP_KEY);
    return saved ? (JSON.parse(saved) as DanceForm) : null;
  } catch {
    return null;
  }
}

function saveBackupIfMissing(values: DanceForm) {
  try {
    // Never overwrite the user's own settings with the preset
    if (!localStorage.getItem(BACKUP_KEY)) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(values));
    }
  } catch {
    // No backup possible, the preset still applies
  }
}

function clearBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch {
    // Nothing to clear
  }
}

/**
 * Mod profiles (dance, 1:1): turning one on applies its preset, turning it off
 * brings back the settings saved just before. Shared with the "Danse" page.
 */
export function useModProfiles() {
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const settingsRef = useRef<SettingsResponseT | null>(null);
  const [active, setActive] = useState<ModProfile | null>(() =>
    readActiveProfile()
  );

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (s: SettingsResponseT) => {
    settingsRef.current = s;
    let profile = readActiveProfile();

    // First start of this version: the 1:1 settings become the base settings
    if (needsOneToOneDefault()) {
      markOneToOneDefault();
      if (profile === 'dance') {
        // Dance mode on: 1:1 becomes the settings it goes back to
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(ONE_TO_ONE_PRESET));
        } catch {
          // ignore
        }
      } else {
        if (profile === 'one-to-one') {
          clearBackup();
          profile = null;
        }
        sendRPCPacket(
          RpcMessage.ChangeSettingsRequest,
          buildDanceRequest(ONE_TO_ONE_PRESET, s)
        );
        sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
      }
    }

    setActive(profile);
    // Dance mode turned on with an older preset: switch to the new one
    if (profile === 'dance' && readPresetVersion() !== DANCE_PRESET_VERSION) {
      savePresetVersion();
      sendRPCPacket(
        RpcMessage.ChangeSettingsRequest,
        buildDanceRequest(DANCE_PRESET, s)
      );
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    }
  });

  const toggle = (profile: ModProfile) => {
    const current = settingsRef.current;
    if (!current) return;
    if (readActiveProfile() === profile) {
      // Turn it off: back to the user's own settings
      const backup = readBackup();
      if (backup) {
        sendRPCPacket(
          RpcMessage.ChangeSettingsRequest,
          buildDanceRequest(backup, current)
        );
      }
      clearBackup();
      setActive(null);
    } else {
      // Turn it on (from the user's settings or from the other profile)
      saveBackupIfMissing(formFromSettings(current));
      saveActiveProfile(profile);
      if (profile === 'dance') savePresetVersion();
      sendRPCPacket(
        RpcMessage.ChangeSettingsRequest,
        buildDanceRequest(PROFILE_PRESETS[profile], current)
      );
      setActive(profile);
    }
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  };

  return { active, toggle };
}

function Explain({ children }: { children: ReactNode }) {
  return (
    <div className="pb-2">
      <Typography color="secondary">{children}</Typography>
    </div>
  );
}

function Advice({ children }: { children: ReactNode }) {
  return (
    <div className="pt-1 pb-4">
      <Typography italic>Conseillé pour la danse : {children}</Typography>
    </div>
  );
}

export function DanceSettings() {
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [settings, setSettings] = useState<SettingsResponseT | null>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const settingsRef = useRef<SettingsResponseT | null>(null);

  const { reset, control, watch, handleSubmit, getValues } = useForm<DanceForm>(
    {
      defaultValues: DANCE_PRESET,
      mode: 'onChange',
    }
  );

  const skatingCorrection = watch('toggles.skatingCorrection');
  const driftEnabled = watch('drift.enabled');

  useEffect(() => {
    setHasBackup(readBackup() !== null);
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (s: SettingsResponseT) => {
    settingsRef.current = s;
    setSettings(s);
    reset(formFromSettings(s));
  });

  const onSubmit = (values: DanceForm) => {
    const current = settingsRef.current;
    if (!current) return;
    sendRPCPacket(
      RpcMessage.ChangeSettingsRequest,
      buildDanceRequest(values, current)
    );
  };

  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type === 'change') handleSubmit(onSubmit)();
    });
    return () => subscription.unsubscribe();
  }, []);

  const applyValues = (values: DanceForm) => {
    reset(values);
    handleSubmit(onSubmit)();
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  };

  const applyDancePreset = () => {
    saveBackupIfMissing(getValues());
    saveActiveProfile('dance');
    savePresetVersion();
    setHasBackup(readBackup() !== null);
    applyValues(DANCE_PRESET);
    setMessage('Profil danse appliqué.');
  };

  const restoreBackup = () => {
    const backup = readBackup();
    if (!backup) {
      setMessage('Impossible de retrouver tes réglages d’avant.');
      return;
    }
    applyValues(backup);
    clearBackup();
    setHasBackup(false);
    setMessage('Tes réglages d’avant sont revenus.');
  };

  return (
    <SettingsPageLayout className="flex flex-col gap-2 w-full">
      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-preset">
        <Typography variant="main-title">Danse</Typography>
        <Explain>
          Tous les réglages qui comptent pour danser, au même endroit. Chaque
          changement s’applique tout de suite. Le profil danse est un point de
          départ : ajuste ensuite selon ton style (footwork, shuffle, pop…).
        </Explain>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            variant="primary"
            onClick={applyDancePreset}
            disabled={!settings}
          >
            Appliquer le profil danse
          </Button>
          <Button
            variant="secondary"
            onClick={restoreBackup}
            disabled={!hasBackup}
          >
            Revenir à mes réglages d’avant
          </Button>
        </div>
        {message && (
          <div className="pt-3">
            <Typography>{message}</Typography>
          </div>
        )}
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-reactivity">
        <Typography variant="main-title">Réactivité des mouvements</Typography>
        <Explain>
          Le filtrage change la façon dont les mouvements de tes capteurs sont
          transmis. « Lissage » rend tout plus doux mais ajoute du retard,
          gênant quand tu danses en rythme. « Prédiction » anticipe un peu le
          mouvement pour réduire le retard, idéal pour les mouvements rapides.
          Trop de prédiction peut faire « dépasser » les membres à l’arrêt.
        </Explain>
        <div className="flex md:flex-row flex-col gap-3">
          <Radio
            control={control}
            name="filtering.type"
            label="Aucun"
            description="Données brutes, aucune correction"
            value={FilteringType.NONE.toString()}
          />
          <Radio
            control={control}
            name="filtering.type"
            label="Lissage"
            description="Plus doux, mais plus de retard"
            value={FilteringType.SMOOTHING.toString()}
          />
          <Radio
            control={control}
            name="filtering.type"
            label="Prédiction"
            description="Moins de retard, plus réactif"
            value={FilteringType.PREDICTION.toString()}
          />
        </div>
        <div className="pt-4">
          <NumberSelector
            control={control}
            name="filtering.amount"
            label="Intensité du filtrage"
            valueLabelFormat={percent}
            min={0.1}
            max={1.0}
            step={0.1}
          />
        </div>
        <Advice>Prédiction, entre 10 et 30 %</Advice>
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-feet">
        <Typography variant="main-title">Pieds et sol</Typography>

        <Typography variant="section-title">Bloquer au sol</Typography>
        <Explain>
          Empêche tes pieds de passer à travers le sol. Utile pour les
          mouvements bas et les accroupis.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.floorClip"
          label="Bloquer les pieds au sol"
        />
        <Advice>désactivé (sinon le pied reste accroché au sol)</Advice>

        <Typography variant="section-title">Correction de glissade</Typography>
        <Explain>
          Garde tes pieds « collés » au sol tant qu’ils sont posés. Sans elle,
          les pieds suivent chaque mouvement du bassin et glissent. Si un
          glissé, un pivot ou un shuffle semble freiné, baisse un peu la force.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.skatingCorrection"
          label="Correction de glissade"
        />
        {skatingCorrection && (
          <div className="pt-3">
            <NumberSelector
              control={control}
              name="legTweaks.correctionStrength"
              label="Force de la correction"
              valueLabelFormat={percent}
              min={0.1}
              max={1.0}
              step={0.1}
            />
          </div>
        )}
        <Advice>
          désactivé (sinon les pieds se bloquent puis se relâchent d’un coup)
        </Advice>

        <Typography variant="section-title">Pied à plat</Typography>
        <Explain>
          Remet ton pied à plat quand il touche le sol, pour qu’il reste bien
          posé. Désactive-le seulement si tu danses beaucoup sur les pointes ou
          les talons.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.footPlant"
          label="Pied à plat au sol"
        />
        <Advice>désactivé (sinon le pied se bloque à plat en le levant)</Advice>

        <Typography variant="section-title">Estimation des orteils</Typography>
        <Explain>
          Devine l’angle de ton pied quand tu n’as pas de capteur dessus. Avec
          des capteurs aux pieds, c’est inutile et ça peut fausser leur angle.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.toeSnap"
          label="Estimation des orteils"
        />
        <Advice>désactivé si tu as des capteurs aux pieds</Advice>
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-body">
        <Typography variant="main-title">Corps</Typography>
        <Explain>
          Les modèles étendus permettent au dos, au bassin et aux genoux de se
          plier de façon plus naturelle, ce qui donne des mouvements plus
          fluides (vagues, déhanchés, flexions).
        </Explain>
        <div className="grid gap-2">
          <CheckBox
            variant="toggle"
            outlined
            control={control}
            name="toggles.extendedSpine"
            label="Dos souple (colonne étendue)"
          />
          <CheckBox
            variant="toggle"
            outlined
            control={control}
            name="toggles.extendedPelvis"
            label="Bassin souple (bassin étendu)"
          />
          <CheckBox
            variant="toggle"
            outlined
            control={control}
            name="toggles.extendedKnee"
            label="Genoux souples (genoux étendus)"
          />
        </div>
        <Advice>les trois activés</Advice>

        <Typography variant="section-title">
          Limites des articulations
        </Typography>
        <Explain>
          Empêche les articulations de prendre des positions impossibles (un
          genou à l’envers, par exemple). En danse, ces limites peuvent faire de
          petits blocages quand tu tournes beaucoup les hanches.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.enforceConstraints"
          label="Limites des articulations"
        />
        <Advice>désactivé</Advice>
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-drift">
        <Typography variant="main-title">Dérive</Typography>
        <Explain>
          Pendant une longue session, les capteurs peuvent tourner petit à
          petit. La compensation de la dérive apprend de tes recentrages
          (resets) pour corriger cette rotation automatiquement entre deux
          resets. « Garder Aligné » (dans les réglages des capteurs) fait déjà
          ce travail en continu, et les deux peuvent se contredire (les jambes
          tournent alors petit à petit) : garde un seul des deux.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="drift.enabled"
          label="Compensation de la dérive"
        />
        {driftEnabled && (
          <div className="grid gap-3 pt-3">
            <CheckBox
              variant="toggle"
              outlined
              control={control}
              name="drift.prediction"
              label="Prédiction de la dérive"
            />
            <NumberSelector
              control={control}
              name="drift.amount"
              label="Force de la compensation"
              valueLabelFormat={percent}
              min={0.1}
              max={1.0}
              step={0.1}
            />
            <NumberSelector
              control={control}
              name="drift.maxResets"
              label="Nombre de resets pris en compte"
              valueLabelFormat={(v) => String(v)}
              min={1}
              max={25}
              step={1}
            />
          </div>
        )}
        <Advice>désactivée si « Garder Aligné » est activé</Advice>
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-reset">
        <Typography variant="main-title">Recentrage</Typography>
        <Explain>
          Durée de la transition quand tu fais un recentrage (reset de
          l’orientation). À 0, ton avatar « saute » d’un coup ; avec un peu de
          lissage, le recentrage passe inaperçu en pleine danse.
        </Explain>
        <NumberSelector
          control={control}
          name="resets.yawResetSmoothTime"
          label="Lissage du recentrage"
          valueLabelFormat={seconds}
          min={0}
          max={0.5}
          step={0.05}
        />
        <Advice>0,20 s</Advice>
      </SettingsPagePaneLayout>
    </SettingsPageLayout>
  );
}
