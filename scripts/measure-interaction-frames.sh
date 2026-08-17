#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <device-serial> <interaction-name> [capture-seconds]" >&2
  exit 2
fi

device_serial=$1
interaction_name=$2
capture_seconds=${3:-10}
application_id=${BINDER_APPLICATION_ID:-de.beko2210.binder}

if ! [[ $capture_seconds =~ ^[0-9]+$ ]] || (( capture_seconds < 1 )); then
  echo "capture-seconds must be a positive integer" >&2
  exit 2
fi

if ! adb -s "$device_serial" get-state >/dev/null 2>&1; then
  echo "Device $device_serial is not available through adb" >&2
  exit 1
fi

adb -s "$device_serial" shell dumpsys gfxinfo "$application_id" reset >/dev/null
echo "Perform '$interaction_name' on $device_serial now; capturing for ${capture_seconds}s..." >&2
sleep "$capture_seconds"
gfxinfo=$(adb -s "$device_serial" shell dumpsys gfxinfo "$application_id")

field() {
  local label=$1
  sed -nE "s/^[[:space:]]*${label}:[[:space:]]*([^[:space:]]+).*/\1/p" <<<"$gfxinfo" | head -n 1
}

total_frames=$(field "Total frames rendered")
janky_field=$(field "Janky frames")
missed_vsync=$(field "Number Missed Vsync")
p50=$(field "50th percentile")
p90=$(field "90th percentile")
p95=$(field "95th percentile")
p99=$(field "99th percentile")

if [[ -z $total_frames || -z $janky_field || -z $missed_vsync || -z $p50 || -z $p90 || -z $p95 || -z $p99 ]]; then
  echo "Could not parse gfxinfo output for $application_id" >&2
  exit 1
fi

janky_frames=${janky_field%% *}
janky_percent=$(sed -nE 's/.*\(([0-9.]+)%\).*/\1/p' <<<"$(sed -nE 's/^[[:space:]]*Janky frames:[[:space:]]*(.*)/\1/p' <<<"$gfxinfo" | head -n 1)")
if [[ -z $janky_percent ]]; then
  echo "Could not parse janky-frame percentage for $application_id" >&2
  exit 1
fi

p50=${p50%ms}
p90=${p90%ms}
p95=${p95%ms}
p99=${p99%ms}

printf '| %s | %s | %s | %s (%s%%) | %s | %s / %s / %s / %s ms |\n' \
  "$device_serial" "$interaction_name" "$total_frames" "$janky_frames" "$janky_percent" "$missed_vsync" "$p50" "$p90" "$p95" "$p99"
