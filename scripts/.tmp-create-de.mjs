import { readFileSync, writeFileSync } from 'node:fs';

const locale = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'));
locale.$meta = {
  name: 'German',
  endonym: 'Deutsch',
  flag: '🇩🇪',
  translatedBy: 'Binder',
  sourceOfTruth: false,
};
writeFileSync('src/i18n/locales/de.json', `${JSON.stringify(locale, null, 2)}\n`);
