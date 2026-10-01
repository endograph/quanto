// A stub libpostal for the fixtures and round-trip tests: libpostal's answers for each text, written the
// way libpostal gives them (lowercased, commas dropped, one `{ label, value }` per component). Text it
// has no answer for rejects, as an unreachable service would, so a fixture missing here fails loudly.

import type { LibpostalComponent } from './index';

const c = (...pairs: Array<[string, string]>): LibpostalComponent[] => pairs.map(([label, value]) => ({ label, value }));

const ANSWERS: Readonly<Record<string, readonly LibpostalComponent[]>> = {
  '1600 Amphitheatre Pkwy, Mountain View, CA 94043': c(['house_number', '1600'], ['road', 'amphitheatre pkwy'], ['city', 'mountain view'], ['state', 'ca'], ['postcode', '94043']),
  '1600 amphitheatre parkway mountain view california 94043 usa': c(['house_number', '1600'], ['road', 'amphitheatre parkway'], ['city', 'mountain view'], ['state', 'california'], ['postcode', '94043'], ['country', 'usa']),
  '1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States': c(['house_number', '1600'], ['road', 'amphitheatre pkwy'], ['city', 'mountain view'], ['state', 'ca'], ['postcode', '94043'], ['country', 'united states']),
  'Hauptstraße 5, 10115 Berlin, Deutschland': c(['road', 'hauptstraße'], ['house_number', '5'], ['postcode', '10115'], ['city', 'berlin'], ['country', 'deutschland']),
  'Hauptstraße 5, 10115 Berlin, Germany': c(['road', 'hauptstraße'], ['house_number', '5'], ['postcode', '10115'], ['city', 'berlin'], ['country', 'germany']),
  '10 Downing St, London sw1a2aa, UK': c(['house_number', '10'], ['road', 'downing st'], ['city', 'london'], ['postcode', 'sw1a2aa'], ['country', 'uk']),
  '10 Downing St, London SW1A 2AA, United Kingdom': c(['house_number', '10'], ['road', 'downing st'], ['city', 'london'], ['postcode', 'sw1a 2aa'], ['country', 'united kingdom']),
  '123 Main St Apt 4B, Springfield, IL 62701': c(['house_number', '123'], ['road', 'main st'], ['unit', 'apt 4b'], ['city', 'springfield'], ['state', 'il'], ['postcode', '62701']),
  '123 Main St, Apt 4B, Springfield, IL 62701': c(['house_number', '123'], ['road', 'main st'], ['unit', 'apt 4b'], ['city', 'springfield'], ['state', 'il'], ['postcode', '62701']),
  '350 5th Ave, New York, NY 10118-0110, United States': c(['house_number', '350'], ['road', '5th ave'], ['city', 'new york'], ['state', 'ny'], ['postcode', '10118-0110'], ['country', 'united states']),
  '350 5th Ave, New York, NY 101180110': c(['house_number', '350'], ['road', '5th ave'], ['city', 'new york'], ['state', 'ny'], ['postcode', '101180110']),
  'Empire State Building, 350 5th Ave, New York, NY 10118': c(['house', 'empire state building'], ['house_number', '350'], ['road', '5th ave'], ['city', 'new york'], ['state', 'ny'], ['postcode', '10118']),
  'PO Box 123, Toronto, ON m5v2t6, Canada': c(['po_box', 'po box 123'], ['city', 'toronto'], ['state', 'on'], ['postcode', 'm5v2t6'], ['country', 'canada']),
  'Keizersgracht 123, 1015cj Amsterdam': c(['road', 'keizersgracht'], ['house_number', '123'], ['postcode', '1015cj'], ['city', 'amsterdam']),
  '1 Rue Saint-Paul, Montréal, Québec H2Y 1G6, Canada': c(['house_number', '1'], ['road', 'rue saint-paul'], ['city', 'montréal'], ['state', 'québec'], ['postcode', 'h2y 1g6'], ['country', 'canada']),
  '1 Rue Saint-Paul, Montréal, QC H2Y 1G6, Canada': c(['house_number', '1'], ['road', 'rue saint-paul'], ['city', 'montréal'], ['state', 'qc'], ['postcode', 'h2y 1g6'], ['country', 'canada']),
  'Via del Corso 12, 00186 Roma RM, Italia': c(['road', 'via del corso'], ['house_number', '12'], ['postcode', '00186'], ['city', 'roma'], ['state', 'rm'], ['country', 'italia']),
  'Via del Corso 12, 00186 Roma RM, Italy': c(['road', 'via del corso'], ['house_number', '12'], ['postcode', '00186'], ['city', 'roma'], ['state', 'rm'], ['country', 'italy']),
  'Flat 2, 15 High St, Clifton, Bristol BS8 1AB, UK': c(['unit', 'flat 2'], ['house_number', '15'], ['road', 'high st'], ['suburb', 'clifton'], ['city', 'bristol'], ['postcode', 'bs8 1ab'], ['country', 'uk']),
  'Flat 2, 15 High St, Clifton, Bristol BS8 1AB, United Kingdom': c(['unit', 'flat 2'], ['house_number', '15'], ['road', 'high st'], ['suburb', 'clifton'], ['city', 'bristol'], ['postcode', 'bs8 1ab'], ['country', 'united kingdom']),
  '1 Main St, Burlington, Vermont 05401': c(['house_number', '1'], ['road', 'main st'], ['city', 'burlington'], ['state', 'vermont'], ['postcode', '05401']),
  '1 Main St, Springfield, IL 6270': c(['house_number', '1'], ['road', 'main st'], ['city', 'springfield'], ['state', 'il'], ['postcode', '6270']),
  'Mountain View, CA': c(['city', 'mountain view'], ['state', 'ca']),
  '1600 Amphitheatre Pkwy': c(['house_number', '1600'], ['road', 'amphitheatre pkwy']),
  '12 Main St, Springfield, Atlantis': c(['house_number', '12'], ['road', 'main st'], ['city', 'springfield'], ['country', 'atlantis']),
};

/** The stub libpostal: answers from the table above. */
export async function stub(text: string): Promise<readonly LibpostalComponent[]> {
  const answer = ANSWERS[text];
  if (!answer) throw new Error(`The stub libpostal has no answer for ${JSON.stringify(text)}. Add it to stub.ts.`);
  return answer;
}
