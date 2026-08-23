/**
 * La sola cosa che i test prendono da Node, dichiarata a mano.
 *
 * `tests/e2e/font.ts` legge 48 KB di font dal disco: e' l'unica riga di tutto il
 * progetto che tocca il filesystem. La via normale sarebbe `@types/node`, e non
 * si prende per un motivo preciso: `tsconfig.json` elenca i `types` uno per uno,
 * quindi aggiungere `node` porterebbe `process`, `Buffer` e `__dirname` **anche
 * dentro `src`** — dove la regola e' che `src/core` sia TypeScript puro, senza
 * DOM e senza piattaforma. Un intero ambiente globale in cambio di una funzione
 * e' un cattivo scambio.
 *
 * Qui si dichiara solo cio' che si usa, con la firma vera: se un giorno servisse
 * altro da Node, si aggiunge una riga qui e si vede subito quanto Node e'
 * entrato nel progetto.
 */
declare module 'node:fs' {
  export function readFileSync(path: URL | string): {
    toString(encoding: 'base64' | 'utf8'): string
  }
}
