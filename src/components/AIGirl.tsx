'use client';

/**
 * AIGirl — mounts whichever avatar geometry is available.
 *
 * Order of preference:
 *  1. `public/models/girl.glb` if it exists (morph targets auto-detected).
 *  2. The procedural `<PlaceholderAvatar />`, which still blinks, breathes,
 *     tracks the camera and lip-syncs.
 *
 * A HEAD request decides once at mount whether the GLB is present, so a missing
 * file produces a clean fallback instead of a Suspense error or a crash.
 */

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

import ExpressionController from '@/components/ExpressionController';
import LipSync from '@/components/LipSync';
import PlaceholderAvatar, {
  type PlaceholderHandle,
} from '@/components/PlaceholderAvatar';
import { discoverMorphTargets, type MouthMorphKey } from '@/lib/morphTargets';
import { useAvatarStore } from '@/store/avatarStore';

const MODEL_URL = '/models/girl.glb';

/** Normalises arbitrary GLBs to roughly human scale and foot position. */
function normaliseModel(scene: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = size.y || 1;

  // Normalise to ~1.7 units tall, like a real person.
  const scale = 1.7 / height;
  scene.scale.setScalar(scale);

  // Recentre horizontally, then drop so the feet sit on y = 0.
  scene.position.x -= center.x * scale;
  scene.position.y -= box.min.y * scale;

  // Stand the model upright if it was exported lying down.
  scene.rotation.x = 0;

  return scene;
}

function ModelGirl({ onMorphsFound }: { onMorphsFound: (names: string[], mouth: MouthMorphKey[]) => void }) {
  const { scene } = useGLTF(MODEL_URL);

  // Clone so we never mutate the cached scene shared across mounts.
  const model = useMemo(() => normaliseModel(scene.clone(true)), [scene]);

  const discovery = useMemo(() => discoverMorphTargets(model), [model]);

  useEffect(() => {
    onMorphsFound(
      discovery.names,
      discovery.mouth.map((b) => b.key),
    );
    // onMorphsFound is stable (useCallback in the parent).
  }, [discovery, onMorphsFound]);

  return (
    <>
      <primitive object={model} />
      <LipSync
        modelRoot={model}
        mouthBindings={discovery.mouth}
      />
      <ExpressionController modelRoot={model} morphNames={discovery.names} />
    </>
  );
}

export interface AIGirlProps {
  /** Scale applied to the character inside the scene. */
  scale?: number;
}

export default function AIGirl({ scale = 1 }: AIGirlProps) {
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [placeholderParts, setPlaceholderParts] = useState<PlaceholderHandle | null>(null);
  const setSource = useAvatarStore((s) => s.setSource);

  // Probe for the GLB once. `null` means "still deciding".
  useEffect(() => {
    let cancelled = false;

    fetch(MODEL_URL, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        if (!cancelled) setModelAvailable(response.ok);
      })
      .catch(() => {
        // Network/404 — fall back to the placeholder rather than crashing.
        if (!cancelled) setModelAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the UI honest about which avatar is on screen.
  useEffect(() => {
    if (modelAvailable === false) {
      setSource({
        kind: 'placeholder',
        label: 'Aria · Preview look (girl.glb not found)',
        hasMorphTargets: false,
        hasMouthMorph: false,
        morphTargetNames: [],
      });
    }
  }, [modelAvailable, setSource]);

  const handleMorphsFound = useMemo(
    () => (names: string[], mouth: MouthMorphKey[]) => {
      setSource({
        kind: 'model',
        label: 'girl.glb',
        hasMorphTargets: names.length > 0,
        hasMouthMorph: mouth.length > 0,
        morphTargetNames: names,
      });
    },
    [setSource],
  );

  const handleParts = useMemo(
    () => (parts: PlaceholderHandle) => setPlaceholderParts(parts),
    [],
  );

  if (modelAvailable === null) {
    // Still probing — render nothing rather than flashing the wrong avatar.
    return null;
  }

  if (modelAvailable) {
    return <ModelGirl onMorphsFound={handleMorphsFound} />;
  }

  return (
    <>
      <PlaceholderAvatar scale={scale} onParts={handleParts} />
      <LipSync
        fallbackMouthMesh={placeholderParts?.mouthMesh ?? null}
        fallbackJawNode={placeholderParts?.jawNode ?? null}
      />
      <ExpressionController
        headGroup={placeholderParts?.headGroup ?? null}
        eyes={placeholderParts?.eyes ?? null}
        brows={placeholderParts?.brows ?? null}
        mouthFallback={placeholderParts?.mouthCurveNode ?? null}
      />
    </>
  );
}

// NOTE: we deliberately do *not* call `useGLTF.preload()` here.
// This module is imported even when girl.glb is absent, and preloading a
// missing file produces a 404 and a console error on every page load.
// <Suspense> + the HEAD probe in `AIGirl` handle loading cleanly instead.