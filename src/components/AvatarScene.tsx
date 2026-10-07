'use client';

/**
 * AvatarScene — the 3D stage.
 *
 * Owns the Canvas, lighting, camera framing and the loading overlay.
 * Deliberately isolated so the character rig can evolve without touching
 * anything the rest of the UI depends on.
 */

import { ContactShadows, Float, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';

import AIGirl from '@/components/AIGirl';

/** Camera framing constants, tuned for a bust-level portrait. */
const CAMERA = { position: [0, 0.35, 3.1] as const, fov: 32 };

function SceneContents() {
  return (
    <>
      {/* ---------------- Lighting ---------------- */}
      {/* Key light: the main modelling light, slightly above and to the left. */}
      <directionalLight position={[2.5, 4, 3]} intensity={2.1} color="#fff4e8" castShadow />
      {/* Fill light from the opposite side keeps shadows soft. */}
      <directionalLight position={[-3, 2, 2]} intensity={0.75} color="#c9d6ff" />
      {/* Warm rim light separates her from the dark background. */}
      <directionalLight position={[-1.5, 2.5, -3]} intensity={1.5} color="#a78bfa" />
      {/* Soft point light behind the shoulders for a silhouette glow. */}
      <pointLight position={[0, 1.6, -2.2]} intensity={14} distance={9} decay={2} color="#7c3aed" />
      {/* Ambient bounce so nothing goes fully black. */}
      <ambientLight intensity={0.45} color="#8ea0d0" />
      <hemisphereLight args={['#9db4ff', '#2a1b4d', 0.5]} />

      {/* ---------------- Character ---------------- */}
      <Float speed={1.1} rotationIntensity={0.06} floatIntensity={0.22} floatingRange={[-0.05, 0.05]}>
        <group position={[0, -0.95, 0]}>
          <Suspense fallback={null}>
            <AIGirl scale={1} />
          </Suspense>
        </group>
      </Float>

      {/* Contact shadow grounds her instead of floating in the void. */}
      <ContactShadows
        position={[0, -1.9, 0]}
        opacity={0.42}
        scale={7}
        blur={2.6}
        far={3}
        resolution={512}
        color="#1a0f3a"
      />

      {/* Warm up the GPU with every material variant before first interaction. */}
      <Preload all />
    </>
  );
}

export default function AvatarScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      className="h-full w-full"
      aria-label="3D AI character"
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
          3D rendering is not available in this browser.
        </div>
      }
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}