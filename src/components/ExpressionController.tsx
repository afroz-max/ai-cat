'use client';

/**
 * ExpressionController — applies facial expressions and secondary motion.
 *
 * Strategy A (preferred): write morph-target weights on the GLB.
 * Strategy B (fallback):     animate head tilt, eye scale, brow rotation and
 *                            mouth curvature — used for the procedural
 *                            placeholder or any model without blend shapes.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { buildExpressionWeights, lerpWeights } from '@/lib/morphTargets';
import { useAvatarStore } from '@/store/avatarStore';
import type { Expression } from '@/types/avatar';

export interface ExpressionControllerProps {
  /** Root of the loaded model; omit for the procedural placeholder. */
  modelRoot?: THREE.Object3D | null;
  /** Names of every morph target discovered on the model. */
  morphNames?: string[];
  /** Head group driven by the fallback strategy. */
  headGroup?: THREE.Object3D | null;
  /** Eye groups scaled to fake blinks/expressions when there are no morphs. */
  eyes?: THREE.Object3D[] | null;
  /** Eyebrow groups rotated by the fallback strategy. */
  brows?: THREE.Object3D[] | null;
  /** Rotated subtly to fake a smile. */
  mouthFallback?: THREE.Object3D | null;
}

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

interface MorphTargetRef {
  mesh: MorphMesh;
  influences: number[];
  index: number;
}

/** Per-expression pose used by the fallback (no-morph) strategy. */
interface ExpressionPose {
  headTilt: number;
  headTurn: number;
  browRaise: number;
  browTilt: number;
  eyeScale: number;
  mouthCurve: number;
  bounce: number;
}

const POSES: Record<Expression, ExpressionPose> = {
  neutral: { headTilt: 0, headTurn: 0, browRaise: 0, browTilt: 0, eyeScale: 1, mouthCurve: 0, bounce: 0 },
  happy: { headTilt: -0.05, headTurn: 0.04, browRaise: 0.06, browTilt: -0.12, eyeScale: 0.94, mouthCurve: 0.26, bounce: 0.05 },
  sad: { headTilt: 0.14, headTurn: -0.05, browRaise: -0.05, browTilt: 0.3, eyeScale: 1.04, mouthCurve: -0.24, bounce: -0.03 },
  surprised: { headTilt: -0.1, headTurn: 0, browRaise: 0.16, browTilt: -0.04, eyeScale: 1.14, mouthCurve: 0, bounce: 0.1 },
  thinking: { headTilt: 0.09, headTurn: 0.18, browRaise: 0.02, browTilt: 0.14, eyeScale: 0.9, mouthCurve: -0.1, bounce: 0 },
  excited: { headTilt: -0.08, headTurn: 0.08, browRaise: 0.14, browTilt: -0.16, eyeScale: 1.1, mouthCurve: 0.34, bounce: 0.14 },
};

export default function ExpressionController({
  modelRoot,
  morphNames = [],
  headGroup,
  eyes,
  brows,
  mouthFallback,
}: ExpressionControllerProps) {
  const expression = useAvatarStore((s) => s.expression);
  const state = useAvatarStore((s) => s.state);

  const currentWeights = useRef<Record<string, number>>({});
  const targetWeights = useRef<Record<string, number>>({});
  const morphRefs = useRef<MorphTargetRef[]>([]);
  const builtForRoot = useRef<THREE.Object3D | null>(null);

  const pose = POSES[expression] ?? POSES.neutral;

  // Resolve morph name → {mesh, index} once per model, never per frame.
  useEffect(() => {
    if (!modelRoot || builtForRoot.current === modelRoot) return;

    modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as MorphMesh;
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dict || !influences) return;

      for (const index of Object.values(dict)) {
        morphRefs.current.push({ mesh, influences, index });
      }
    });

    builtForRoot.current = modelRoot;
    currentWeights.current = {};
    targetWeights.current = {};
  }, [modelRoot]);

  useEffect(() => {
    targetWeights.current = buildExpressionWeights(expression, morphNames);
  }, [expression, morphNames]);

  useFrame((state3d, delta) => {
    /* ---------- Morph-target strategy ---------- */
    if (morphRefs.current.length > 0) {
      // Ease between expressions over ~0.25s for a soft transition.
      const t = Math.min(1, 7 * delta);
      currentWeights.current = lerpWeights(
        currentWeights.current,
        targetWeights.current,
        t,
      );

      for (const [name, weight] of Object.entries(currentWeights.current)) {
        for (const ref of morphRefs.current) {
          const index = ref.mesh.morphTargetDictionary?.[name];
          if (typeof index !== 'number' || index !== ref.index) continue;
          ref.influences[index] = weight;
        }
      }
    }

    /* ---------- Fallback pose strategy ---------- */
    const clock = state3d.clock.elapsedTime;
    // Breathing gives a base sway so the character never looks frozen.
    const breathe = Math.sin(clock * 1.4) * 0.012;
    const sway = Math.sin(clock * 0.55) * 0.035;

    if (headGroup) {
      const targetX = pose.headTilt + breathe + (state === 'listening' ? -0.04 : 0);
      const targetY = pose.headTurn + sway;
      headGroup.rotation.x += (targetX - headGroup.rotation.x) * Math.min(1, 6 * delta);
      headGroup.rotation.y += (targetY - headGroup.rotation.y) * Math.min(1, 6 * delta);
      const targetYPos = pose.bounce * Math.sin(clock * 3);
      headGroup.position.y += (targetYPos - headGroup.position.y) * Math.min(1, 8 * delta);
    }

    for (const eye of eyes ?? []) {
      eye.scale.y += (pose.eyeScale - eye.scale.y) * Math.min(1, 8 * delta);
    }

    for (const brow of brows ?? []) {
      brow.rotation.z += (pose.browTilt - brow.rotation.z) * Math.min(1, 7 * delta);
      brow.position.y += (pose.browRaise - brow.position.y) * Math.min(1, 7 * delta);
    }

    if (mouthFallback) {
      const curve = pose.mouthCurve + (state === 'speaking' ? 0.08 : 0);
      mouthFallback.rotation.z += (curve - mouthFallback.rotation.z) * Math.min(1, 8 * delta);
    }
  });

  return null;
}