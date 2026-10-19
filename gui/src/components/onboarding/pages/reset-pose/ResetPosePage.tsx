import { useMemo } from 'react';
import { ResetType } from 'solarxr-protocol';
import { Button } from '@/components/commons/Button';
import { TipBox } from '@/components/commons/TipBox';
import { Typography } from '@/components/commons/Typography';
import { ResetButton } from '@/components/home/ResetButton';
import { Step, StepperSlider } from '@/components/onboarding/StepperSlider';
import { SkeletonVisualizerWidget } from '@/components/widgets/SkeletonVisualizerWidget';
import { useBreakpoint } from '@/hooks/breakpoint';
import { useOnboarding } from '@/hooks/onboarding';

// SlimeVR Mod : pages guidees pour la reinitialisation complete assis ou allonge

export type ResetPoseKind = 'sitting' | 'lying';

type PoseInfo = {
  resetType: ResetType.FullSitting | ResetType.FullLying;
  image: string;
  title: string;
  description: string;
  positionTitle: string;
  instructions: string[];
  tip: string;
};

export const RESET_POSES: Record<ResetPoseKind, PoseInfo> = {
  sitting: {
    resetType: ResetType.FullSitting,
    image: '/images/reset/SittingResetPose.png',
    title: 'Calibration assise',
    description:
      'Calibre tes capteurs sans te lever, assis sur une chaise. La calibration debout reste disponible comme avant.',
    positionTitle: 'Assieds-toi sur une chaise',
    instructions: [
      'Le dos droit, contre le dossier.',
      'Les cuisses à l’horizontale, les tibias à la verticale.',
      'Les pieds à plat au sol, les mains posées sur les cuisses.',
      'Regarde droit devant toi.',
    ],
    tip: 'Garde la tête bien droite : le casque sert de référence pour savoir dans quelle direction ton corps est tourné.',
  },
  lying: {
    resetType: ResetType.FullLying,
    image: '/images/reset/LyingResetPose.png',
    title: 'Calibration allongée',
    description:
      'Calibre tes capteurs allongé dans ton lit, sur le dos. La calibration debout reste disponible comme avant.',
    positionTitle: 'Allonge-toi sur le dos',
    instructions: [
      'Les jambes tendues, les orteils vers le haut.',
      'Les bras le long du corps.',
      'Regarde le plafond, la tête dans l’axe du corps.',
    ],
    tip: 'Ne tourne pas la tête sur le côté : le casque sert de référence pour savoir dans quelle direction ton corps est allongé.',
  },
};

function PoseImage({ pose }: { pose: PoseInfo }) {
  // The sitting picture is tall and the lying one is wide: bound both sides
  return (
    <img
      src={pose.image}
      alt={pose.positionTitle}
      className="keep-colors max-h-[440px] max-w-[460px] w-auto h-auto object-contain"
    />
  );
}

function makePositionStep(pose: PoseInfo) {
  return function PositionStep({
    nextStep,
    variant,
  }: {
    nextStep: () => void;
    variant: 'onboarding' | 'alone';
  }) {
    const { isMobile } = useBreakpoint('mobile');
    return (
      <>
        <div className="flex flex-col flex-grow gap-2">
          <div className="flex flex-grow flex-col gap-4 max-w-sm">
            <Typography variant="main-title" bold>
              {pose.positionTitle}
            </Typography>
            <div className="flex flex-col gap-2">
              {pose.instructions.map((line) => (
                <Typography key={line}>{line}</Typography>
              ))}
            </div>
            <div className="flex">
              <TipBox>{pose.tip}</TipBox>
            </div>
          </div>
          {isMobile && (
            <div className="flex justify-center">
              <PoseImage pose={pose} />
            </div>
          )}
          <div className="flex gap-3 mobile:justify-between">
            <Button
              variant={variant === 'onboarding' ? 'secondary' : 'tertiary'}
              to="/"
            >
              Retour
            </Button>
            <Button variant="primary" onClick={nextStep}>
              Je suis en position
            </Button>
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center justify-center px-8">
            <PoseImage pose={pose} />
          </div>
        )}
      </>
    );
  };
}

function makeResetStep(pose: PoseInfo) {
  return function ResetStep({
    nextStep,
    prevStep,
    variant,
  }: {
    nextStep: () => void;
    prevStep: () => void;
    variant: 'onboarding' | 'alone';
  }) {
    const { isMobile } = useBreakpoint('mobile');
    return (
      <>
        <div className="flex flex-col flex-grow gap-2">
          <div className="flex flex-grow flex-col gap-4 max-w-sm">
            <Typography variant="main-title" bold>
              Réinitialisation
            </Typography>
            <div className="flex flex-col gap-2">
              <Typography>
                Appuie sur le bouton, puis reste immobile dans cette position
                jusqu’à la fin du compte à rebours.
              </Typography>
            </div>
          </div>
          {isMobile && (
            <div className="flex justify-center">
              <PoseImage pose={pose} />
            </div>
          )}
          <div className="flex gap-3 mobile:justify-between">
            <Button
              variant={variant === 'onboarding' ? 'secondary' : 'tertiary'}
              onClick={prevStep}
            >
              Étape précédente
            </Button>
            <ResetButton type={pose.resetType} onReseted={nextStep} />
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center justify-center px-8">
            <PoseImage pose={pose} />
          </div>
        )}
      </>
    );
  };
}

function DoneStep({ resetSteps }: { resetSteps: () => void }) {
  return (
    <div className="flex flex-col items-center w-full justify-center gap-5">
      <div className="flex gap-1 flex-col justify-center items-center">
        <Typography variant="section-title">Calibration terminée !</Typography>
        <Typography>
          Vérifie que le squelette ci-dessous suit bien ta position.
        </Typography>
      </div>
      <div className="flex gap-3">
        <Button variant="tertiary" onClick={resetSteps}>
          Recommencer
        </Button>
        <Button variant="primary" to="/">
          Retour à l’accueil
        </Button>
      </div>
      <SkeletonVisualizerWidget />
    </div>
  );
}

export function ResetPosePage({ kind }: { kind: ResetPoseKind }) {
  const pose = RESET_POSES[kind];
  const { state } = useOnboarding();

  // Built once per pose so the steps keep their state between renders
  const steps: Step[] = useMemo(
    () => [
      { type: 'numbered', component: makePositionStep(pose) },
      { type: 'numbered', component: makeResetStep(pose) },
      { type: 'fullsize', component: DoneStep },
    ],
    [kind]
  );

  return (
    <div className="flex flex-col gap-2 h-full items-center w-full xs:justify-center relative overflow-y-auto overflow-x-hidden px-4 pb-4">
      <div className="flex flex-col w-full h-full xs:justify-center xs:max-w-3xl gap-5">
        <div className="flex flex-col xs:max-w-lg gap-3">
          <Typography variant="main-title">{pose.title}</Typography>
          <Typography>{pose.description}</Typography>
        </div>
        <div className="flex pb-4">
          <StepperSlider
            key={kind}
            variant={state.alonePage ? 'alone' : 'onboarding'}
            steps={steps}
          />
        </div>
      </div>
    </div>
  );
}
