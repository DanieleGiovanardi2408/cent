/**
 * La seconda cosa che i test prendono da Node, dichiarata a mano.
 *
 * La ragione per cui non si prende `@types/node` sta per esteso in
 * `tests/node-fs.d.ts` e vale identica: `tsconfig.json` elenca i `types` uno per
 * uno, e aggiungere `node` porterebbe `process`, `Buffer` e `__dirname` **anche
 * dentro `src`**, dove la regola e' che il dominio sia TypeScript puro.
 *
 * Chi la usa e perche': `src/core/palette.test.ts` lancia `scripts/palette.mjs`
 * — cioe' esattamente il comando che gira in CI — e ne guarda il codice di
 * uscita. Il codice sotto esame e' uno **script**, non un modulo importabile: si
 * puo' esercitare solo eseguendolo. Importarne le funzioni sarebbe una prova
 * piu' comoda su un oggetto diverso da quello che protegge l'albero.
 *
 * `spawnSync` e non `execFileSync`: il secondo **lancia** su uscita diversa da
 * zero, e qui l'uscita diversa da zero e' meta' di cio' che si sta misurando —
 * un cancello che non sa cadere non e' un cancello. La firma dichiarata e'
 * quella vera, ridotta ai soli campi che il test legge.
 */
declare module 'node:child_process' {
  export function spawnSync(
    file: string,
    args: readonly string[],
    options: { readonly encoding: 'utf8' },
  ): { readonly status: number | null; readonly stdout: string; readonly stderr: string }
}
