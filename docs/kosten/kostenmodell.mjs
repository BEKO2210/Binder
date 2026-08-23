// Was Binder pro Monat kostet, bei welcher Nutzerzahl.
//
// Jede Zahl hier ist entweder am 23.08.2026 von der Preisseite des Anbieters
// gelesen oder aus dem Code dieses Repositories gemessen. Nichts ist geschätzt,
// ohne dass danebensteht, dass es geschätzt ist — und was geschätzt ist, steht
// oben als Stellschraube, damit man es ändern und neu rechnen kann.
//
//   node docs/kosten/kostenmodell.mjs            Tabelle auf die Konsole
//   node docs/kosten/kostenmodell.mjs --csv      CSV nach docs/kosten/
//   node docs/kosten/kostenmodell.mjs --html     Seite nach docs/kosten/

// ── Preise, abgelesen am 23.08.2026 ─────────────────────────────────────────
const SUPABASE = {
  proBasis: 25,            // $/Monat, enthält $10 Compute-Guthaben (Micro)
  inklMau: 100_000,
  preisProMau: 0.00325,
  inklDatenbankGb: 8,
  preisProDatenbankGb: 0.125,
  inklSpeicherGb: 100,
  preisProSpeicherGb: 0.0213,
  inklEgressGb: 250,
  preisProEgressGb: 0.09,
  inklFunktionsaufrufe: 2_000_000,
  preisProMioAufrufe: 2,
  inklRealtimeNachrichten: 5_000_000,
  preisProMioRealtime: 2.5,
  inklRealtimeVerbindungen: 500,
  preisPro1000Verbindungen: 10,
  compute: [ // Größe → $/Monat
    ['Micro', 10], ['Small', 15], ['Medium', 60], ['Large', 110], ['XL', 210],
    ['2XL', 410], ['4XL', 960], ['8XL', 1870], ['12XL', 2800], ['16XL', 3730],
  ],
};

// EAS Update: Staffelpreise des Production-Plans.
const EAS = {
  produktionBasis: 199,
  inklMau: 50_000,
  inklBandbreiteGib: 1024,
  preisProGib: 0.10,
  mauStaffel: [
    [200_000, 0.005], [500_000, 0.00375], [1_000_000, 0.0034], [2_000_000, 0.003],
    [3_000_000, 0.0024], [6_000_000, 0.0022], [10_000_000, 0.0016], [20_000_000, 0.0014],
    [35_000_000, 0.00115], [60_000_000, 0.001], [100_000_000, 0.0009], [Infinity, 0.00085],
  ],
};

const R2 = { speicherProGb: 0.015, klasseAProMio: 4.50, klasseBProMio: 0.36, egress: 0 };

// ── Aus dem Code gemessen ───────────────────────────────────────────────────
// src/lib/images.ts: längste Kante 1080 px, WebP, Qualität 0.8.
// src/lib/media.ts: harte Obergrenze 3 MB pro Foto.
// Sechs Demo-Porträts bei 720x900 liegen zwischen 35 und 61 KB; ein echtes
// Kamerafoto in 1080x1350 hat mehr Detail. 200 KB ist der angesetzte Mittelwert
// und die wichtigste Stellschraube der ganzen Rechnung.
const FOTO_KB = 200;
// expo-audio RecordingPresets.HIGH_QUALITY: AAC, 44,1 kHz, stereo, 128 kbit/s.
// src/lib/voiceMessage.ts: höchstens 60 s.
const SPRACHE_KB_PRO_SEKUNDE = 16;
// src/lib/discovery.ts: get_discovery_batch holt 20 Kandidaten pro Runde.
// src/lib/signedUrlLifetime.ts: signierte Links leben 30 Minuten.

// ── Annahmen über Verhalten. Hier wird geschätzt, und nur hier. ─────────────
const ANNAHME = {
  kartenProTagProNutzer: 25,      // Karten im Deck, ein Foto je Karte
  profiloeffnungenProTag: 3,      // volles Profil, im Schnitt drei weitere Fotos
  fotosProProfiloeffnung: 3,
  fotosProKonto: 4,               // von sechs möglichen
  textnachrichtenProTag: 3,
  sprachnachrichtenProMonat: 6,
  sprachnachrichtLaengeS: 15,
  abhoervorgaengeProSprachnachricht: 1.2,
  gleichzeitigAmNetzAnteil: 0.025, // Spitze
  entscheidungenProTagProNutzer: 25,
  bytesProEntscheidungMitIndex: 90 * 2.5,
  grundbytesProKonto: 50 * 1024,
  monateBestand: 12,              // Datenbank wächst mit
  // Anteil der Foto-Abrufe, die dasselbe Foto ein zweites Mal holen. Das Deck
  // zeigt fremde Profile, da hilft kein Cache; die Trefferliste, der Chat und
  // das eigene Profil zeigen immer dieselben Gesichter.
  wiederholteAbrufe: 0.40,
};

const GB = 1024 * 1024; // in KB

function fotoAbrufeProMonat(nutzer) {
  const proTag = ANNAHME.kartenProTagProNutzer
    + ANNAHME.profiloeffnungenProTag * ANNAHME.fotosProProfiloeffnung;
  return nutzer * proTag * 30;
}

function egressGb(nutzer, mitBildCache) {
  const abrufe = fotoAbrufeProMonat(nutzer) * (mitBildCache ? 1 - ANNAHME.wiederholteAbrufe : 1);
  const fotos = abrufe * FOTO_KB;
  const sprache = nutzer * ANNAHME.sprachnachrichtenProMonat
    * ANNAHME.sprachnachrichtLaengeS * SPRACHE_KB_PRO_SEKUNDE
    * (1 + ANNAHME.abhoervorgaengeProSprachnachricht);
  // Text, Profile, RPC-Antworten: klein, aber nicht null.
  const rest = nutzer * 30 * 40;
  return (fotos + sprache + rest) / GB;
}

function speicherGb(nutzer) {
  const fotos = nutzer * ANNAHME.fotosProKonto * FOTO_KB;
  const sprache = nutzer * ANNAHME.sprachnachrichtenProMonat * ANNAHME.monateBestand
    * ANNAHME.sprachnachrichtLaengeS * SPRACHE_KB_PRO_SEKUNDE;
  return (fotos + sprache) / GB;
}

function datenbankGb(nutzer) {
  const proNutzer = ANNAHME.grundbytesProKonto
    + ANNAHME.entscheidungenProTagProNutzer * 30 * ANNAHME.monateBestand * ANNAHME.bytesProEntscheidungMitIndex;
  return (nutzer * proNutzer) / (1024 * 1024 * 1024);
}

function realtimeNachrichten(nutzer) {
  // Jede Nachricht erreicht zwei Seiten.
  return nutzer * ANNAHME.textnachrichtenProTag * 30 * 2;
}

function computeGroesse(nutzer) {
  // Grobe Zuordnung nach Arbeitsspeicher, nicht gemessen: eine Instanz, die
  // den Arbeitssatz hält. Ab etwa einer halben Million gehört hier ohnehin
  // eine Messung und wahrscheinlich Read Replicas hin.
  const stufen = [[2_000, 0], [10_000, 1], [50_000, 2], [150_000, 3], [400_000, 4], [800_000, 5], [2_000_000, 6], [Infinity, 7]];
  const index = stufen.find(([grenze]) => nutzer <= grenze)[1];
  return SUPABASE.compute[index];
}

function ueber(menge, inklusive) { return Math.max(0, menge - inklusive); }

function easMauKosten(nutzer) {
  let rest = ueber(nutzer, EAS.inklMau);
  let summe = 0;
  let untergrenze = EAS.inklMau;
  for (const [obergrenze, preis] of EAS.mauStaffel) {
    if (rest <= 0) break;
    const inDieserStufe = Math.min(rest, obergrenze - untergrenze);
    summe += inDieserStufe * preis;
    rest -= inDieserStufe;
    untergrenze = obergrenze;
  }
  return summe;
}

export function rechnung(nutzer, { mitBildCache = false, medienAufR2 = false } = {}) {
  const egress = egressGb(nutzer, mitBildCache);
  const speicher = speicherGb(nutzer);
  const datenbank = datenbankGb(nutzer);
  const [computeName, computePreis] = computeGroesse(nutzer);
  const verbindungen = Math.round(nutzer * ANNAHME.gleichzeitigAmNetzAnteil);

  // Was auf R2 liegt, verlässt Supabase nicht mehr: Fotos und Sprachnachrichten
  // sind der Löwenanteil des Egress und der ganze Speicher.
  const medienEgress = egress - (nutzer * 30 * 40) / GB;
  const supabaseEgress = medienAufR2 ? egress - medienEgress : egress;
  const supabaseSpeicher = medienAufR2 ? 0 : speicher;

  const posten = {
    'Supabase Pro': SUPABASE.proBasis,
    'Compute über dem Guthaben': Math.max(0, computePreis - 10),
    'Aktive Nutzer': ueber(nutzer, SUPABASE.inklMau) * SUPABASE.preisProMau,
    'Datenbank': ueber(datenbank, SUPABASE.inklDatenbankGb) * SUPABASE.preisProDatenbankGb,
    'Dateispeicher': ueber(supabaseSpeicher, SUPABASE.inklSpeicherGb) * SUPABASE.preisProSpeicherGb,
    'Datenverkehr': ueber(supabaseEgress, SUPABASE.inklEgressGb) * SUPABASE.preisProEgressGb,
    'Realtime-Nachrichten': ueber(realtimeNachrichten(nutzer), SUPABASE.inklRealtimeNachrichten) / 1e6 * SUPABASE.preisProMioRealtime,
    'Realtime-Verbindungen': ueber(verbindungen, SUPABASE.inklRealtimeVerbindungen) / 1000 * SUPABASE.preisPro1000Verbindungen,
    'Edge Functions': ueber(43_800 + nutzer * 2, SUPABASE.inklFunktionsaufrufe) / 1e6 * SUPABASE.preisProMioAufrufe,
  };
  if (medienAufR2) {
    posten['Cloudflare R2 Speicher'] = speicher * R2.speicherProGb;
    posten['Cloudflare R2 Zugriffe'] = fotoAbrufeProMonat(nutzer) * (mitBildCache ? 1 - ANNAHME.wiederholteAbrufe : 1) / 1e6 * R2.klasseBProMio;
  }
  // EAS Update ist der Weg für einen Hotfix ohne Store-Prüfung.
  posten['Expo EAS (Updates)'] = nutzer <= 1000 ? 0 : EAS.produktionBasis + easMauKosten(nutzer);

  const summe = Object.values(posten).reduce((a, b) => a + b, 0);
  return { nutzer, posten, summe, proNutzer: summe / nutzer, kennzahlen: { egressGb: egress, speicherGb: speicher, datenbankGb: datenbank, verbindungen, compute: computeName } };
}

export const STUFEN = [1_000, 10_000, 100_000, 500_000, 1_000_000, 5_000_000];
export { ANNAHME, FOTO_KB, SUPABASE, EAS, R2 };

// ── Ausgabe ─────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs';

const SZENARIEN = [
  ['Wie gebaut', {}],
  ['Mit Bild-Cache', { mitBildCache: true }],
  ['Bild-Cache + Medien auf R2', { mitBildCache: true, medienAufR2: true }],
];

function euro(dollar) { return dollar * 0.92; } // Kurs vom 23.08.2026, gerundet

if (process.argv.includes('--csv')) {
  const zeilen = [];
  const posten = Object.keys(rechnung(1_000_000).posten);
  zeilen.push(['Szenario', 'Nutzer (MAU)', ...posten, 'Summe $/Monat', 'Summe €/Monat', '$ pro Nutzer', 'Datenverkehr GB', 'Speicher GB', 'Datenbank GB', 'Realtime-Verbindungen', 'Compute'].join(','));
  for (const [name, optionen] of SZENARIEN) {
    for (const n of STUFEN) {
      const r = rechnung(n, optionen);
      zeilen.push([
        `"${name}"`, n,
        ...posten.map((p) => (r.posten[p] ?? 0).toFixed(2)),
        r.summe.toFixed(2), euro(r.summe).toFixed(2), r.proNutzer.toFixed(4),
        r.kennzahlen.egressGb.toFixed(0), r.kennzahlen.speicherGb.toFixed(0),
        r.kennzahlen.datenbankGb.toFixed(0), r.kennzahlen.verbindungen, r.kennzahlen.compute,
      ].join(','));
    }
  }
  writeFileSync('docs/kosten/binder-kosten.csv', `${zeilen.join('\n')}\n`);
  console.log('docs/kosten/binder-kosten.csv geschrieben');
}
