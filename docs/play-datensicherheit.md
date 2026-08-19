# Play Console: Datensicherheit und App-Inhalte

Was Binder wirklich erhebt, belegt an Schema und Code — und daraus die Antworten
für das Formular „Datensicherheit" sowie die übrigen Erklärungen unter
**App-Inhalte**. Stand: Version 1.0.0 (versionCode 97).

Grundregel: Das Formular beschreibt, was die App **tatsächlich** tut. Jede
Antwort unten hat einen Beleg. Ändert sich das Schema, ändert sich das Formular.

## 1. Was die App erhebt

| Datentyp (Play) | Erhoben | Beleg |
|---|---|---|
| Personenbezogen · Name | Ja | `profiles.first_name` |
| Personenbezogen · E-Mail-Adresse | Ja | Supabase Auth, 35 Google-, 5 E-Mail-Identitäten |
| Personenbezogen · Nutzer-IDs | Ja | `auth.users.id`, in jeder Tabelle als `user_id` |
| Personenbezogen · Sexuelle Orientierung | Ja | `profiles.gender` + `user_preferences.interested_in` |
| Personenbezogen · Politische oder religiöse Ansichten | Ja | `profiles.spirituality` (Art. 9 DSGVO, freiwillig) |
| Personenbezogen · Andere Angaben | Ja | `profiles`: `height_cm`, `smoking`, `drinking`, `drugs`, `activity`, `diet`, `children_has`, `children_wants`, `car`, `bio`, `interests`; `user_private.birth_date` |
| Standort · Genauer Standort | Ja | `user_private.location` (`geography(point,4326)`), erhoben mit `Location.Accuracy.Balanced` (`src/lib/discovery.ts:83`) |
| Fotos und Videos · Fotos | Ja | `profile_media` + privater Bucket `profile-media` |
| Audiodateien · Sprachaufnahmen | Ja | `profile_audio`, `messages.audio_path`, private Buckets `voice-media`, `profile-voice` |
| Nachrichten · Andere In-App-Nachrichten | Ja | `messages.body` |
| App-Aktivität · App-Interaktionen | Ja | Ranking-Messung (Impression, Rangposition, 10-km-Bucket, Bind/Pass) |
| App-Aktivität · Andere Aktionen | Ja | `decisions`, `blocks`, `reports` (Sicherheit) |
| App-Info und Leistung · Diagnose | Ja, **optional** | nur wenn „Beta-Diagnose" eingeschaltet ist (`src/lib/beta.ts`) |
| Geräte-IDs | Ja | `device_tokens.token` (FCM), `installation_id` |
| Finanzdaten, Gesundheitsakten, Kontakte, Kalender, SMS, Anrufliste, Browserverlauf, installierte Apps, Fitnessdaten | **Nein** | keine Berechtigung, keine Tabelle, kein SDK |

Berechtigungen im ausgelieferten Bundle (aus `Binder-v1.0.0-vc97.aab`, gemergtes
Manifest): `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`,
`READ_/WRITE_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`,
`VIBRATE`, `WAKE_LOCK`, `INTERNET`, `c2dm.RECEIVE` (FCM), Badge-Berechtigungen
der Launcher. **Keine** `CAMERA`, **keine** `SYSTEM_ALERT_WINDOW`, **keine**
`ACTIVITY_RECOGNITION` — die stehen nur im Entwicklungs-Manifest.

## 1b. Spalte für Spalte

Jede Spalte, in der Nutzerdaten landen, mit dem Play-Datentyp, unter dem sie im
Formular steht. `scripts/verify-data-safety.mjs` prüft diese Liste gegen
`src/types/database.ts` — eine neue Spalte lässt den Lauf fehlschlagen, bis hier
entschieden ist, wohin sie gehört.

| Tabelle | Spalten | Play-Datentyp |
|---|---|---|
| `profiles` | `first_name` | Personenbezogen · Name |
| `profiles` | `gender`, `interests`, `bio` | Personenbezogen · Andere Angaben (Geschlecht zusammen mit `interested_in` außerdem: sexuelle Orientierung) |
| `profiles` | `spirituality` | Personenbezogen · Politische oder religiöse Ansichten (Art. 9 DSGVO) |
| `profiles` | `height_cm`, `smoking`, `drinking`, `drugs`, `activity`, `diet`, `children_has`, `children_wants`, `car` | Personenbezogen · Andere Angaben (Lebensstil, freiwillig, feste Auswahl) |
| `user_private` | `birth_date` | Personenbezogen · Andere Angaben (Altersnachweis, wird nie an andere Nutzer gegeben) |
| `user_private` | `location` | Standort · Genauer Standort (andere sehen nur gerundete Kilometer) |
| `user_preferences` | `interested_in` | Personenbezogen · Sexuelle Orientierung |
| `user_preferences` | `min_age`, `max_age`, `max_distance_km`, `attribute_filters` | App-Aktivität · App-Einstellungen (Suchfilter, keine Angaben über die Person selbst) |
| `profile_media` | `storage_path`, `moderation_status`, `moderation_reason` | Fotos und Videos · Fotos (Pfad in den privaten Bucket, Moderationsstand) |
| `profile_audio` | `storage_path`, `duration_ms` | Audiodateien · Sprachaufnahmen |
| `messages` | `body`, `kind`, `audio_path`, `audio_duration_ms` | Nachrichten · Andere In-App-Nachrichten (Sprachnachrichten zusätzlich: Audiodateien) |
| `device_tokens` | `token`, `installation_id`, `platform` | Geräte-IDs (FCM, nur für Benachrichtigungen) |
| `reports` | `reason`, `details` | App-Aktivität · Andere Aktionen (Sicherheit, Missbrauchsbekämpfung) |
| `blocks` | `blocker_id`, `blocked_id` | App-Aktivität · Andere Aktionen |
| `decisions` | `decision`, `actor_id`, `target_id` | App-Aktivität · App-Interaktionen |
| `matches` | `user_low`, `user_high` | App-Aktivität · App-Interaktionen |
| `match_read_state` | `user_id`, `match_id` | App-Aktivität · App-Interaktionen (Gelesen-Stand) |
| `legal_acceptances` | `terms_version`, `privacy_version` | App-Aktivität · Andere Aktionen (Nachweis der Zustimmung, gesetzlich nötig) |
| `notification_preferences` | `messages`, `new_matches`, `moderation`, `safety`, `product`, `sound`, `vibration`, `quiet_hours_enabled`, `quiet_start`, `quiet_end`, `timezone`, `language` | App-Aktivität · App-Einstellungen |

`zz_chat_backup` ist eine alte Sicherungstabelle mit Nachrichtentexten. Sie
gehört gelöscht, nicht deklariert — solange sie existiert, enthält sie
personenbezogene Daten ohne Zweck.

## 2. Die Antworten je Datentyp

Für jeden oben mit „Ja" markierten Typ gilt einheitlich:

- **Erhoben:** ja. **Geteilt:** nein.
  Google (Anmeldung, FCM), Supabase (Hosting) und Brevo (Versand der
  Bestätigungsmails) verarbeiten ausschließlich im Auftrag. Das ist nach
  Play-Definition Verarbeitung, keine Weitergabe. Es gibt kein Werbe-SDK,
  kein Analytics-SDK, keinen Datenverkauf.
- **Verarbeitung flüchtig:** nein (alles wird gespeichert), außer der
  Diagnose-Kanal, wenn er ausgeschaltet bleibt.
- **Erforderlich oder optional:**
  - erforderlich: Name, E-Mail, Nutzer-ID, Geburtsdatum, Standort, Geschlecht/Interesse
  - optional: alle weiteren Profilangaben, Fotos, Sprachaufnahmen, Nachrichten, Diagnose
- **Zweck:** App-Funktionalität; zusätzlich Kontoverwaltung (E-Mail, IDs),
  Betrugsprävention und Sicherheit (`blocks`, `reports`, Moderation),
  Analysen (nur die eigene Ranking-Messung). **Nicht** Werbung, **nicht**
  Personalisierung durch Dritte.

Sicherheitspraktiken:

- **Verschlüsselte Übertragung:** ja — alle Aufrufe gehen über HTTPS, im Code
  steht kein einziges `http://`.
- **Löschung auf Anfrage:** ja — in der App unter Menü → Konto löschen
  (`src/screens/MenuScreen.tsx:99`) und über
  `https://beko2210.github.io/Binder/delete-account.html`.
- **Unabhängige Sicherheitsprüfung:** nein (nicht behaupten, was nicht passiert ist).
- **Family-Policy:** entfällt, die App ist 18+.

Zwei Punkte, die eine bewusste Entscheidung sind, keine Auslegungssache:

1. `spirituality` ist eine besondere Kategorie nach Art. 9 DSGVO. Sie ist
   freiwillig, aus einer festen Liste, jederzeit löschbar, und wird nur auf dem
   Profil gezeigt und gegen Filter geprüft. Im Formular unter „Politische oder
   religiöse Ansichten" — nicht verstecken.
2. `smoking`, `drinking`, `drugs`, `activity`, `diet` sind Lebensstil-Angaben auf
   einem Profil, keine Gesundheitsakte. Sie gehören unter „Personenbezogene
   Daten · Andere Angaben", nicht unter „Gesundheit und Fitness".

## 3. Die übrigen Erklärungen unter App-Inhalte

| Abschnitt | Antwort | Grund |
|---|---|---|
| Datenschutzerklärung | `https://beko2210.github.io/Binder/privacy.html` | live, deutsch und englisch |
| App-Zugriff | Alle Funktionen ohne besonderen Zugang verfügbar | Registrierung mit beliebiger E-Mail plus Bestätigungsmail; es gibt keine Einladung, keinen Freischaltcode |
| Anzeigen | Enthält keine Werbung | kein Werbe-SDK im Bundle |
| Inhaltseinstufung | Dating, Nutzer-Interaktion, Nutzer teilen Inhalte, ungefilterter Standort zwischen Nutzern: nein (nur gerundete Entfernung) | Fragebogen entsprechend beantworten |
| Zielgruppe | Nur 18+ | Altersprüfung beim Onboarding gegen `user_private.birth_date` |
| Datensicherheit | siehe oben | |
| Regierungs-App / Finanzfunktionen / Gesundheits-App | nein | |
| Datenlöschung | In-App und über die Website | beide Wege sind live |

**Achtung, echtes Risiko:** die Testkonten sind gelöscht. Für die Prüfung heißt
das: ein Prüfer registriert sich selbst, sieht aber einen fast leeren Stapel
(derzeit 5 Profile in der Datenbank). Wer eine App wegen „keine Inhalte" abgelehnt
bekommt, verliert eine Woche. Vor der Prüfung entweder wieder Demo-Profile
einspielen (`node scripts/stage-test-account.mjs`) oder in der Release-Notiz
erklären, dass der Stapel regional gefüllt wird.

## 4. Wie das Formular maschinell befüllt wird

Es gibt genau zwei Wege, und beide gehen über dieselbe CSV:

1. **Play Console:** App-Inhalte → Datensicherheit → *In CSV exportieren*, Datei
   ausfüllen, *Aus CSV importieren*. Der Export enthält die Frage-IDs dieser App —
   ohne ihn lässt sich keine gültige CSV schreiben.
2. **Play Developer API:** `POST /androidpublisher/v3/applications/{packageName}/dataSafety`
   mit `{"safetyLabels": "<Inhalt der CSV>"}`, Scope
   `https://www.googleapis.com/auth/androidpublisher`. Die Schnittstelle kann nur
   schreiben, nicht lesen — den aktuellen Stand liefert nur der CSV-Export.

Zugang für Weg 2: in der Google Cloud die Android Publisher API einschalten, ein
Dienstkonto samt Schlüssel anlegen und es in der Play Console unter
*Nutzer und Berechtigungen* einladen. `gcloud` allein reicht nicht — das
Nutzer-Token von `gcloud auth login` hat den Play-Scope nicht.

Was die API **nicht** kann: Inhaltseinstufung, Zielgruppe, App-Zugriff und
Datenschutz-URL bleiben Formulare in der Console.
