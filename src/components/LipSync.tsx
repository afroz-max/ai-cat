'use client';

/**
 * LipSync — drives mouth movement while the character speaks.
 *
 * Two strategies, chosen automatically:
 *  A. **Morph targets** — when the GLB exposes a jaw/mouth/viseme blend shape.
 *  B. **Fallback** — scale a mouth mesh or rotate a jaw node.
 *
 * The amplitude always comes from `lipSyncSignal`, which is fed by the voice
 * layer. That keeps this component independent of which TTS is in use.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { lipSyncSignal } from '@/lib/lipSync';
import type { MouthMorphKey } from '@/lib/morphTargets';
import { useAvatarStore } from '@/store/avatarStore';

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

export interface LipSyncProps {
  /** Root of the loaded GLB (only used for the morph-target strategy). */
  modelRoot?: THREE.Object3D | null;
  /** Bindings discovered by `discoverMorphTargets`. */
  mouthBindings?: Array<{ actualName: string; key: MouthMorphKey; secondaryName?: string }>;
  /** A mesh to scale as a mouth-open fallback when no morphs exist. */
  fallbackMouthMesh?: THREE.Mesh | null;
  /** A node to rotate as a jaw fallback when no morphs exist. */
  fallbackJawNode?: THREE.Object3D | null;
}

/** Viseme shape bias applied on top of the raw amplitude. */
const SHAPE_BIAS: Record<string, number> = {
  aa: 1.0,
  E: 0.88,
  I: 0.72,
  O: 0.8,
  U: 0.6,
  closed: 0.35,
};

interface BindingRef {
  name: string;
  /** Primary influence drives the jaw; secondary adds character. */
  weight: number;
  targets: Array<{ influences: number[]; index: number }>;
}

export default function LipSync({
  modelRoot,
  mouthBindings = [],
  fallbackMouthMesh,
  fallbackJawNode,
}: LipSyncProps) {
  const smoothed = useRef(0);
  // Resolved once per model so useFrame never traverses the scene graph.
  const bindingRefs = useRef<BindingRef[]>([]);
  const builtForRoot = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    bindingRefs.current = [];
    builtForRoot.current = null;
    smoothed.current = 0;
  }, [modelRoot]);

  useEffect(() => {
    if (!modelRoot || builtForRoot.current === modelRoot) return;
    if (mouthBindings.length === 0) return;

    const meshes: MorphMesh[] = [];
    modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as MorphMesh;
      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        meshes.push(mesh);
      }
    });

    const refs: BindingRef[] = [];
    for (const binding of mouthBindings) {
      // The jaw drives everything; visemes add character when present.
      const weight =
        binding.key === 'jawOpen' || binding.key === 'mouthOpen' ? 1 : 0.7;

      const targets: BindingRef['targets'] = [];
      for (const mesh of meshes) {
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;
        if (!dict || !influences) continue;

        const index = dict[binding.actualName];
        if (typeof index === 'number') targets.push({ influences, index });

        const secondary = binding.secondaryName ? dict[binding.secondaryName] : undefined;
        if (typeof secondary === 'number') {
          targets.push({ influences, index: secondary });
        }
      }

      if (targets.length > 0) refs.push({ name: binding.actualName, weight, targets });
    }

    bindingRefs.current = refs;
    builtForRoot.current = modelRoot;
  }, [modelRoot, mouthBindings]);

  useFrame((_, delta) => {
    const target = lipSyncSignal.active ? lipSyncSignal.value : 0;

    // Smooth toward the target so the mouth never jitters or snaps.
    // Frame-rate independent damping: fast when opening, slower when closing.
    const damp = lipSyncSignal.active ? 26 : 14;
    smoothed.current += (target - smoothed.current) * Math.min(1, damp * delta);
    const amount = Math.max(0, Math.min(1, smoothed.current));

    const shapeScale = SHAPE_BIAS[lipSyncSignal.shape] ?? 1;
    const openness = lipSyncSignal.active ? amount * shapeScale : 0;

    /* ---------------- Strategy A: morph targets ---------------- */
    if (bindingRefs.current.length > 0) {
      for (const ref of bindingRefs.current) {
        const weight = Math.max(0, Math.min(1, openness * ref.weight));
        for (const target of ref.targets) {
          target.influences[target.index] = weight;
        }
      }
      return;
    }

    /* ---------------- Strategy B: geometry fallback -------------- */
    if (fallbackMouthMesh) {
      // Scale on Y so the mouth opens vertically, like a real jaw.
      fallbackMouthMesh.scale.set(1 + openness * 0.12, 1 + openness * 0.85, 1);
    }
    if (fallbackJawNode) {
      fallbackJawNode.rotation.x = openness * 0.32;
    }
  });

  return null;
}

/**
 * Small helper hook for components that need the raw amplitude without
 * pulling in the whole rig (used by the status pill for subtle effects).
 */
export function useIsSpeaking(): boolean {
  const isSpeaking = useAvatarStore((s) => s.state === 'speaking');
  return isSpeaking;
}