import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AssignTrackerRequestT,
  BodyPart,
  RpcMessage,
  SettingsRequestT,
  SettingsResponseT,
  TapDetectionSettingsT,
  ChangeSettingsRequestT,
  TapDetectionSetupNotificationT,
  TrackerDataT,
} from 'solarxr-protocol';
import { useChokerWarning } from '@/hooks/choker-warning';
import { useOnboarding } from '@/hooks/onboarding';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { BaseModal } from '@/components/commons/BaseModal';
import { Button } from '@/components/commons/Button';
import { CheckboxInternal } from '@/components/commons/Checkbox';
import { WarningBox } from '@/components/commons/TipBox';
import { ProgressBar } from '@/components/commons/ProgressBar';
import { Typography } from '@/components/commons/Typography';
import { LoaderIcon, SlimeState } from '@/components/commons/icon/LoaderIcon';
import { WifiIcon } from '@/components/commons/icon/WifiIcon';
import {
  ASSIGNMENT_MODES,
  ASSIGNMENT_RULES,
  BodyAssignment,
  LEGS_PARTS,
  LOWER_BODY,
} from '@/components/onboarding/BodyAssignment';
import { NeckWarningModal } from '@/components/onboarding/NeckWarningModal';
import { TrackerStatus } from '@/components/tracker/TrackerStatus';
import {
  ActivePartContext,
  trackerKey,
} from '@/components/tracker/TrackerPartCard';
import { AssignMode, useConfig } from '@/hooks/config';
import { useTracker } from '@/hooks/tracker';
import { playTapSetupSound } from '@/sounds/sounds';
import { useLocaleConfig } from '@/i18n/config';
import { useAtomValue } from 'jotai';
import {
  assignedTrackersAtom,
  FlatDeviceTracker,
  flatTrackersAtom,
} from '@/store/app-store';
import { HandAssignment, HandSide } from './HandAssignment';

// SlimeVR Mod: assignment page laid out like SlimeVR v22 (tracker list on the
// left, drag a tracker onto the body, body / fingers tabs, mirror pill),
// on top of the v0.9 (SlimeVR v21) server protocol.

export type BodyPartError = {
  label: string | undefined;
  affectedRoles: BodyPart[];
};

// Body part pointed at when a rule accepts several (any spine tracker)
const CANONICAL_SPINE = [
  BodyPart.CHEST,
  BodyPart.HIP,
  BodyPart.WAIST,
  BodyPart.UPPER_CHEST,
];

const COMMONS = [BodyPart.HEAD, BodyPart.LEFT_HAND, BodyPart.RIGHT_HAND];

/**
 * Setup order (from SlimeVR v22): a region is offered once everything it
 * needs is assigned, at most 3 unfinished regions at a time.
 */
const SETUP_REGIONS: { id: string; parts: BodyPart[]; needs: string[] }[] = [
  { id: 'legs', parts: [...LEGS_PARTS], needs: [] },
  { id: 'chest', parts: [BodyPart.CHEST], needs: [] },
  { id: 'hip', parts: [BodyPart.HIP], needs: ['chest'] },
  { id: 'waist', parts: [BodyPart.WAIST], needs: ['hip'] },
  { id: 'upperChest', parts: [BodyPart.UPPER_CHEST], needs: ['waist'] },
  {
    id: 'feet',
    parts: [BodyPart.LEFT_FOOT, BodyPart.RIGHT_FOOT],
    needs: ['legs'],
  },
  {
    id: 'upperArms',
    parts: [BodyPart.LEFT_UPPER_ARM, BodyPart.RIGHT_UPPER_ARM],
    needs: ['legs', 'chest'],
  },
  {
    id: 'lowerArms',
    parts: [BodyPart.LEFT_LOWER_ARM, BodyPart.RIGHT_LOWER_ARM],
    needs: ['upperArms'],
  },
  {
    id: 'shoulders',
    parts: [BodyPart.LEFT_SHOULDER, BodyPart.RIGHT_SHOULDER],
    needs: ['upperArms'],
  },
  { id: 'neck', parts: [BodyPart.NECK], needs: ['upperArms'] },
];

export function offeredBodyParts(
  assignedRoles: BodyPart[],
  requiredRoles: BodyPart[]
): BodyPart[] {
  const allParts = ASSIGNMENT_MODES[AssignMode.All];
  const assigned = new Set(assignedRoles);
  const offered = new Set<BodyPart>([...COMMONS, ...requiredRoles]);
  assigned.forEach((part) => allParts.includes(part) && offered.add(part));

  const finished = (id: string) =>
    SETUP_REGIONS.find((r) => r.id === id)?.parts.every((p) =>
      assigned.has(p)
    ) ?? false;

  let open = 0;
  SETUP_REGIONS.forEach((region) => {
    if (!region.needs.every(finished)) return;
    if (!finished(region.id)) {
      if (open >= 3) return;
      open += 1;
    }
    region.parts.forEach((part) => offered.add(part));
  });

  return [...offered];
}

type Drag = {
  key: string;
  label: string;
  fromPart: BodyPart;
  startX: number;
  startY: number;
  moved: boolean;
  onClick?: () => void;
};

/** What is under the pointer: a body part, the tracker list, or nothing */
function dropTargetAt(x: number, y: number): BodyPart | 'list' | null {
  const el = document.elementFromPoint(x, y);
  const partEl = el?.closest('[data-body-part]');
  if (partEl) return Number(partEl.getAttribute('data-body-part'));
  if (el?.closest('[data-tracker-list]')) return 'list';
  return null;
}

const trackerLabel = (tracker: TrackerDataT) =>
  `${tracker.info?.customName || tracker.info?.displayName || ''}`;

export function TrackersAssignPage() {
  const { l10n } = useLocalization();
  const { currentLocales } = useLocaleConfig();
  const { config, setConfig } = useConfig();
  const { applyProgress, state, slimeSet } = useOnboarding();
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();

  const [tab, setTab] = useState<'body' | 'fingers'>('body');
  const [handSide, setHandSide] = useState<HandSide>('right');
  const [armedPart, setArmedPart] = useState<BodyPart>(BodyPart.NONE);
  const [pendingTracker, setPendingTracker] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoverPart, setHoverPart] = useState<BodyPart | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const neckDropRef = useRef<string | null>(null);

  const mirrorView = config?.mirrorView ?? true;
  const showAll = config?.assignShowAllBodyParts ?? false;

  const assignedTrackers = useAtomValue(assignedTrackersAtom);
  const trackers = useAtomValue(flatTrackersAtom);

  const [tapDetectionSettings, setTapDetectionSettings] = useState<Omit<
    TapDetectionSettingsT,
    'pack'
  > | null>(null);

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.SettingsResponse, (settings: SettingsResponseT) => {
    if (settings.tapDetectionSettings) {
      setTapDetectionSettings(settings.tapDetectionSettings);
    }
  });

  // Tap detection setup mode while on this page (double tap a tracker to
  // assign it to the selected body part)
  useEffect(() => {
    if (!tapDetectionSettings) return;
    const newTapSettings = new TapDetectionSettingsT(
      tapDetectionSettings.fullResetDelay,
      tapDetectionSettings.fullResetEnabled,
      tapDetectionSettings.fullResetTaps,
      tapDetectionSettings.yawResetDelay,
      tapDetectionSettings.yawResetEnabled,
      tapDetectionSettings.yawResetTaps,
      tapDetectionSettings.mountingResetDelay,
      tapDetectionSettings.mountingResetEnabled,
      tapDetectionSettings.mountingResetTaps,
      true,
      null,
      tapDetectionSettings.yawResetTracker,
      tapDetectionSettings.fullResetTracker,
      tapDetectionSettings.mountingResetTracker
    );

    sendRPCPacket(
      RpcMessage.ChangeSettingsRequest,
      new ChangeSettingsRequestT(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        newTapSettings
      )
    );

    return () => {
      newTapSettings.setupMode = false;
      sendRPCPacket(
        RpcMessage.ChangeSettingsRequest,
        new ChangeSettingsRequestT(
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          newTapSettings
        )
      );
    };
  }, [tapDetectionSettings]);

  const trackerPartGrouped = useMemo(
    () =>
      assignedTrackers.reduce<{ [key: number]: FlatDeviceTracker[] }>(
        (curr, td) => {
          const key = td.tracker.info?.bodyPart || BodyPart.NONE;
          return {
            ...curr,
            [key]: [...(curr[key] || []), td],
          };
        },
        {}
      ),
    [assignedTrackers]
  );

  const assignedRoles = useMemo(
    () =>
      assignedTrackers.map(
        ({ tracker }) => tracker.info?.bodyPart || BodyPart.NONE
      ),
    [assignedTrackers]
  );

  const rolesWithErrors = useMemo(() => {
    const trackerRoles = trackers.map(
      ({ tracker }) => tracker.info?.bodyPart || BodyPart.NONE
    );

    const message = (assignedRole: BodyPart) => {
      const unassignedRoles: [BodyPart | BodyPart[], boolean][] = (
        ASSIGNMENT_RULES[assignedRole] || []
      ).map((part) => [
        part,
        Array.isArray(part)
          ? trackerRoles.some((tr) => part.includes(tr))
          : trackerRoles.includes(part),
      ]);

      // Special exception for waist/hip: https://github.com/SlimeVR/SlimeVR-Server/issues/612
      if (
        (assignedRole === BodyPart.HIP || assignedRole === BodyPart.WAIST) &&
        !trackerRoles.some((t) => LOWER_BODY.has(t))
      ) {
        return;
      }

      if (unassignedRoles.every(([, state]) => state)) return;

      return {
        affectedRoles: unassignedRoles
          .filter(([, state]) => !state)
          .map(([part]) =>
            Array.isArray(part)
              ? (CANONICAL_SPINE.find((p) => part.includes(p)) ?? part[0])
              : part
          ),
        label: l10n.getString(
          `onboarding-assign_trackers-warning-${BodyPart[assignedRole]}`,
          {
            unassigned: unassignedRoles
              .map(([, state]) => state)
              .reduce((acc, cur, i) => acc + (Number(cur) << i), 0),
          }
        ),
      };
    };

    return trackerRoles.reduce<Partial<Record<BodyPart, BodyPartError>>>(
      (curr, role) => {
        const error = role !== BodyPart.NONE ? message(role) : undefined;
        if (error) curr[role] = error;
        return curr;
      },
      {}
    );
  }, [trackers, l10n]);

  const requiredRoles = useMemo(
    () => [
      ...new Set(
        Object.values(rolesWithErrors).flatMap((e) => e?.affectedRoles ?? [])
      ),
    ],
    [rolesWithErrors]
  );

  const visibleParts = useMemo(
    () =>
      showAll
        ? ASSIGNMENT_MODES[AssignMode.All]
        : offeredBodyParts(assignedRoles, requiredRoles),
    [showAll, assignedRoles, requiredRoles]
  );

  const sendAssign = (td: FlatDeviceTracker, role: BodyPart) => {
    const assignreq = new AssignTrackerRequestT();
    assignreq.bodyPosition = role;
    assignreq.mountingOrientation =
      td.tracker.info?.mountingOrientation || null;
    assignreq.trackerId = td.tracker.trackerId;
    assignreq.allowDriftCompensation = false;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
  };

  const findTracker = (key: string) =>
    trackers.find(({ tracker }) => trackerKey(tracker) === key);

  const clearPending = () => {
    setArmedPart(BodyPart.NONE);
    setPendingTracker(null);
  };

  /** Puts a tracker on a body part (the one already there goes back to the list) */
  const assign = (key: string, role: BodyPart) => {
    const td = findTracker(key);
    if (!td) return;
    if (role !== BodyPart.NONE) {
      (trackerPartGrouped[role] || [])
        .filter(({ tracker }) => trackerKey(tracker) !== key)
        .forEach((other) => sendAssign(other, BodyPart.NONE));
    }
    sendAssign(td, role);
    clearPending();
  };

  const { closeChokerWarning, tryOpenChokerWarning, shouldShowChokerWarn } =
    useChokerWarning<BodyPart>({
      next: (role) => {
        const dropped = neckDropRef.current;
        neckDropRef.current = null;
        if (dropped) assign(dropped, role);
        else setArmedPart(role);
      },
    });

  const assignChecked = (key: string, role: BodyPart) => {
    if (role === BodyPart.NECK) {
      neckDropRef.current = key;
      tryOpenChokerWarning(role);
    } else {
      assign(key, role);
    }
  };

  const selectPart = (role: BodyPart) => {
    if (suppressClickRef.current) return;
    if (pendingTracker) {
      assignChecked(pendingTracker, role);
      return;
    }
    if (armedPart === role) {
      clearPending();
      return;
    }
    tryOpenChokerWarning(role);
  };

  const selectTracker = (key: string) => {
    if (armedPart !== BodyPart.NONE) {
      assign(key, armedPart);
      return;
    }
    setPendingTracker(pendingTracker === key ? null : key);
  };

  useRPCPacket(
    RpcMessage.TapDetectionSetupNotification,
    (tapSetup: TapDetectionSetupNotificationT) => {
      if (armedPart === BodyPart.NONE || !tapSetup.trackerId) return;
      const td = trackers.find(
        ({ tracker }) =>
          tracker.trackerId?.trackerNum === tapSetup.trackerId?.trackerNum &&
          tracker.trackerId?.deviceId?.id === tapSetup.trackerId?.deviceId?.id
      );
      if (!td) return;
      assign(trackerKey(td.tracker), armedPart);
      playTapSetupSound(config?.feedbackSoundVolume);
    }
  );

  const unassignAll = () => {
    assignedTrackers.forEach((td) => sendAssign(td, BodyPart.NONE));
    clearPending();
  };

  // Drag a tracker (from the list or from the body) with the mouse or a finger
  const onDragMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6
    )
      return;
    drag.moved = true;
    setGhost({ label: drag.label, x: e.clientX, y: e.clientY });
    const target = dropTargetAt(e.clientX, e.clientY);
    setHoverPart(typeof target === 'number' ? target : null);
  };

  const onDragEnd = (e: PointerEvent) => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    const drag = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    setHoverPart(null);
    if (!drag) return;
    if (!drag.moved) {
      drag.onClick?.();
      return;
    }
    // The click that follows the drop must not select the part under it
    suppressClickRef.current = true;
    setTimeout(() => (suppressClickRef.current = false), 0);
    const target = dropTargetAt(e.clientX, e.clientY);
    if (typeof target === 'number' && target !== BodyPart.NONE) {
      if (target !== drag.fromPart) assignChecked(drag.key, target);
    } else if (target === 'list' && drag.fromPart !== BodyPart.NONE) {
      assign(drag.key, BodyPart.NONE);
    }
  };

  const beginDrag = (
    e: ReactPointerEvent,
    tracker: TrackerDataT,
    onClick?: () => void
  ) => {
    if (e.button !== 0) return;
    dragRef.current = {
      key: trackerKey(tracker),
      label: trackerLabel(tracker),
      fromPart: tracker.info?.bodyPart ?? BodyPart.NONE,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      onClick,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  // A tracker already on the body can be dragged elsewhere, or back to the list
  const onFigurePointerDown = (e: ReactPointerEvent) => {
    const key = (e.target as Element)
      .closest('[data-tracker-key]')
      ?.getAttribute('data-tracker-key');
    const td = key && findTracker(key);
    if (td) beginDrag(e, td.tracker);
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
    },
    []
  );

  applyProgress(0.5);

  const unassignedTrackers = trackers.filter(
    ({ tracker }) => (tracker.info?.bodyPart ?? BodyPart.NONE) === BodyPart.NONE
  );
  const groups = [
    {
      id: 'wifi',
      labelId: 'onboarding-assign_trackers-group-wifi',
      trackers: unassignedTrackers.filter(({ tracker }) => tracker.info?.isImu),
    },
    {
      id: 'other',
      labelId: 'onboarding-assign_trackers-group-other',
      trackers: unassignedTrackers.filter(
        ({ tracker }) => !tracker.info?.isImu
      ),
    },
  ].filter((group) => group.trackers.length > 0);

  const listFormat = new Intl.ListFormat(currentLocales, {
    type: 'conjunction',
  });
  const missingParts = listFormat.format(
    requiredRoles.map((part) => l10n.getString(`body_part-${BodyPart[part]}`))
  );

  return (
    <ActivePartContext.Provider value={hoverPart ?? armedPart}>
      <NeckWarningModal
        isOpen={shouldShowChokerWarn}
        overlayClassName={classNames(
          'fixed top-0 right-0 left-0 bottom-0 flex flex-col items-center w-full h-full justify-center bg-background-90 bg-opacity-90 z-20'
        )}
        onClose={() => {
          neckDropRef.current = null;
          closeChokerWarning(true);
        }}
        accept={() => closeChokerWarning(false)}
      />
      <TapAssignModal
        part={armedPart}
        assigned={!!trackerPartGrouped[armedPart]?.length}
        trackers={unassignedTrackers}
        onPick={(td) => assign(trackerKey(td.tracker), armedPart)}
        onUnassign={() => {
          (trackerPartGrouped[armedPart] || []).forEach((td) =>
            sendAssign(td, BodyPart.NONE)
          );
          clearPending();
        }}
        onClose={clearPending}
      />
      {ghost &&
        createPortal(
          <div
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background-50 outline outline-2 outline-accent-background-40 shadow-lg px-4 py-2 max-w-[220px]"
            style={{ left: ghost.x, top: ghost.y }}
          >
            <Typography bold truncate>
              {ghost.label}
            </Typography>
          </div>,
          document.body
        )}

      <div className="w-full h-full flex flex-row overflow-hidden min-h-0">
        {/* Left: trackers to place */}
        <div className="w-[380px] lg:w-[400px] xl:w-[440px] p-4 flex flex-col gap-2 shrink-0 min-h-0 border-r border-background-60">
          <div className="flex flex-col gap-1 shrink-0">
            <Typography variant="main-title">
              {l10n.getString('onboarding-assign_trackers-title')}
            </Typography>
            <Typography whitespace="whitespace-pre-wrap">
              {l10n.getString('onboarding-assign_trackers-description-v22')}
            </Typography>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Typography color="secondary">
              {l10n.getString('onboarding-assign_trackers-assigned', {
                assigned: assignedTrackers.length,
                trackers: trackers.length,
              })}
            </Typography>
            <div className="flex-grow">
              <ProgressBar
                progress={
                  trackers.length
                    ? assignedTrackers.length / trackers.length
                    : 0
                }
                height={4}
              />
            </div>
          </div>

          <div className="w-fit shrink-0">
            <CheckboxInternal
              variant="toggle"
              name="showAllBodyParts"
              checked={showAll}
              onChange={() => setConfig({ assignShowAllBodyParts: !showAll })}
              label={l10n.getString('onboarding-assign_trackers-show_all')}
            />
          </div>

          <div
            data-tracker-list
            className="flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto -mx-2 px-2 pt-1.5"
          >
            {trackers.length === 0 ? (
              <EmptyState
                slimeState={SlimeState.JUMPY}
                titleId="onboarding-assign_trackers-no_trackers-title"
                descriptionId="onboarding-assign_trackers-no_trackers-description"
              />
            ) : unassignedTrackers.length === 0 ? (
              <EmptyState
                slimeState={SlimeState.HAPPY}
                success
                titleId="onboarding-assign_trackers-all_assigned-title"
                descriptionId="onboarding-assign_trackers-all_assigned-description"
              />
            ) : (
              groups.map((group) => (
                <TrackerGroup key={group.id} labelId={group.labelId}>
                  {group.trackers.map(({ tracker }) => (
                    <TrackerRow
                      key={trackerKey(tracker)}
                      tracker={tracker}
                      selected={pendingTracker === trackerKey(tracker)}
                      onPointerDown={(e) =>
                        beginDrag(e, tracker, () =>
                          selectTracker(trackerKey(tracker))
                        )
                      }
                    />
                  ))}
                </TrackerGroup>
              ))
            )}
          </div>

          {requiredRoles.length > 0 && (
            <div className="shrink-0">
              <WarningBox>
                {l10n.getString('onboarding-assign_trackers-warning-required', {
                  parts: missingParts,
                  count: requiredRoles.length,
                })}
              </WarningBox>
            </div>
          )}

          {!state.alonePage && (
            <div className="shrink-0 pt-4 border-t border-background-60 flex flex-row justify-between items-center">
              <Button
                variant="secondary"
                to={
                  slimeSet && ['butterfly', 'dongle-slime'].includes(slimeSet)
                    ? '/onboarding/dongle'
                    : '/onboarding/wifi-creds'
                }
              >
                {l10n.getString('onboarding-previous_step')}
              </Button>
              <Button
                variant="primary"
                to="/onboarding/mounting/choose"
                disabled={assignedTrackers.length === 0 && trackers.length > 0}
              >
                {l10n.getString('onboarding-continue')}
              </Button>
            </div>
          )}
        </div>

        {/* Right: the body */}
        <div className="flex-1 flex flex-col gap-2 pt-4 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 shrink-0 px-4">
            <div className="flex items-center bg-background-70 rounded-lg w-fit gap-1 p-1">
              <Tab
                label={l10n.getString('onboarding-assign_trackers-tab-body')}
                active={tab === 'body'}
                onClick={() => setTab('body')}
              />
              <Tab
                label={l10n.getString('onboarding-assign_trackers-tab-fingers')}
                active={tab === 'fingers'}
                onClick={() => setTab('fingers')}
              />
            </div>
            {tab === 'body' ? (
              <SidePill
                title={l10n.getString('onboarding-assign_trackers-mirror')}
                onClick={() => setConfig({ mirrorView: !mirrorView })}
              >
                <SideOption side={mirrorView ? 'left' : 'right'} />
                <CompareIcon />
                <SideOption side={mirrorView ? 'right' : 'left'} />
              </SidePill>
            ) : (
              <SidePill
                onClick={() =>
                  setHandSide(handSide === 'left' ? 'right' : 'left')
                }
              >
                <SideOption side="left" active={handSide === 'left'} />
                <SideOption side="right" active={handSide === 'right'} />
              </SidePill>
            )}
            <Button variant="secondary" onClick={unassignAll}>
              {l10n.getString('onboarding-assign_trackers-reset_assignments')}
            </Button>
          </div>
          <div
            className="flex-1 min-h-0 px-2 pb-4 flex justify-center fill-background-50"
            onPointerDown={onFigurePointerDown}
          >
            <div
              className={classNames(
                'w-full h-full flex flex-col overflow-y-clip tall:py-6',
                tab === 'fingers' ? 'max-w-[940px]' : 'max-w-[770px]'
              )}
            >
              {tab === 'body' ? (
                <BodyAssignment
                  dotSize={15}
                  onlyAssigned={false}
                  highlightedRoles={requiredRoles}
                  rolesWithErrors={rolesWithErrors}
                  assignMode={AssignMode.All}
                  visibleParts={visibleParts}
                  mirror={mirrorView}
                  onRoleSelected={selectPart}
                />
              ) : (
                <HandAssignment
                  side={handSide}
                  trackerPartGrouped={trackerPartGrouped}
                  rolesWithErrors={rolesWithErrors}
                  highlightedRoles={requiredRoles}
                  assignedRoles={assignedRoles}
                  onRoleSelected={selectPart}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </ActivePartContext.Provider>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        'rounded-md px-4 py-2',
        active ? 'bg-background-50' : 'hover:bg-background-60'
      )}
    >
      <Typography bold={active}>{label}</Typography>
    </button>
  );
}

function SidePill({
  title,
  onClick,
  children,
}: {
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center gap-1 bg-background-80 rounded-full w-fit p-1 cursor-pointer"
    >
      {children}
    </button>
  );
}

function SideOption({
  side,
  active,
}: {
  side: 'left' | 'right';
  active?: boolean;
}) {
  const { l10n } = useLocalization();
  return (
    <div
      className={classNames(
        'flex items-center rounded-full gap-2 px-3 py-1',
        active === true && 'bg-background-60',
        active === false && 'opacity-50'
      )}
    >
      <span
        className={classNames(
          'w-2.5 h-2.5 rounded-full bg-background-10 outline outline-4',
          side === 'left' ? 'outline-[#2b83e8]' : 'outline-[#f956b8]'
        )}
      />
      <Typography bold>
        {l10n.getString('onboarding-assign_trackers-side-' + side)}
      </Typography>
    </div>
  );
}

function CompareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height={22}
      viewBox="0 -960 960 960"
      width={22}
      className="fill-background-10"
    >
      <path d="m320-160-56-57 103-103H80v-80h287L264-503l56-57 200 200-200 200Zm320-240L440-600l200-200 56 57-103 103h287v80H593l103 103-56 57Z" />
    </svg>
  );
}

function TrackerGroup({
  labelId,
  children,
}: {
  labelId: string;
  children: ReactNode;
}) {
  const { l10n } = useLocalization();
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left"
      >
        <div className="w-8 h-8 rounded-full bg-accent-background-30 flex items-center justify-center fill-background-10 shrink-0">
          <WifiIcon value={1} size={16} />
        </div>
        <Typography bold>{l10n.getString(labelId)}</Typography>
        <div className="flex-grow border-t-2 border-dashed border-background-50" />
        <div
          className={classNames(
            'w-8 h-8 rounded-full bg-background-60 flex items-center justify-center transition-transform',
            !open && 'rotate-180'
          )}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            className="fill-background-10"
          >
            <path d="M12 8l-6 6 1.4 1.4 4.6-4.6 4.6 4.6L18 14z" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-2 pl-4 ml-4 border-l-2 border-dashed border-accent-background-30">
          {children}
        </div>
      )}
    </div>
  );
}

function TrackerRow({
  tracker,
  selected,
  onPointerDown,
}: {
  tracker: TrackerDataT;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const { useVelocity } = useTracker(tracker);
  const velocity = useVelocity();

  return (
    <div
      onPointerDown={onPointerDown}
      className={classNames(
        'flex items-center gap-2 rounded-lg h-12 p-2 bg-background-60 touch-none cursor-grab active:cursor-grabbing select-none',
        'transition-[box-shadow,transform] duration-200 ease-linear hover:scale-[1.02]',
        selected && 'ring-2 ring-accent-background-30'
      )}
      style={{
        boxShadow: `0px 0px ${velocity * 3}px ${velocity * 3}px rgb(var(--accent-background-30))`,
      }}
    >
      <div className="w-8 h-8 rounded-md bg-accent-background-30 flex items-center justify-center fill-background-10 shrink-0">
        <WifiIcon value={1} size={16} />
      </div>
      <div className="flex-grow min-w-0">
        <Typography bold truncate whitespace="whitespace-nowrap">
          {trackerLabel(tracker)}
        </Typography>
      </div>
      <div className="shrink-0">
        <TrackerStatus status={tracker.status} />
      </div>
    </div>
  );
}

function EmptyState({
  slimeState,
  success,
  titleId,
  descriptionId,
}: {
  slimeState: SlimeState;
  success?: boolean;
  titleId: string;
  descriptionId: string;
}) {
  const { l10n } = useLocalization();
  return (
    <div className="flex-1 my-auto flex flex-col items-center justify-center gap-2 text-center">
      <LoaderIcon slimeState={slimeState} size={56} />
      <Typography
        variant="section-title"
        color={success ? 'text-status-success' : undefined}
      >
        {l10n.getString(titleId)}
      </Typography>
      <Typography>{l10n.getString(descriptionId)}</Typography>
    </div>
  );
}

function TapAssignModal({
  part,
  assigned,
  trackers,
  onPick,
  onUnassign,
  onClose,
}: {
  part: BodyPart;
  assigned: boolean;
  trackers: FlatDeviceTracker[];
  onPick: (td: FlatDeviceTracker) => void;
  onUnassign: () => void;
  onClose: () => void;
}) {
  const { l10n } = useLocalization();
  const isOpen = part !== BodyPart.NONE;
  const partName = isOpen ? l10n.getString('body_part-' + BodyPart[part]) : '';

  return (
    <BaseModal
      isOpen={isOpen}
      appendClasses="max-w-md w-full"
      closeable
      onRequestClose={onClose}
    >
      <div className="flex flex-col gap-4 items-center text-center">
        <Typography variant="main-title">
          {l10n.getString('onboarding-assign_trackers-tap_modal-title')}
        </Typography>
        <Typography variant="section-title" color="text-accent-background-10">
          {partName}
        </Typography>
        <Typography>
          {l10n.getString('onboarding-assign_trackers-tap_modal-description')}
        </Typography>
        {trackers.length > 0 && (
          <div className="flex flex-col gap-2 w-full max-h-[40vh] overflow-y-auto">
            {trackers.map((td) => (
              <button
                type="button"
                key={trackerKey(td.tracker)}
                onClick={() => onPick(td)}
                className="flex items-center justify-between gap-2 rounded-lg p-2 bg-background-50 hover:bg-background-40 text-left"
              >
                <Typography bold truncate>
                  {trackerLabel(td.tracker)}
                </Typography>
                <TrackerStatus status={td.tracker.status} />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          {assigned && (
            <Button variant="tertiary" className="mr-auto" onClick={onUnassign}>
              {l10n.getString('onboarding-assign_trackers-unassign_part', {
                part: partName,
              })}
            </Button>
          )}
          <Button variant="tertiary" onClick={onClose}>
            {l10n.getString('onboarding-assign_trackers-tap_modal-cancel')}
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
