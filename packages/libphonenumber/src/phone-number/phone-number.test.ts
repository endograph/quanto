import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { phoneNumber } from './index';

runFixtures(phoneNumber, fixtures, { test });

const values = [
  '+14155552671',
  '+14155552671;ext=123',
  '+14165550123',
  '+18003569377',
  '+442079460958',
  '+447911123456',
  '+4930123456',
  '+33123456789',
  '+919876543210',
  '+5511987654321',
  '+81312345678',
  '+61412345678',
  '+74951234567',
  '+390669820000',
  '+80012345678',
];
for (const style of ['international', 'national'] as const) {
  for (const locale of ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'en-IN', 'pt-BR', 'ja-JP', 'en-AU', 'ru-RU', 'it-IT', 'en-AQ']) {
    roundTrip(phoneNumber({ style }), values, { test, ctx: { locale } });
  }
}
