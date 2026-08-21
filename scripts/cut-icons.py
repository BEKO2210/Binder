#!/usr/bin/env python3
"""Sechs Verbots-Icons freistellen — Kachel plus Leuchtschein, transparent.

Vorgabe von Kimi, hier umgesetzt:

  1. Die Kante wird nicht ueber Helligkeit gefunden, sondern ueber den
     Gruen-Ueberschuss  S = G - max(R, B).  Der limettene Rand und sein Schein
     haben hohes S, das rote Verbotszeichen negatives, Schwarz liegt bei null.
     Vorher ein Weichzeichner, sonst zittert die gefundene Kante im Schein.
  2. Geschnitten wird nicht an der harten Kachelkante, sondern dort, wo der
     Schein auslaeuft, plus Puffer.  Wer am sichtbaren Rand schneidet, bekommt
     auf dunkelgrauem Grund einen schwarzen Ring um das Icon.
  3. Die Ecken werden als Superellipse (n = 4.5) maskiert, nicht als
     Kreisbogen — das trifft die Rundung solcher Glaskacheln.  Vierfach
     ueberabgetastet, sonst Treppchen.
  4. Ausgabe als PNG mit Alphakanal in 512, 256 und 128 px.

Aufruf:  python3 scripts/cut-icons.py site/media/icons-roh site/media/icons
"""
import sys
from pathlib import Path

import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Wieviel Schein stehen bleibt, als Anteil der Kachelbreite. Weniger sieht
# abgeschnitten aus, mehr macht das Icon im Laufband optisch kleiner als seine
# Nachbarn.
GLOW_PUFFER = 0.08
ECKEN_ANTEIL = 0.20          # Radius als Anteil der Kantenlaenge
SUPERELLIPSE_N = 4.5
GROESSEN = (512, 256, 128)
UEBERABTASTUNG = 4

# Reihenfolge und Namen kommen aus dem Laufband der Startseite. Die Zuordnung
# steht hier, damit sie an einer Stelle nachlesbar ist statt in Dateinamen.
BANNER = {
    "paywall": "NO PAYWALL",
    "blurred-likes": "NO BLURRED LIKES",
    "boosts": "NO BOOSTS",
    "ads": "NO ADS",
    "trackers": "NO TRACKERS",
    "mutual-only": "MUTUAL ONLY",
}


def gruen_ueberschuss(bild):
    """S = G - max(R, B). Der limettene Rand hat hohes S, das rote Verbotszeichen
    faellt weg, Schwarz liegt bei null. Kanalweise, ohne Schleife ueber
    anderthalb Millionen Bildpunkte."""
    weich = bild.convert("RGB").filter(ImageFilter.GaussianBlur(2))
    r, g, b = weich.split()
    return ImageChops.subtract(g, ImageChops.lighter(r, b))


def kachel_kasten(bild):
    """Die harte Kachelkante finden, nicht den Schein.

    Der Schwellwert ist relativ zum Bild (70 Prozent des groessten
    Gruen-Ueberschusses), weil die sechs Bilder unterschiedlich hell abgemischt
    sind. Die Breite ist verlaesslich: links und rechts liegt nur Rand. Nach
    unten strahlt ein Leuchtbalken ueber die Kachel hinaus, deshalb wird die
    Hoehe nicht gemessen, sondern aus Breite und Oberkante gebildet — sonst
    sitzt die Kachel im Ausschnitt zu hoch."""
    karte = gruen_ueberschuss(bild)
    hoechster = karte.getextrema()[1]
    kante = karte.point(lambda v: 255 if v > hoechster * 0.7 else 0)
    kasten = kante.getbbox()
    if kasten is None or hoechster < 8:
        raise SystemExit("Kein limettener Rand gefunden — ist das das richtige Bild?")
    links, oben, rechts, _unten = kasten
    seite = rechts - links
    return (links, oben, rechts, oben + seite)


def quadrat_mit_puffer(kasten, groesse):
    links, oben, rechts, unten = kasten
    seite = max(rechts - links, unten - oben)
    puffer = int(seite * GLOW_PUFFER)
    mitte_x = (links + rechts) // 2
    mitte_y = (oben + unten) // 2
    halb = seite // 2 + puffer
    return (
        max(0, mitte_x - halb),
        max(0, mitte_y - halb),
        min(groesse[0], mitte_x + halb),
        min(groesse[1], mitte_y + halb),
    ), seite


def superellipse_maske(seite, anteil):
    """Superellipse statt Kreisbogen — das trifft die Rundung solcher
    Glaskacheln. Vierfach ueberabgetastet, sonst Treppchen."""
    gross = int(seite * UEBERABTASTUNG)
    maske = Image.new("L", (gross, gross), 0)
    zeichner = ImageDraw.Draw(maske)
    punkte = []
    a = gross / 2
    n = 2 / (SUPERELLIPSE_N * (anteil / ECKEN_ANTEIL))
    for i in range(1440):
        t = i * math.tau / 1440
        ct, st = math.cos(t), math.sin(t)
        x = a * (abs(ct) ** n) * (1 if ct >= 0 else -1)
        y = a * (abs(st) ** n) * (1 if st >= 0 else -1)
        punkte.append((a + x, a + y))
    zeichner.polygon(punkte, fill=255)
    return maske.resize((seite, seite), Image.Resampling.LANCZOS)


def alphakanal(ausschnitt, kachel_seite):
    """Die Kachel deckt voll, der Schein blendet aus.

    Eine harte Maske am sichtbaren Rand waere der uebliche Fehler: auf Schwarz
    faellt nichts auf, auf der dunkelgrauen Karte steht dann ein schwarzer Ring
    um das Icon. Deshalb ist die Kachel selbst deckend maskiert, und der Ring
    darum bekommt sein Alpha aus der eigenen Helligkeit — der Schein laeuft aus,
    wie er es auf schwarzem Grund auch tut."""
    seite = ausschnitt.size[0]
    kachel = superellipse_maske(kachel_seite, ECKEN_ANTEIL)
    innen = Image.new("L", (seite, seite), 0)
    rand = (seite - kachel_seite) // 2
    innen.paste(kachel, (rand, rand))

    helligkeit = ausschnitt.convert("L").filter(ImageFilter.GaussianBlur(2))
    # Schwacher Schein soll sichtbar bleiben, echtes Schwarz verschwinden.
    schein = helligkeit.point(lambda v: min(255, max(0, (v - 4) * 7)))
    return ImageChops.lighter(innen, schein).filter(ImageFilter.GaussianBlur(0.8))


def freistellen(pfad, ziel_ordner):
    bild = Image.open(pfad).convert("RGB")
    kasten, kachel_seite = quadrat_mit_puffer(kachel_kasten(bild), bild.size)
    ausschnitt = bild.crop(kasten)
    seite = min(ausschnitt.size)
    ausschnitt = ausschnitt.resize((seite, seite), Image.Resampling.LANCZOS)
    mit_alpha = ausschnitt.convert("RGBA")
    mit_alpha.putalpha(alphakanal(ausschnitt, int(kachel_seite * seite / max(kasten[2] - kasten[0], 1))))
    name = Path(pfad).stem
    for groesse in GROESSEN:
        # Maske sitzt auf voller Aufloesung, erst danach verkleinern.
        klein = mit_alpha.resize((groesse, groesse), Image.Resampling.LANCZOS)
        ziel = ziel_ordner / f"{name}-{groesse}.png"
        klein.save(ziel, "PNG", optimize=True)
        print(f"{ziel}  ({groesse}x{groesse})")


def main():
    quelle = Path(sys.argv[1] if len(sys.argv) > 1 else "site/media/icons-roh")
    ziel = Path(sys.argv[2] if len(sys.argv) > 2 else "site/media/icons")
    ziel.mkdir(parents=True, exist_ok=True)
    bilder = sorted(p for p in quelle.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not bilder:
        raise SystemExit(f"Keine Bilder in {quelle}. Lege die sechs Rohbilder dort ab.")
    for pfad in bilder:
        freistellen(pfad, ziel)
    print(f"\n{len(bilder)} Icons freigestellt. Namen fuer die Zuordnung: {', '.join(BANNER)}")


if __name__ == "__main__":
    main()
