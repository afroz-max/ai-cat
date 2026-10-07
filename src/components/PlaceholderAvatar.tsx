'use client';

/**
 * PlaceholderAvatar — a fully procedural stand-in character.
 *
 * WHY THIS EXISTS
 * `public/models/girl.glb` is not in the repo yet. Rather than showing an empty
 * scene (or faking a "working" feature), this builds a recognisable character
 * from primitives so blinking, breathing, head motion and state reactions are
 * all genuinely functional today. Drop a GLB into `public/models/` and
 * `AIGirl` swaps to the real model automatically.
 *
 * Lip-sync is applied by `<LipSync />` via the `onParts` callback, which hands
 * over the mouth mesh and jaw node.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useAvatarStore } from '@/store/avatarStore';

/** Handles the outside rig needs to drive mouth movement. */
export interface PlaceholderHandle {
  mouthMesh: THREE.Mesh | null;
  jawNode: THREE.Object3D | null;
  headGroup: THREE.Object3D | null;
  eyes: THREE.Object3D[];
  brows: THREE.Object3D[];
  mouthCurveNode: THREE.Object3D | null;
}

export interface PlaceholderAvatarProps {
  scale?: number;
  /** Called once the internal parts exist so LipSync/Expression can bind to them. */
  onParts?: (handle: PlaceholderHandle) => void;
}

const SKIN = '#f7d2c0';
const HAIR = '#3b2418';
const HAIR_HIGHLIGHT = '#6b3f2a';
const CLOTHES = '#5b4a86';
const CLOTHES_DARK = '#3c2f5c';
const EYE_WHITE = '#ffffff';
const EYE_IRIS = '#5b3f2e';
const MOUTH_COLOR = '#c4576b';

const BLINK_DURATION = 0.14;

export default function PlaceholderAvatar({ scale = 1, onParts }: PlaceholderAvatarProps) {
  const state = useAvatarStore((s) => s.state);

  const headGroup = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const eyeLeft = useRef<THREE.Group>(null);
  const eyeRight = useRef<THREE.Group>(null);
  const lidLeft = useRef<THREE.Mesh>(null);
  const lidRight = useRef<THREE.Mesh>(null);
  const jawNode = useRef<THREE.Group>(null);
  const mouthMesh = useRef<THREE.Mesh>(null);
  const hairGroup = useRef<THREE.Group>(null);
  const browLeft = useRef<THREE.Group>(null);
  const browRight = useRef<THREE.Group>(null);
  const mouthCurveNode = useRef<THREE.Group>(null);

  // Non-reactive so the render loop can read it without re-rendering React.
  const blinkState = useRef({ next: 3.5, closing: false, openness: 1 });

  // Report our parts once mounted so LipSync / ExpressionController can bind.
  useEffect(() => {
    if (!onParts) return;
    onParts({
      mouthMesh: mouthMesh.current,
      jawNode: jawNode.current,
      headGroup: headGroup.current,
      eyes: [eyeLeft.current, eyeRight.current].filter(Boolean) as THREE.Object3D[],
      brows: [browLeft.current, browRight.current].filter(Boolean) as THREE.Object3D[],
      mouthCurveNode: mouthCurveNode.current,
    });
  }, [onParts]);

const materials = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72, metalness: 0.02 }),
      hair: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.58, metalness: 0.08 }),
      hairLight: new THREE.MeshStandardMaterial({ color: HAIR_HIGHLIGHT, roughness: 0.5 }),
      clothes: new THREE.MeshStandardMaterial({ color: CLOTHES, roughness: 0.85 }),
      clothesDark: new THREE.MeshStandardMaterial({ color: CLOTHES_DARK, roughness: 0.85 }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: EYE_WHITE, roughness: 0.25 }),
      iris: new THREE.MeshStandardMaterial({ color: EYE_IRIS, roughness: 0.3 }),
      mouth: new THREE.MeshStandardMaterial({ color: MOUTH_COLOR, roughness: 0.45 }),
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const blink = blinkState.current;

    /* ---------------- Blinking ---------------- */
    blink.next -= delta;
    if (blink.next <= 0 && !blink.closing) {
      blink.closing = true;
      blink.next = BLINK_DURATION;
    } else if (blink.closing && blink.next <= 0) {
      blink.closing = false;
      // Randomised so blinking never feels metronomic.
      blink.next = 2.4 + Math.random() * 4;
    }

    const targetOpenness = blink.closing ? 0.08 : 1;
    const rate = blink.closing ? 34 : 16;
    blink.openness += (targetOpenness - blink.openness) * Math.min(1, rate * delta);

    if (lidLeft.current) lidLeft.current.scale.y = Math.max(0.02, blink.openness);
    if (lidRight.current) lidRight.current.scale.y = Math.max(0.02, blink.openness);

    /* ---------------- Idle: breathing + sway ---------------- */
    // Amplitude rises while speaking/listening so she feels more animated.
    const energy = state === 'speaking' ? 1.35 : state === 'listening' ? 1.15 : 1;
    const breath = Math.sin(t * 1.5);
    const sway = Math.sin(t * 0.6);

    if (bodyGroup.current) {
      const breathScale = 1 + breath * 0.012 * energy;
      bodyGroup.current.scale.set(breathScale, 1 + breath * 0.018 * energy, breathScale);
      bodyGroup.current.position.y = breath * 0.012 * energy;
      bodyGroup.current.rotation.z = sway * 0.018;
    }

    if (headGroup.current) {
      const swayTarget = Math.sin(t * 0.55) * 0.16 * energy;
      const nodTarget = Math.sin(t * 0.38 + 0.8) * 0.045 * energy;
      headGroup.current.rotation.y +=
        (swayTarget - headGroup.current.rotation.y) * Math.min(1, 4 * delta);
      headGroup.current.rotation.x +=
        (nodTarget - headGroup.current.rotation.x) * Math.min(1, 4 * delta);
      headGroup.current.position.y = 0.86 + breath * 0.006 * energy;
    }

/* ---------------- State reactions ---------------- */
    if (eyeLeft.current && eyeRight.current) {
      // Wide eyes when surprised, narrowed when thinking.
      let eyeScale = blink.openness;
      if (state === 'surprised') eyeScale = 1.25;
      else if (state === 'thinking') eyeScale = 0.72;
      else if (state === 'listening') eyeScale = 1.08;

      eyeLeft.current.scale.y += (eyeScale - eyeLeft.current.scale.y) * Math.min(1, 8 * delta);
      eyeRight.current.scale.y += (eyeScale - eyeRight.current.scale.y) * Math.min(1, 8 * delta);

      // Look toward the "user" — subtle eye dart keeps her feeling present.
      const look = Math.sin(t * 0.9) * 0.12;
      eyeLeft.current.rotation.y = look;
      eyeRight.current.rotation.y = look;
    }

    // Hair gets a touch of secondary motion while talking.
    if (hairGroup.current) {
      hairGroup.current.rotation.z = Math.sin(t * 1.1 + 0.5) * 0.03 * energy;
      hairGroup.current.position.y = Math.sin(t * 1.1 + 0.5) * 0.006;
    }
  });

  return (
    <group scale={scale} position={[0, -1.15, 0]}>
      {/* -------------------- Body -------------------- */}
      <group ref={bodyGroup}>
        <mesh castShadow receiveShadow position={[0, 0.34, 0]} material={materials.clothes}>
          <capsuleGeometry args={[0.46, 0.72, 8, 24]} />
        </mesh>
        <mesh position={[0, 0.66, 0.2]} material={materials.clothesDark}>
          <torusGeometry args={[0.2, 0.05, 12, 32, Math.PI]} />
        </mesh>
        <mesh castShadow position={[0, 0.78, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.15, 0.18, 0.26, 20]} />
        </mesh>
        <mesh castShadow position={[0, 0.62, 0]} material={materials.clothes}>
          <sphereGeometry args={[0.52, 28, 20]} />
        </mesh>
      </group>

      {/* -------------------- Head -------------------- */}
      <group ref={headGroup} position={[0, 0.86, 0]}>
        <mesh position={[-0.44, -0.04, 0]} material={materials.skin}>
          <sphereGeometry args={[0.11, 16, 16]} />
        </mesh>
        <mesh position={[0.44, -0.04, 0]} material={materials.skin}>
          <sphereGeometry args={[0.11, 16, 16]} />
        </mesh>

        <mesh castShadow receiveShadow material={materials.skin}>
          <sphereGeometry args={[0.5, 48, 48]} />
        </mesh>

        {/* Jaw node — rotated by LipSync when no morph targets exist */}
        <group ref={jawNode} position={[0, -0.06, 0]}>
          {/* LipSync scales this on Y to open the mouth */}
          <mesh ref={mouthMesh} position={[0, -0.19, 0.42]} material={materials.mouth}>
            <sphereGeometry args={[0.15, 24, 24]} />
          </mesh>
        </group>

        {/* Mouth curve node — ExpressionController rotates this to fake a smile */}
        <group ref={mouthCurveNode} />

{/* -------------------- Eyes -------------------- */}
        {[
          { side: -1, eyeRef: eyeLeft, lidRef: lidLeft, browRef: browLeft },
          { side: 1, eyeRef: eyeRight, lidRef: lidRight, browRef: browRight },
        ].map(({ side, eyeRef, lidRef, browRef }) => (
          <group key={side}>
            <group ref={eyeRef} position={[0.19 * side, 0.1, 0.4]}>
              <mesh material={materials.eyeWhite}>
                <sphereGeometry args={[0.115, 24, 24]} />
              </mesh>
              {/* Iris + pupil, pushed forward so they sit inside the eye */}
              <mesh position={[0, 0, 0.095]} material={materials.iris}>
                <sphereGeometry args={[0.058, 20, 20]} />
              </mesh>
              <mesh position={[0, 0, 0.13]}>
                <sphereGeometry args={[0.028, 16, 16]} />
                <meshStandardMaterial color="#120c08" roughness={0.2} />
              </mesh>
              {/* Specular highlight — makes the eyes feel alive */}
              <mesh position={[-0.035, 0.04, 0.14]}>
                <sphereGeometry args={[0.022, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              {/* Eyelid: scaled on Y to blink */}
              <mesh ref={lidRef} position={[0, 0, 0.055]} material={materials.skin}>
                <sphereGeometry args={[0.125, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
            </group>
            {/* Eyebrow — ExpressionController tilts/raises this group */}
            <group ref={browRef} position={[0.19 * side, 0.26, 0.4]}>
              <mesh rotation={[0, 0, 0.12 * side]} material={materials.hair}>
                <boxGeometry args={[0.2, 0.035, 0.04]} />
              </mesh>
            </group>
          </group>
        ))}

        {/* -------------------- Hair -------------------- */}
        <group ref={hairGroup}>
          {/* Cap over the skull */}
          <mesh position={[0, 0.08, -0.04]} material={materials.hair}>
            <sphereGeometry args={[0.53, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          </mesh>
          {/* Side locks framing the face */}
          <mesh position={[-0.42, -0.16, 0.1]} material={materials.hair}>
            <capsuleGeometry args={[0.12, 0.62, 6, 16]} />
          </mesh>
          <mesh position={[0.42, -0.16, 0.1]} material={materials.hair}>
            <capsuleGeometry args={[0.12, 0.62, 6, 16]} />
          </mesh>
          {/* Long hair falling behind the shoulders */}
          <mesh position={[0, -0.3, -0.2]} material={materials.hair}>
            <capsuleGeometry args={[0.4, 0.85, 8, 24]} />
          </mesh>
          {/* Highlight strands */}
          <mesh position={[-0.16, 0.4, 0.06]} rotation={[0.4, 0, 0.5]} material={materials.hairLight}>
            <capsuleGeometry args={[0.045, 0.5, 4, 12]} />
          </mesh>
          <mesh position={[0.18, 0.38, 0.02]} rotation={[0.4, 0, -0.55]} material={materials.hairLight}>
            <capsuleGeometry args={[0.045, 0.5, 4, 12]} />
          </mesh>
          {/* Side parting for volume */}
          <mesh position={[0, 0.28, 0.3]} rotation={[0.3, 0, 0]} material={materials.hair}>
            <sphereGeometry args={[0.2, 20, 16]} />
          </mesh>
        </group>

        {/* Cheek blush — sells the friendly personality */}
        <mesh position={[-0.3, -0.09, 0.37]} rotation={[0, 0.3, 0]}>
          <circleGeometry args={[0.1, 20]} />
          <meshBasicMaterial color="#ff8fa3" transparent opacity={0.35} />
        </mesh>
        <mesh position={[0.3, -0.09, 0.37]} rotation={[0, -0.3, 0]}>
          <circleGeometry args={[0.1, 20]} />
          <meshBasicMaterial color="#ff8fa3" transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
}