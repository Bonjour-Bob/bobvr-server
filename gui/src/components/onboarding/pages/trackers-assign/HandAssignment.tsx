import { useLocalization } from '@fluent/react';
import { BodyPart } from 'solarxr-protocol';
import { BodyInteractions } from '@/components/commons/BodyInteractions';
import { Typography } from '@/components/commons/Typography';
import { TrackerPartCard } from '@/components/tracker/TrackerPartCard';
import { FlatDeviceTracker } from '@/store/app-store';
import { BodyPartError } from './TrackerAssignment';

// SlimeVR Mod: "Doigts" tab of the v22 style assignment page. The picture and
// the joint positions come from SlimeVR v22 (hand-pose.webp, 262 x 428).

export type HandSide = 'left' | 'right';
type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'little';

const WIDTH = 262;
const HEIGHT = 428;
const ROOT: [number, number] = [132.138, 248.248];

// From the fingertip to the palm
const JOINTS: Record<Finger, [number, number][]> = {
  thumb: [
    [40.152, 182.392],
    [54.786, 214.794],
    [67.33, 240.93],
  ],
  index: [
    [48.515, 95.633],
    [64.194, 132.218],
    [83.009, 169.847],
  ],
  middle: [
    [101.825, 72.636],
    [107.051, 120.72],
    [112.278, 164.62],
  ],
  ring: [
    [155.134, 83.09],
    [149.907, 125.944],
    [144.681, 168.802],
  ],
  little: [
    [205.318, 126.999],
    [191.729, 153.13],
    [180.231, 181.354],
  ],
};

const PARTS: Record<HandSide, Record<Finger, BodyPart[]> & { root: BodyPart }> =
  {
    left: {
      thumb: [
        BodyPart.LEFT_THUMB_DISTAL,
        BodyPart.LEFT_THUMB_PROXIMAL,
        BodyPart.LEFT_THUMB_METACARPAL,
      ],
      index: [
        BodyPart.LEFT_INDEX_DISTAL,
        BodyPart.LEFT_INDEX_INTERMEDIATE,
        BodyPart.LEFT_INDEX_PROXIMAL,
      ],
      middle: [
        BodyPart.LEFT_MIDDLE_DISTAL,
        BodyPart.LEFT_MIDDLE_INTERMEDIATE,
        BodyPart.LEFT_MIDDLE_PROXIMAL,
      ],
      ring: [
        BodyPart.LEFT_RING_DISTAL,
        BodyPart.LEFT_RING_INTERMEDIATE,
        BodyPart.LEFT_RING_PROXIMAL,
      ],
      little: [
        BodyPart.LEFT_LITTLE_DISTAL,
        BodyPart.LEFT_LITTLE_INTERMEDIATE,
        BodyPart.LEFT_LITTLE_PROXIMAL,
      ],
      root: BodyPart.LEFT_HAND,
    },
    right: {
      thumb: [
        BodyPart.RIGHT_THUMB_DISTAL,
        BodyPart.RIGHT_THUMB_PROXIMAL,
        BodyPart.RIGHT_THUMB_METACARPAL,
      ],
      index: [
        BodyPart.RIGHT_INDEX_DISTAL,
        BodyPart.RIGHT_INDEX_INTERMEDIATE,
        BodyPart.RIGHT_INDEX_PROXIMAL,
      ],
      middle: [
        BodyPart.RIGHT_MIDDLE_DISTAL,
        BodyPart.RIGHT_MIDDLE_INTERMEDIATE,
        BodyPart.RIGHT_MIDDLE_PROXIMAL,
      ],
      ring: [
        BodyPart.RIGHT_RING_DISTAL,
        BodyPart.RIGHT_RING_INTERMEDIATE,
        BodyPart.RIGHT_RING_PROXIMAL,
      ],
      little: [
        BodyPart.RIGHT_LITTLE_DISTAL,
        BodyPart.RIGHT_LITTLE_INTERMEDIATE,
        BodyPart.RIGHT_LITTLE_PROXIMAL,
      ],
      root: BodyPart.RIGHT_HAND,
    },
  };

const jointLabelId = (part: BodyPart) =>
  'onboarding-assign_trackers-joint-' +
  BodyPart[part].split('_').pop()?.toLowerCase();

function HandFigure({ side }: { side: HandSide }) {
  const mirror = side === 'left';
  const x = (cx: number) => (mirror ? WIDTH - cx : cx);
  const parts = PARTS[side];

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <image
        width={WIDTH}
        height={HEIGHT}
        transform={mirror ? `translate(${WIDTH},0) scale(-1,1)` : undefined}
        href="/images/hand-pose.webp"
      />
      {(Object.keys(JOINTS) as Finger[]).flatMap((finger) =>
        parts[finger].map((part, joint) => (
          <circle
            key={part}
            className="body-part-circle"
            cx={x(JOINTS[finger][joint][0])}
            cy={JOINTS[finger][joint][1]}
            r={0.0001}
            id={BodyPart[part]}
          />
        ))
      )}
      <circle
        className="body-part-circle"
        cx={x(ROOT[0])}
        cy={ROOT[1]}
        r={0.0001}
        id={BodyPart[parts.root]}
      />
    </svg>
  );
}

export function HandAssignment({
  side,
  trackerPartGrouped,
  rolesWithErrors,
  highlightedRoles,
  assignedRoles,
  onRoleSelected,
}: {
  side: HandSide;
  trackerPartGrouped: { [key: number]: FlatDeviceTracker[] };
  rolesWithErrors: Partial<Record<BodyPart, BodyPartError>>;
  highlightedRoles: BodyPart[];
  assignedRoles: BodyPart[];
  onRoleSelected: (role: BodyPart) => void;
}) {
  const { l10n } = useLocalization();
  const parts = PARTS[side];

  const card = (
    part: BodyPart,
    direction: 'left' | 'right',
    labelId?: string
  ) => (
    <TrackerPartCard
      key={part}
      onlyAssigned={false}
      roleError={rolesWithErrors[part]?.label}
      td={trackerPartGrouped[part]}
      role={part}
      labelId={labelId}
      onClick={() => onRoleSelected(part)}
      direction={direction}
    />
  );

  const finger = (name: Finger, direction: 'left' | 'right') => (
    <div
      key={name}
      className={direction === 'right' ? 'text-right' : 'text-left'}
    >
      <div className="px-2">
        <Typography bold>
          {l10n.getString('onboarding-assign_trackers-finger-' + name)}
        </Typography>
      </div>
      {parts[name].map((part) => card(part, direction, jointLabelId(part)))}
    </div>
  );

  // The thumb is on the left of the picture for the right hand
  const thumbSide = (direction: 'left' | 'right') => (
    <div className="flex flex-col justify-around h-full gap-2">
      {finger('middle', direction)}
      {finger('index', direction)}
      {finger('thumb', direction)}
    </div>
  );
  const littleSide = (direction: 'left' | 'right') => (
    <div className="flex flex-col justify-around h-full gap-2">
      {finger('ring', direction)}
      {finger('little', direction)}
      {card(parts.root, direction)}
    </div>
  );

  return (
    <BodyInteractions
      mirror={false}
      dotsSize={20}
      assignedRoles={assignedRoles}
      highlightedRoles={highlightedRoles}
      onSelectRole={onRoleSelected}
      figure={<HandFigure side={side} />}
      leftControls={side === 'right' ? thumbSide('right') : littleSide('right')}
      rightControls={side === 'right' ? littleSide('left') : thumbSide('left')}
    />
  );
}
