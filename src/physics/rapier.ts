import type * as RapierNS from '@dimforge/rapier3d-compat';

export type RapierModule = typeof RapierNS;

let module: RapierModule | null = null;

/**
 * Rapier ships its WASM inline as base64, which makes the chunk heavy. We only
 * pull it in once the child has pressed MULAI, so the first paint stays instant.
 */
export async function loadRapier(): Promise<RapierModule> {
  if (module) return module;
  const imported = (await import('@dimforge/rapier3d-compat')) as RapierModule;
  await imported.init();
  module = imported;
  return module;
}

export function rapier(): RapierModule {
  if (!module) throw new Error('Rapier belum dimuat. Panggil loadRapier() dulu.');
  return module;
}
