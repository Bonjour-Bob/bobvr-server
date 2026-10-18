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

type DanceForm = {
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

// Point de depart conseille pour la danse (a ajuster selon ton style)
const DANCE_PRESET: DanceForm = {
  filtering: { type: FilteringType.PREDICTION.toString(), amount: 0.3 },
  toggles: {
    floorClip: true,
    skatingCorrection: false,
    footPlant: false,
    toeSnap: false,
    extendedSpine: true,
    extendedPelvis: true,
    extendedKnee: true,
    enforceConstraints: true,
  },
  legTweaks: { correctionStrength: 0.3 },
  drift: { enabled: true, prediction: false, amount: 0.8, maxResets: 6 },
  resets: { yawResetSmoothTime: 0.2 },
};

const BACKUP_KEY = 'slimevr-mod-dance-backup';

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
    try {
      setHasBackup(!!localStorage.getItem(BACKUP_KEY));
    } catch {
      setHasBackup(false);
    }
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

    sendRPCPacket(RpcMessage.ChangeSettingsRequest, req);
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
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(getValues()));
      setHasBackup(true);
    } catch {
      // No backup possible, the preset still applies
    }
    applyValues(DANCE_PRESET);
    setMessage('Profil danse appliqué.');
  };

  const restoreBackup = () => {
    try {
      const saved = localStorage.getItem(BACKUP_KEY);
      if (!saved) return;
      applyValues(JSON.parse(saved) as DanceForm);
      localStorage.removeItem(BACKUP_KEY);
      setHasBackup(false);
      setMessage('Tes réglages d’avant sont revenus.');
    } catch {
      setMessage('Impossible de retrouver tes réglages d’avant.');
    }
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
        <Advice>Prédiction, entre 20 et 40 %</Advice>
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
        <Advice>activé</Advice>

        <Typography variant="section-title">Correction de glissade</Typography>
        <Explain>
          Corrige les pieds qui glissent quand tu es immobile, en les « collant
          » au sol. Pratique en marchant, mais pendant la danse elle peut
          freiner les glissés, les pivots et le shuffle, car SlimeVR croit que
          ton pied doit rester en place.
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
        <Advice>désactivé (ou force faible si tes pieds glissent trop)</Advice>

        <Typography variant="section-title">Pied à plat</Typography>
        <Explain>
          Remet ton pied à plat quand il touche le sol. Ça stabilise en
          marchant, mais ça peut bloquer les pointes, les talons et les appuis
          sur le bout du pied.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.footPlant"
          label="Pied à plat au sol"
        />
        <Advice>désactivé</Advice>

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
          genou à l’envers, par exemple). Garde-le activé, sauf si un mouvement
          très souple semble bloqué.
        </Explain>
        <CheckBox
          variant="toggle"
          outlined
          control={control}
          name="toggles.enforceConstraints"
          label="Limites des articulations"
        />
        <Advice>activé</Advice>
      </SettingsPagePaneLayout>

      <SettingsPagePaneLayout icon={<WrenchIcon />} id="dance-drift">
        <Typography variant="main-title">Dérive</Typography>
        <Explain>
          Pendant une longue session, les capteurs peuvent tourner petit à
          petit. La compensation de la dérive apprend de tes recentrages
          (resets) pour corriger cette rotation automatiquement entre deux
          resets. Elle marche mieux si tu fais quelques resets en début de
          session. Pense aussi à configurer « Garder Aligné » dans les réglages
          des capteurs.
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
        <Advice>activée, force 80 %, 6 resets</Advice>
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
