import * as THREE from 'three';

/**
 * Morph-target helpers.
 *
 * GLB facial rigs name their blend shapes inconsistently across DCC tools
 * (Blender ARKit-style, Reallusion, Ready Player Me, VRM…). These helpers map
 * a broad set of aliases onto a small, stable vocabulary so the rest of the app
 * never has to care about naming conventions.
 */

/** Mouth shapes we drive for lip-sync. */
export type MouthMorphKey =
  | 'jawOpen'
  | 'mouthOpen'
  | 'mouthSmile'
  | 'mouthAA'
  | 'mouthE'
  | 'mouthI'
  | 'mouthO'
  | 'mouthU';

export interface MorphBinding {
  /** The exact blend-shape name found in this model. */
  actualName: string;
  /** Stable key the app uses. */
  key: MouthMorphKey;
  /** Optional secondary name that should be driven at a reduced weight. */
  secondaryName?: string;
}

const MOUTH_ALIASES: Array<{ key: MouthMorphKey; patterns: RegExp }> = [
  { key: 'jawOpen', patterns: /^(jaw.?open|jaw.?drop|mouth.?open|aa)$/i },
  { key: 'mouthAA', patterns: /^(viseme.?aa|mouth.?aa|v.?aa|aa)$/i },
  { key: 'mouthE', patterns: /^(viseme.?e|mouth.?e|v.?e|eh)$/i },
  { key: 'mouthI', patterns: /^(viseme.?i\b|mouth.?i\b|v.?i\b|ih)$/i },
  { key: 'mouthO', patterns: /^(viseme.?o\b|mouth.?o\b|v.?o\b|oh)$/i },
  { key: 'mouthU', patterns: /^(viseme.?u\b|mouth.?u\b|v.?u\b|ou|oo|wu)$/i },
  { key: 'mouthSmile', patterns: /(mouth.?smile|smile|mouth.?up|happy)$/i },
];

/** Expression presets, mapped to whatever morphs the model actually provides. */
const EXPRESSION_MORPHS: Record<string, Array<{ pattern: RegExp; weight: number }>> = {
  neutral: [],
  happy: [
    { pattern: /(mouth.?smile|smile|happy|mouth.?up)/i, weight: 0.85 },
    { pattern: /(eye.?happy|cheek.?squint|eye.?squint|joy|expression2)/i, weight: 0.7 },
  ],
  sad: [
    { pattern: /(mouth.?sad|sad|frown|mouth.?down)/i, weight: 0.8 },
    { pattern: /(brow.?down|brow.?inner.?up|sad.?brow)/i, weight: 0.6 },
  ],
  surprised: [
    { pattern: /(mouth.?surprise|surprise|open.?mouth|oh)/i, weight: 0.8 },
    { pattern: /(brow.?up|surprise.?brow)/i, weight: 0.9 },
  ],
  thinking: [
    { pattern: /(brow.?inner.?up|think|ponder)/i, weight: 0.55 },
    { pattern: /(eye.?squint|narrow)/i, weight: 0.3 },
  ],
  excited: [
    { pattern: /(mouth.?smile|smile|happy)/i, weight: 1 },
    { pattern: /(eye.?happy|joy)/i, weight: 0.9 },
  ],
};

export interface MorphDiscovery {
  /** Every morph target name found across all meshes. */
  names: string[];
  /** Resolved mouth bindings, if any are usable for lip-sync. */
  mouth: MorphBinding[];
  /** True when at least one expressive blend shape was recognised. */
  hasExpressions: boolean;
}

/** Walks the graph and collects every morph target name on every mesh. */
export function discoverMorphTargets(root: THREE.Object3D): MorphDiscovery {
  const names: string[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child as THREE.Mesh & { morphTargetDictionary?: Record<string, number> };
    const dictionary = mesh.morphTargetDictionary;
    if (!dictionary) return;
    names.push(...Object.keys(dictionary));
  });

  const unique = Array.from(new Set(names));
  const mouth = resolveMouthBindings(unique);
  const hasExpressions = EXPRESSION_MORPH_EXPRESSION.some(([, spec]) =>
    spec.some(({ pattern }) => unique.some((name) => pattern.test(name))),
  );

  return { names: unique, mouth, hasExpressions };
}

const EXPRESSION_MORPH_EXPRESSION = Object.entries(EXPRESSION_MORPHS);

function resolveMouthBindings(names: string[]): MorphBinding[] {
  const bindings: MorphBinding[] = [];

  for (const { key, patterns } of MOUTH_ALIASES) {
    const match = names.find((name) => patterns.test(name));
    if (!match) continue;

    // Prefer a paired secondary morph when one exists, e.g. jawOpen + mouthOpen.
    let secondaryName: string | undefined;
    if (key === 'jawOpen') {
      secondaryName = names.find((name) => /mouth.?open/i.test(name) && name !== match);
    }

    bindings.push(
      secondaryName ? { actualName: match, key, secondaryName } : { actualName: match, key },
    );
  }

  return bindings;
}

/**
 * Returns `{ morphName: weight }` for a given expression, filtered to the
 * shapes this model actually has. Returns an empty object when the model has
 * no usable expressions, which tells the caller to use the animation fallback.
 */
export function buildExpressionWeights(
  expression: string,
  availableNames: string[],
): Record<string, number> {
  const spec = EXPRESSION_MORPHS[expression];
  if (!spec || availableNames.length === 0) return {};

  const weights: Record<string, number> = {};
  for (const { pattern, weight } of spec) {
    const match = availableNames.find((name) => pattern.test(name));
    if (match) weights[match] = weight;
  }
  return weights;
}

/**
 * Blends from the current expression weights to the target so the face
 * transitions smoothly instead of popping.
 */
export function lerpWeights(
  current: Record<string, number>,
  target: Record<string, number>,
  t: number,
): Record<string, number> {
  const keys = new Set([...Object.keys(current), ...Object.keys(target)]);
  const next: Record<string, number> = {};
  for (const key of keys) {
    const from = current[key] ?? 0;
    const to = target[key] ?? 0;
    next[key] = from + (to - from) * t;
  }
  return next;
}