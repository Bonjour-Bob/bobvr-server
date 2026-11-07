import classNames from 'classnames';
import {
  createContext,
  MouseEventHandler,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { BodyPart, TrackerDataT } from 'solarxr-protocol';
import { useTracker } from '@/hooks/tracker';
import { Typography } from '@/components/commons/Typography';
import { useLocalization } from '@fluent/react';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { FlatDeviceTracker } from '@/store/app-store';
import { useBreakpoint } from '@/hooks/breakpoint';

function Tracker({
  tracker,
  updateVelocity,
}: {
  tracker: TrackerDataT;
  updateVelocity: (velocity: number) => void;
}) {
  const { l10n } = useLocalization();
  const { useVelocity } = useTracker(tracker);

  const velocity = useVelocity();

  useEffect(() => {
    updateVelocity(velocity);
  }, [velocity]);

  return (
    <div
      className="flex items-center gap-2 bg-background-60 rounded-md px-2 py-1 max-w-full"
      data-tracker-key={trackerKey(tracker)}
    >
      <Typography truncate whitespace="whitespace-nowrap">
        {`${tracker.info?.customName || tracker.info?.displayName}` ||
          l10n.getString('tracker-part_card-unassigned')}
      </Typography>
    </div>
  );
}

/** SlimeVR Mod: id of a tracker, to find it back after a drag */
export const trackerKey = (tracker: TrackerDataT) =>
  `${tracker.trackerId?.deviceId?.id ?? 'x'}:${tracker.trackerId?.trackerNum ?? 0}`;

/**
 * SlimeVR Mod: body part a tracker is being dragged over (or that waits for a
 * tracker), highlighted on the figure
 */
export const ActivePartContext = createContext<BodyPart>(BodyPart.NONE);

export function TrackerPartCard({
  td,
  role,
  direction,
  roleError,
  onlyAssigned,
  onClick,
  labelId,
}: {
  td: FlatDeviceTracker[];
  role: BodyPart;
  roleError: string | undefined;
  onlyAssigned: boolean;
  direction: 'left' | 'right';
  onClick?: MouseEventHandler<HTMLDivElement>;
  labelId?: string;
}) {
  const active = useContext(ActivePartContext) === role;
  const { isXs } = useBreakpoint('xs');
  const { l10n } = useLocalization();
  const [velocities, setVelocities] = useState<number[]>([]);

  const updateVelocity = (vel: number) => {
    if (velocities.length > 3) {
      velocities.shift();
    }
    velocities.push(vel);
    setVelocities(velocities);
  };

  useEffect(() => {
    if (!td) setVelocities([0, 0, 0]);
  }, [td]);

  const globalVelocity = useMemo(
    () =>
      Math.floor(
        velocities.reduce((curr, v) => curr + v, 0) / (td?.length || 1)
      ),
    [velocities, td]
  );

  const showCard = useMemo(
    () => (onlyAssigned && td && td.length > 0) || !onlyAssigned,
    [onlyAssigned, td]
  );

  return (
    (showCard && (
      <div
        className={classNames(
          'flex flex-col gap-1 control xs:w-auto hover:bg-background-50 cursor-pointer px-2 py-1 rounded-md relative transition-[box-shadow,background-color] duration-200 ease-linear select-none',
          direction === 'left' ? 'items-start' : 'items-end',
          active && 'bg-accent-background-30/40'
        )}
        id={BodyPart[role]}
        data-body-part={role}
        onClick={onClick}
        style={{
          boxShadow: `0px 0px ${globalVelocity * 3}px ${
            globalVelocity * 3
          }px rgb(var(--accent-background-30))`,
        }}
      >
        {roleError && (
          <div
            className={classNames(
              'absolute text-status-warning scale-75 -top-1',
              direction === 'right' ? '-right-6' : '-left-6'
            )}
          >
            <WarningIcon />
          </div>
        )}
        <Typography
          variant={isXs ? 'section-title' : 'standard'}
          whitespace={isXs ? 'whitespace-nowrap' : undefined}
        >
          {l10n.getString(labelId ?? 'body_part-' + BodyPart[role])}
        </Typography>
        {td?.map(({ tracker }, index) => (
          <Tracker
            tracker={tracker}
            key={index}
            updateVelocity={(vel) => updateVelocity(vel)}
          />
        ))}
        {!td && (
          <Typography color="text-background-30">
            {l10n.getString('tracker-part_card-unassigned')}
          </Typography>
        )}
      </div>
    )) || <></>
  );
}
