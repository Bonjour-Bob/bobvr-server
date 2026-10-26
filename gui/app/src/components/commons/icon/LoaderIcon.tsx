import { useEffect, useRef, useState } from 'react';

export enum SlimeState {
  HAPPY,
  SAD,
  JUMPY,
  CURIOUS,
}

// BOBvr: Bob dancing everywhere instead of the slimes
const BOB_DANCE = { src: '/videos/bob-danse.webm' };
const SLIME_ASSETS = {
  [SlimeState.HAPPY]: BOB_DANCE,
  [SlimeState.JUMPY]: BOB_DANCE,
  [SlimeState.SAD]: BOB_DANCE,
  [SlimeState.CURIOUS]: BOB_DANCE,
};

export function LoaderIcon({
  slimeState = SlimeState.HAPPY,
  size = 85,
  lowPriority = false,
}: {
  slimeState: SlimeState;
  size?: number | string;
  lowPriority?: boolean;
}) {
  const current = SLIME_ASSETS[slimeState] || SLIME_ASSETS[SlimeState.HAPPY];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPageVisible, setIsPageVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!lowPriority) return;

      const isVisible = !document.hidden;
      setIsPageVisible(isVisible);

      if (!videoRef.current) return;

      if (isVisible) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    };

    const handleBlur = () => {
      if (!lowPriority) return;

      setIsPageVisible(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    };

    const handleFocus = () => {
      if (!lowPriority) return;

      setIsPageVisible(true);
      videoRef.current?.play().catch(() => {});
    };

    if (!lowPriority && videoRef.current) {
      setIsPageVisible(true);
      videoRef.current.play().catch(() => {});
    } else if (lowPriority && (document.hidden || !document.hasFocus())) {
      setIsPageVisible(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [lowPriority]);

  return (
    <video
      ref={videoRef}
      autoPlay={isPageVisible}
      loop
      muted
      playsInline
      src={current.src}
      // The video's black background becomes transparent
      className="bg-transparent mix-blend-lighten"
      style={{
        width: size,
        height: 'auto',
        aspectRatio: '1 / 1',
        contentVisibility: 'auto',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    />
  );
}
