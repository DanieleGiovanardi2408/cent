import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // I test sulle date devono girare in un fuso che l'ora legale ce l'ha.
    // La CI di GitHub Actions gira in UTC, che non la osserva: senza questa
    // riga i test di proprieta' sul DST campionano transizioni che nel fuso
    // della CI non avvengono, quindi passano sempre — e passano verdi per una
    // ragione diversa da quella per cui passano in locale.
    // Sta qui e non nello script npm perche' valga anche per chi lancia vitest
    // direttamente o dall'IDE. `timezone.test.ts` lo asserisce: se questa riga
    // sparisce, cade quel test con un messaggio esplicito invece di far
    // svanire in silenzio la garanzia.
    env: { TZ: 'Europe/Amsterdam' },
  },
})
