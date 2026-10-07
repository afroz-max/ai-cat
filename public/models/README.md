# 3D character models

## Drop your character here

Place your file at **`public/models/girl.glb`**.

The app automatically detects the file at startup (via a `HEAD` request) and
swaps the procedural placeholder for your real model — no code change needed.

```
public/models/girl.glb
```

## Current status

**`girl.glb` is not in this repo yet.** Until you add it, the app runs a fully
animated **procedural placeholder avatar** built from Three.js primitives
(`src/components/PlaceholderAvatar.tsx`). The placeholder is not a stub: it
blinks, breathes, sways, tracks the camera, changes expression and lip-syncs
while speaking.

The header badge tells you which one is live:

| Badge                | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| `Placeholder avatar` | `girl.glb` not found — placeholder is rendering      |
| `Model loaded`       | `girl.glb` found and mounted                        |

## Getting the most out of your model

Lip-sync and expressions use **blend shapes (morph targets)** when your model
has them. Without them the app falls back to scaling/rotating the mouth, which
works but looks simpler.

Recommended blend-shape names (aliases are auto-detected — see
`src/lib/morphTargets.ts` for the full list):

| Purpose            | Preferred names                        |
| ------------------ | -------------------------------------- |
| Mouth / jaw        | `jawOpen`, `mouthOpen`                 |
| Visemes            | `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U` |
| Smile              | `mouthSmile`, `smile`, `happy`         |
| Brow               | `browInnerUp`, `browDown`, `browUp`    |
| Surprise           | `mouthSurprise`, `eyeWide`             |

### Free sources

- **Ready Player Me** — https://readyplayer.me (glTF with ARKit blendshapes)
- **VRM models** — note: VRM needs `@pixiv/three-vrm` to load; this app reads
  plain GLTF for now.
- **Sketchfab / CGTrader** — check the licence allows your use.

### Normalisation

Models are automatically rescaled to ~1.7 units tall and grounded on `y = 0`,
so most correctly-authored characters work without manual fixes.

## Not committing models

`public/models/*.glb` is ignored by git by default so large binaries stay out
of your history. Remove that line in `.gitignore` if you want to commit yours.