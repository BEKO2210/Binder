#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 DEVICE_SERIAL [PAGE_COUNT]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
serial=$1
page_count=${2:-30}
[[ $page_count =~ ^[1-9][0-9]*$ ]] || usage

package=de.beko2210.binder
profile_label=${BINDER_PROFILE_LABEL:-Profile}
edit_label=${BINDER_EDIT_PROFILE_LABEL:-Profile & photos}
photo_label=${BINDER_PHOTO_LABEL:-View photo 1 in full}

adb_device=(adb -s "$serial")
"${adb_device[@]}" get-state >/dev/null

tap_label() {
  local label=$1
  local xml
  "${adb_device[@]}" shell uiautomator dump /sdcard/binder-memory.xml >/dev/null
  xml=$("${adb_device[@]}" shell cat /sdcard/binder-memory.xml)
  local center
  center=$(LABEL="$label" XML="$xml" python3 - <<'PY'
import os, re, sys
from xml.etree import ElementTree

label = os.environ['LABEL']
root = ElementTree.fromstring(os.environ['XML'])
for node in root.iter('node'):
    if label in (node.get('text'), node.get('content-desc')):
        match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
        if match:
            left, top, right, bottom = map(int, match.groups())
            print((left + right) // 2, (top + bottom) // 2)
            sys.exit(0)
sys.exit(f'Could not find visible UI label: {label}')
PY
  )
  read -r x y <<<"$center"
  "${adb_device[@]}" shell input tap "$x" "$y"
  sleep 1
}

read_meminfo() {
  local phase=$1
  local report
  report=$("${adb_device[@]}" shell dumpsys meminfo "$package")
  awk -v phase="$phase" '
    /^ *TOTAL PSS:/ { total=$3 }
    /^ *Graphics:/ { graphics=$2 }
    END {
      if (total == "" || graphics == "") exit 1
      printf "%s TOTAL_PSS_KB=%s GRAPHICS_KB=%s\n", phase, total, graphics
    }
  ' <<<"$report"
}

"${adb_device[@]}" shell am force-stop "$package"
"${adb_device[@]}" shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 2
tap_label "$profile_label"
tap_label "$edit_label"
tap_label "$photo_label"

before=$(read_meminfo before)
read -r width height < <("${adb_device[@]}" shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
# Swipe points are derived from the current display: middle 60% horizontally,
# at mid-height. This avoids device-specific coordinates while staying clear of chrome.
start_x=$((width * 80 / 100))
end_x=$((width * 20 / 100))
mid_y=$((height / 2))
for ((page = 0; page < page_count; page++)); do
  # Alternate next/previous so every gesture changes page even in a two-photo
  # gallery instead of repeatedly pushing against its final page.
  if ((page % 2 == 0)); then
    "${adb_device[@]}" shell input swipe "$start_x" "$mid_y" "$end_x" "$mid_y" 180
  else
    "${adb_device[@]}" shell input swipe "$end_x" "$mid_y" "$start_x" "$mid_y" 180
  fi
done
sleep 2
after=$(read_meminfo after)

echo "$before"
echo "$after"
awk '
  NR == 1 { split($2, p, "="); split($3, g, "="); before_pss=p[2]; before_graphics=g[2] }
  NR == 2 { split($2, p, "="); split($3, g, "="); printf "delta TOTAL_PSS_KB=%+d GRAPHICS_KB=%+d\n", p[2]-before_pss, g[2]-before_graphics }
' <<<"$before"$'\n'"$after"
