import { useLocalization } from '@fluent/react';
import {
  DetectStayAlignedRelaxedPoseRequestT,
  RpcMessage,
  StayAlignedRelaxedPose,
} from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { MouseEventHandler, useEffect, useState } from 'react';
import { Button, ButtonProps } from '@/components/commons/Button';

/**
 * Tells the server to set a relaxed pose to the current pose's angles.
 */
export function DetectRelaxedPoseButton({
  pose,
  onClick,
  delaySeconds = 0,
}: {
  pose: StayAlignedRelaxedPose;
  onClick?: () => void;
  // SlimeVR Mod: time to lie down before the pose is saved
  delaySeconds?: number;
}) {
  const { sendRPCPacket } = useWebsocketAPI();
  const { l10n } = useLocalization();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const save = () => {
    const req = new DetectStayAlignedRelaxedPoseRequestT();
    req.pose = pose;
    sendRPCPacket(RpcMessage.DetectStayAlignedRelaxedPoseRequest, req);
    if (onClick) {
      onClick();
    }
  };

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setSecondsLeft(null);
      save();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <Button
      variant="primary"
      disabled={secondsLeft !== null}
      onClick={() => {
        if (delaySeconds > 0) {
          setSecondsLeft(delaySeconds);
        } else {
          save();
        }
      }}
    >
      {secondsLeft !== null
        ? `${secondsLeft}…`
        : l10n.getString('settings-stay_aligned-relaxed_poses-save_pose')}
    </Button>
  );
}

/**
 * Tells the server to reset the angles in a relaxed pose.
 */
export function ResetRelaxedPoseButton({
  pose,
  variant = 'primary',
  onClick,
  children,
}: {
  variant: ButtonProps['variant'];
  pose: StayAlignedRelaxedPose;
  onClick?: MouseEventHandler<HTMLButtonElement>;
} & React.PropsWithChildren) {
  const { sendRPCPacket } = useWebsocketAPI();
  const { l10n } = useLocalization();

  return (
    <Button
      variant={variant}
      onClick={(e) => {
        const req = new DetectStayAlignedRelaxedPoseRequestT();
        req.pose = pose;
        sendRPCPacket(RpcMessage.ResetStayAlignedRelaxedPoseRequest, req);
        if (onClick) {
          onClick(e);
        }
      }}
    >
      {children ||
        l10n.getString('settings-stay_aligned-relaxed_poses-reset_pose')}
    </Button>
  );
}
