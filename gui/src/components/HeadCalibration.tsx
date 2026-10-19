import { useAtomValue } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import {
  BodyPart,
  ChangeSkeletonConfigRequestT,
  RpcMessage,
  SkeletonBone,
  SkeletonConfigRequestT,
} from 'solarxr-protocol';
import { Quaternion, Vector3 } from 'three';
import { bonesAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { QuaternionFromQuatT } from '@/maths/quaternion';
import { Vector3FromVec3fT } from '@/maths/vector3';
import { BaseModal } from './commons/BaseModal';
import { Button } from './commons/Button';
import { Typography } from './commons/Typography';

// SlimeVR Mod : calibration automatique de la tete.
// Le corps est place a partir du casque : la base du cou est calculee avec la
// position du casque et la rotation de la tete. Si "Decalage de la tete" et
// "Longueur du cou" sont faux, bouger la tete deplace tout le corps. Ici on
// enregistre le casque pendant que la tete bouge et que le corps reste
// immobile, puis on cherche le point (la base du cou) qui bouge le moins :
// c'est un simple calcul de moindres carres.

const COUNTDOWN_S = 3;
const RECORD_S = 10;
const MIN_SAMPLES = 40;
const MIN_HEAD_MOVE_RAD = 0.5; // ~30 deg

type Sample = { pos: Vector3; rot: Quaternion };
type Stage = 'idle' | 'countdown' | 'recording' | 'done' | 'error';

type Result = { neck: number; headShift: number; residualCm: number };

// Solves A x = b (n x n) with Gaussian elimination and partial pivoting
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

// Finds d (neck base -> HMD, in head space) and P (neck base, in the world)
// so that HMD = R * d + P for every sample
function fitNeck(samples: Sample[]): Result | null {
  const ata = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const atb = new Array(6).fill(0);
  for (const { pos, rot } of samples) {
    const cols = [
      new Vector3(1, 0, 0).applyQuaternion(rot),
      new Vector3(0, 1, 0).applyQuaternion(rot),
      new Vector3(0, 0, 1).applyQuaternion(rot),
    ];
    const b = [pos.x, pos.y, pos.z];
    for (let k = 0; k < 3; k++) {
      const row = [
        cols[0].getComponent(k),
        cols[1].getComponent(k),
        cols[2].getComponent(k),
        k === 0 ? 1 : 0,
        k === 1 ? 1 : 0,
        k === 2 ? 1 : 0,
      ];
      for (let i = 0; i < 6; i++) {
        atb[i] += row[i] * b[k];
        for (let j = 0; j < 6; j++) ata[i][j] += row[i] * row[j];
      }
    }
  }
  const x = solve(ata, atb);
  if (!x) return null;
  const d = new Vector3(x[0], x[1], x[2]);
  const p = new Vector3(x[3], x[4], x[5]);

  let sq = 0;
  for (const { pos, rot } of samples) {
    sq += d.clone().applyQuaternion(rot).add(p).sub(pos).lengthSq();
  }
  return {
    // Neck goes down from the middle of the head, head shift goes back
    // from the HMD: d = (0, neck, -headShift)
    neck: d.y,
    headShift: -d.z,
    residualCm: Math.sqrt(sq / samples.length) * 100,
  };
}

export function HeadCalibrationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const bones = useAtomValue(bonesAtom);
  const { sendRPCPacket } = useWebsocketAPI();
  const [stage, setStage] = useState<Stage>('idle');
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const samples = useRef<Sample[]>([]);

  const start = () => {
    setResult(null);
    setError('');
    setStage('countdown');
    setTimeLeft(COUNTDOWN_S);
  };

  const finish = () => {
    const list = samples.current;
    if (list.length < MIN_SAMPLES) {
      setError(
        'Pas assez de données du casque. Vérifie que SteamVR est lancé et que le casque est suivi.'
      );
      setStage('error');
      return;
    }
    const maxMove = Math.max(...list.map((s) => s.rot.angleTo(list[0].rot)));
    if (maxMove < MIN_HEAD_MOVE_RAD) {
      setError(
        'Tu n’as pas assez bougé la tête. Recommence en tournant, hochant et penchant bien la tête.'
      );
      setStage('error');
      return;
    }
    const res = fitNeck(list);
    if (
      !res ||
      res.neck < 0.04 ||
      res.neck > 0.35 ||
      res.headShift < 0.02 ||
      res.headShift > 0.3
    ) {
      setError(
        'Le résultat n’est pas cohérent (le corps a sûrement bougé). Recommence en gardant les épaules bien immobiles.'
      );
      setStage('error');
      return;
    }
    setResult(res);
    setStage('done');
  };

  const apply = () => {
    if (!result) return;
    sendRPCPacket(
      RpcMessage.ChangeSkeletonConfigRequest,
      new ChangeSkeletonConfigRequestT(SkeletonBone.HEAD, result.headShift)
    );
    sendRPCPacket(
      RpcMessage.ChangeSkeletonConfigRequest,
      new ChangeSkeletonConfigRequestT(SkeletonBone.NECK, result.neck)
    );
    sendRPCPacket(
      RpcMessage.SkeletonConfigRequest,
      new SkeletonConfigRequestT()
    );
    close();
  };

  const close = () => {
    setStage('idle');
    setResult(null);
    setError('');
    onClose();
  };

  // Record the HMD while recording
  useEffect(() => {
    if (stage !== 'recording') return;
    const head = bones.find((b) => b.bodyPart === BodyPart.HEAD);
    const neck = bones.find((b) => b.bodyPart === BodyPart.NECK);
    if (!head?.headPositionG || !neck?.rotationG) return;
    samples.current.push({
      pos: Vector3FromVec3fT(head.headPositionG),
      rot: QuaternionFromQuatT(neck.rotationG).normalize(),
    });
  }, [bones, stage]);

  // Countdown, then recording, then compute
  useEffect(() => {
    if (stage !== 'countdown' && stage !== 'recording') return;
    if (timeLeft > 0) {
      const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
      return () => clearTimeout(t);
    }
    if (stage === 'countdown') {
      samples.current = [];
      setStage('recording');
      setTimeLeft(RECORD_S);
      return;
    }
    finish();
  }, [stage, timeLeft]);

  const busy = stage === 'countdown' || stage === 'recording';

  return (
    <BaseModal isOpen={isOpen} onRequestClose={busy ? undefined : close}>
      <div className="flex flex-col gap-4 max-w-md">
        <Typography variant="main-title" bold>
          Calibrer la tête
        </Typography>
        <Typography>
          Pour que ton corps ne bouge plus quand tu bouges la tête. Mets ton
          casque, reste debout et garde les épaules et le torse bien immobiles.
          Pendant l’enregistrement, bouge seulement la tête dans tous les sens :
          dis « non », dis « oui », penche-la à gauche et à droite.
        </Typography>

        {stage === 'countdown' && (
          <Typography variant="main-title" textAlign="text-center">
            Prépare-toi… {timeLeft}
          </Typography>
        )}
        {stage === 'recording' && (
          <Typography variant="main-title" textAlign="text-center">
            Bouge la tête ! {timeLeft}
          </Typography>
        )}
        {stage === 'error' && (
          <Typography color="text-status-critical">{error}</Typography>
        )}
        {stage === 'done' && result && (
          <div className="flex flex-col gap-1">
            <Typography>
              Décalage de la tête : {(result.headShift * 100).toFixed(1)} cm
            </Typography>
            <Typography>
              Longueur du cou : {(result.neck * 100).toFixed(1)} cm
            </Typography>
            <Typography color="secondary">
              Le corps bougera encore d’environ {result.residualCm.toFixed(1)}{' '}
              cm en moyenne.
            </Typography>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="tertiary" onClick={close} disabled={busy}>
            Fermer
          </Button>
          {stage === 'done' ? (
            <Button variant="primary" onClick={apply}>
              Appliquer
            </Button>
          ) : (
            <Button variant="primary" onClick={start} disabled={busy}>
              {stage === 'error' ? 'Recommencer' : 'Commencer'}
            </Button>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
