// Stub codecs that pin down, through fixtures, how defineCodec and defineExternalCodec treat
// alternatives and completions. No built-in codec is ambiguous yet, so these stand in. Not exported.

import { defineCodec } from '../define-codec';
import { defineExternalCodec, parseFromCompletions } from '../define-external-codec';
import type { Codec, Completion, ExternalCodec, ParseOutcome } from '../types';

export interface City {
  readonly name: string;
  readonly region: string;
}

const CITIES: readonly City[] = [
  { name: 'Springfield', region: 'IL' },
  { name: 'Springfield', region: 'MO' },
  { name: 'Springfield', region: 'MA' },
  { name: 'Portland', region: 'OR' },
  { name: 'Portland', region: 'ME' },
  { name: 'Chicago', region: 'IL' },
  { name: 'Paris', region: 'FR' },
];

const label = (city: City): string => `${city.name}, ${city.region}`;

const check = (value: unknown) => {
  const city = value as Partial<City> | null;
  return typeof city === 'object' && city !== null && typeof city.name === 'string' && typeof city.region === 'string' ? [] : [{ message: 'Expected { name, region }.' }];
};

/** `regions` keeps only those regions, through a schema, so fixtures can show the schema dropping readings. */
export interface CityOptions {
  readonly regions?: readonly string[];
}

const schemaFor = (options: CityOptions | undefined) =>
  options?.regions && {
    '~standard': {
      version: 1 as const,
      vendor: 'stub',
      validate: (value: unknown) => (options.regions!.includes((value as City).region) ? { value: value as City } : { issues: [{ message: `Not in ${options.regions!.join(', ')}.` }] }),
    },
  };

/** The cities whose name, or `name, region`, is the text, ignoring case. */
const matching = (text: string): City[] => CITIES.filter((city) => [city.name, label(city)].some((written) => written.toLowerCase() === text.toLowerCase()));

/** A sync city codec: one match is the value; several are `ambiguous`, with each as an alternative. */
export const city = (options?: CityOptions): Codec<City> =>
  defineCodec<City>({
    id: 'city',
    parse(text): ParseOutcome<City> {
      const [first, ...rest] = matching(text);
      if (!first) return { ok: false, issues: [{ code: 'unparseable', message: `No city called "${text}".` }] };
      if (rest.length === 0) return { ok: true, value: first };
      return { ok: false, issues: [{ code: 'ambiguous', message: `There are several cities called "${text}".` }], alternatives: [first, ...rest] };
    },
    format: label,
    check,
    options: { schema: schemaFor(options) },
  });

/**
 * `strict` accepts a completion only when its label is the text exactly, rather than the default (the
 * only completion), so fixtures can show a custom `accept`.
 */
export interface ExternalCityOptions extends CityOptions {
  readonly strict?: boolean;
}

/**
 * An external city codec over a stub "service" that only completes: its completions are labels that
 * fetch the city when chosen, and its parse is built with `parseFromCompletions`.
 */
export const externalCity = (options?: ExternalCityOptions): ExternalCodec<City> => {
  const complete = async (text: string): Promise<readonly Completion<City>[]> =>
    CITIES.filter((city) => label(city).toLowerCase().startsWith(text.toLowerCase())).map((city) => ({
      label: label(city),
      id: `${city.name}-${city.region}`.toLowerCase(),
      resolve: async () => city,
    }));
  const accept = options?.strict ? (completions: readonly Completion<City>[], text: string) => completions.find((c) => c.label.toLowerCase() === text.toLowerCase()) : undefined;
  return defineExternalCodec<City>({
    id: 'city',
    parse: parseFromCompletions(complete, { accept }),
    complete,
    format: label,
    check,
    options: { schema: schemaFor(options) },
  });
};
