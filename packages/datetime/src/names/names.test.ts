import { roundTrip, runFixtures } from 'quanto/testing';
import { test } from 'vitest';
import { date } from '../date';
import { dateRange } from '../range';
import de from './fixtures.de.json';
import es from './fixtures.es.json';
import fr from './fixtures.fr.json';
import it from './fixtures.it.json';
import nl from './fixtures.nl.json';
import pt from './fixtures.pt.json';
import rangeEs from './fixtures.range-es.json';
import * as names from './index';

// Each name set is specified through date(), which is where names change behaviour.
runFixtures(() => date({ names: [names.es] }), es, { test });
runFixtures(() => date({ names: [names.fr] }), fr, { test });
runFixtures(() => date({ names: [names.de] }), de, { test });
runFixtures(() => date({ names: [names.it] }), it, { test });
runFixtures(() => date({ names: [names.pt] }), pt, { test });
runFixtures(() => date({ names: [names.nl] }), nl, { test });
runFixtures(() => dateRange(date({ names: [names.es] })), rangeEs, { test });

const days = ['2026-01-01', '2026-02-28', '2026-03-15', '2026-08-01', '2026-09-15', '2026-12-31'];
for (const [set, locale] of [[names.es, 'es-ES'], [names.fr, 'fr-FR'], [names.de, 'de-DE'], [names.it, 'it-IT'], [names.pt, 'pt-BR'], [names.nl, 'nl-NL']] as const) {
  roundTrip(date({ names: [set] }), days, { test, ctx: { locale } });
}
