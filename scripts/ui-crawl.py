#!/usr/bin/env python3
"""Walk the whole app on a real device and photograph every screen.

No model, no guessing: the crawler reads Android's own accessibility tree with
`uiautomator dump`, taps every clickable node it has not seen before, scrolls
every scrollable container to its end, and writes a screenshot of each distinct
screen state it reaches. Same device, same build, same result.

    python3 scripts/ui-crawl.py --serial R52W7007RHF --out artifacts/crawl-tablet
    python3 scripts/ui-crawl.py --all-devices --themes dark light

Safety: actions whose label matches DESTRUCTIVE are never tapped, so a crawl
cannot delete the account, sign out, block someone or send a message.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

PACKAGE = 'de.beko2210.binder'
ACTIVITY = f'{PACKAGE}/.MainActivity'

# Anything that would change data, end the session or contact another person.
DESTRUCTIVE = re.compile(
    r'delete|remove|sign out|log ?out|abmelden|löschen|block|report|unmatch|'
    r'send|senden|bind profile|pass profile|apply|save|speichern|enable|erlauben|'
    r'allow|reset to defaults|make primary|add photo',
    re.IGNORECASE,
)

NODE = re.compile(r'<node [^>]*/?>')
ATTR = re.compile(r'(\w[\w-]*)="([^"]*)"')
BOUNDS = re.compile(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]')


def adb_raw(serial: str, *args: str, timeout: int = 60) -> bytes:
    return subprocess.run(['adb', '-s', serial, *args], capture_output=True, timeout=timeout).stdout


def adb(serial: str, *args: str, timeout: int = 60) -> str:
    return adb_raw(serial, *args, timeout=timeout).decode('utf-8', 'replace')


@dataclass
class Node:
    text: str
    desc: str
    cls: str
    clickable: bool
    scrollable: bool
    enabled: bool
    bounds: tuple[int, int, int, int]

    @property
    def label(self) -> str:
        return (self.desc or self.text or self.cls.rsplit('.', 1)[-1]).strip()

    @property
    def centre(self) -> tuple[int, int]:
        left, top, right, bottom = self.bounds
        return (left + right) // 2, (top + bottom) // 2

    @property
    def size(self) -> tuple[int, int]:
        left, top, right, bottom = self.bounds
        return right - left, bottom - top

    @property
    def key(self) -> str:
        return f'{self.cls}|{self.label}'


@dataclass
class Screen:
    signature: str
    index: int
    label: str
    shots: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)


def parse_nodes(xml: str) -> list[Node]:
    nodes: list[Node] = []
    for raw in NODE.findall(xml):
        attrs = dict(ATTR.findall(raw))
        match = BOUNDS.search(attrs.get('bounds', ''))
        if not match:
            continue
        nodes.append(Node(
            text=attrs.get('text', ''),
            desc=attrs.get('content-desc', ''),
            cls=attrs.get('class', ''),
            clickable=attrs.get('clickable') == 'true',
            scrollable=attrs.get('scrollable') == 'true',
            enabled=attrs.get('enabled') == 'true',
            bounds=(int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))),
        ))
    return nodes


def dump(serial: str) -> str:
    for _ in range(3):
        adb(serial, 'shell', 'uiautomator', 'dump', '/sdcard/ui-crawl.xml')
        xml = adb(serial, 'shell', 'cat', '/sdcard/ui-crawl.xml')
        if '<node' in xml:
            return xml
        time.sleep(0.6)
    return ''


def signature_of(nodes: list[Node]) -> str:
    # Text and structure identify a screen; exact pixel positions do not, so a
    # scrolled list is still the same screen.
    parts = sorted({f'{n.cls}:{n.label}' for n in nodes if n.label})
    return hashlib.sha1('|'.join(parts).encode()).hexdigest()[:10]


def screen_label(nodes: list[Node]) -> str:
    for node in nodes:
        if node.text and node.bounds[1] < 700 and len(node.text) < 40:
            return node.text
    return 'screen'


def screenshot(serial: str, path: Path) -> None:
    path.write_bytes(adb_raw(serial, 'exec-out', 'screencap', '-p'))


def in_app(serial: str) -> bool:
    focus = adb(serial, 'shell', 'dumpsys', 'window')
    return PACKAGE in ''.join(line for line in focus.splitlines() if 'mCurrentFocus' in line)


def restart(serial: str) -> None:
    adb(serial, 'shell', 'am', 'force-stop', PACKAGE)
    time.sleep(1.0)
    adb(serial, 'shell', 'am', 'start', '-n', ACTIVITY)
    time.sleep(3.5)


def audit(nodes: list[Node], density: float) -> list[str]:
    """Cheap, deterministic checks on the tree Android exposes."""
    findings = []
    minimum = 44 * density
    for node in nodes:
        if not (node.clickable and node.enabled):
            continue
        width, height = node.size
        if width <= 0 or height <= 0:
            continue
        if not node.label:
            findings.append(f'unlabelled control at {node.bounds}')
        if width < minimum or height < minimum:
            findings.append(f'{node.label or node.cls}: {width / density:.0f}x{height / density:.0f} dp target')
        if any(0xE000 <= ord(character) <= 0xF8FF for character in node.label):
            findings.append(f'icon glyph inside label: {node.label!r}')
    return findings


def crawl(serial: str, out: Path, max_actions: int, max_depth: int) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    density = float(re.search(r'\d+', adb(serial, 'shell', 'wm', 'density')).group()) / 160
    screens: dict[str, Screen] = {}
    visited_actions: set[tuple[str, str]] = set()
    queue: list[list[tuple[int, int]]] = [[]]
    performed = 0

    restart(serial)

    while queue and performed < max_actions:
        path = queue.pop(0)
        if len(path) > max_depth:
            continue

        restart(serial)
        for x, y in path:
            adb(serial, 'shell', 'input', 'tap', str(x), str(y))
            time.sleep(1.4)

        xml = dump(serial)
        if not xml or not in_app(serial):
            continue
        nodes = parse_nodes(xml)
        signature = signature_of(nodes)
        screen = screens.get(signature)
        if screen is None:
            screen = Screen(signature=signature, index=len(screens), label=screen_label(nodes))
            screens[signature] = screen
            shot = out / f'{screen.index:02d}-{signature}-0.png'
            screenshot(serial, shot)
            screen.shots.append(shot.name)
            screen.findings = audit(nodes, density)
            (out / f'{screen.index:02d}-{signature}.xml').write_text(xml)

            # Scroll every scrollable container to its end so nothing below the
            # fold stays unphotographed.
            for scrollable in [n for n in nodes if n.scrollable]:
                left, top, right, bottom = scrollable.bounds
                x = (left + right) // 2
                for step in range(1, 6):
                    adb(serial, 'shell', 'input', 'swipe', str(x), str(int(bottom * 0.8)), str(x), str(int(top + (bottom - top) * 0.2)), '350')
                    time.sleep(1.0)
                    scrolled = dump(serial)
                    if not scrolled:
                        break
                    shot = out / f'{screen.index:02d}-{signature}-scroll{step}.png'
                    screenshot(serial, shot)
                    screen.shots.append(shot.name)
                    screen.findings += audit(parse_nodes(scrolled), density)
                    if signature_of(parse_nodes(scrolled)) == signature and step > 1 and scrolled == xml:
                        break
                break  # one scrollable per screen is enough; nested ones repeat

        for node in nodes:
            if not (node.clickable and node.enabled and node.label):
                continue
            if DESTRUCTIVE.search(node.label):
                screen.actions.append(f'skipped (destructive): {node.label}')
                continue
            action_key = (signature, node.key)
            if action_key in visited_actions:
                continue
            visited_actions.add(action_key)
            screen.actions.append(node.label)
            queue.append(path + [node.centre])
            performed += 1
            if performed >= max_actions:
                break

    return {
        'serial': serial,
        'density': density,
        'screens': [screen.__dict__ for screen in screens.values()],
        'actionsPerformed': performed,
    }


def write_report(out: Path, results: list[dict]) -> Path:
    rows = []
    for result in results:
        for screen in result['screens']:
            findings = ''.join(f'<li>{f}</li>' for f in sorted(set(screen['findings'])))
            shots = ''.join(f'<img src="{screen_dir(result)}/{s}" loading="lazy">' for s in screen['shots'])
            rows.append(
                f"<section><h2>{screen['index']:02d} · {screen['label']}</h2>"
                f"<p>{result['serial']} · signature {screen['signature']}</p>"
                f"<div class=shots>{shots}</div>"
                f"<details><summary>{len(screen['actions'])} controls</summary><ul>"
                + ''.join(f'<li>{a}</li>' for a in screen['actions'])
                + '</ul></details>'
                + (f'<details open><summary>{len(set(screen["findings"]))} findings</summary><ul>{findings}</ul></details>' if findings else '')
                + '</section>'
            )
    html = (
        '<meta charset="utf-8"><title>Binder UI crawl</title>'
        '<style>body{background:#090a0f;color:#f4f6f1;font:15px/1.5 system-ui;margin:0;padding:24px}'
        'section{border:1px solid #23262e;border-radius:16px;padding:16px;margin:0 0 20px}'
        'h2{margin:0 0 4px;font-size:18px}p{color:#9aa1ab;margin:0 0 12px;font-size:12px}'
        '.shots{display:flex;gap:12px;overflow-x:auto}img{height:520px;border-radius:12px;border:1px solid #23262e}'
        'li{color:#c8ccd3}summary{cursor:pointer}</style>'
        + ''.join(rows)
    )
    path = out / 'index.html'
    path.write_text(html)
    return path


def screen_dir(result: dict) -> str:
    return result['serial']


def devices() -> list[str]:
    lines = subprocess.run(['adb', 'devices'], capture_output=True, text=True).stdout.splitlines()[1:]
    return [line.split()[0] for line in lines if line.strip().endswith('device')]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--serial', action='append', help='device serial; repeatable')
    parser.add_argument('--all-devices', action='store_true')
    parser.add_argument('--out', default='artifacts/ui-crawl')
    parser.add_argument('--max-actions', type=int, default=60)
    parser.add_argument('--max-depth', type=int, default=3)
    parser.add_argument('--themes', nargs='*', choices=['dark', 'light'], default=['dark'])
    args = parser.parse_args()

    serials = args.serial or (devices() if args.all_devices else devices()[:1])
    if not serials:
        print('no device connected', file=sys.stderr)
        return 1

    out_root = Path(args.out)
    results = []
    for serial in serials:
        for theme in args.themes:
            adb(serial, 'shell', 'cmd', 'uimode', 'night', 'yes' if theme == 'dark' else 'no')
            time.sleep(2)
            target = out_root / f'{serial}-{theme}'
            print(f'crawling {serial} in {theme} mode → {target}')
            result = crawl(serial, target, args.max_actions, args.max_depth)
            result['serial'] = f'{serial}-{theme}'
            results.append(result)
        adb(serial, 'shell', 'cmd', 'uimode', 'night', 'yes')

    (out_root / 'crawl.json').write_text(json.dumps(results, indent=2))
    report = write_report(out_root, results)
    total_shots = sum(len(s['shots']) for r in results for s in r['screens'])
    total_findings = len({f for r in results for s in r['screens'] for f in s['findings']})
    print(f'{len(results)} runs · {sum(len(r["screens"]) for r in results)} screens · {total_shots} screenshots · {total_findings} findings')
    print(f'report: {report}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
