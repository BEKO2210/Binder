#!/usr/bin/env bash
# Turns raw device captures into Play-Store artwork.
#
# A screenshot straight off the phone is evidence, not a listing. The store
# page is the first thing a stranger sees, so each frame gets the brand ground,
# one sentence that says what the screen is for, and the device shot placed on a
# measured axis — the same discipline the app itself is held to.
#
#   scripts/store-frames.sh <input-dir> <output-dir>
#
# Input: PNG captures named NN-name.png. Caption text comes from a sibling file
# NN-name.txt if it exists, otherwise the file name is used.
set -euo pipefail

IN="${1:?input directory with device captures}"
OUT="${2:?output directory}"
mkdir -p "$OUT"

FONT_BOLD="$(pwd)/node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf"
FONT_BODY="$(pwd)/node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf"
[ -f "$FONT_BOLD" ] || { echo "Manrope not found — run npm install first." >&2; exit 1; }

# Play's phone screenshots: 1080x1920 minimum, 16:9. The device shot keeps its
# own aspect ratio and sits on the lower two thirds; the caption owns the top.
CANVAS_W=1080
CANVAS_H=1920
SHOT_W=860
BG_TOP="0x12141B"
BG_BOTTOM="0x090A0F"
ACCENT="0xC7FF4A"
# The system status bar and the gesture pill are the phone's, not the product's:
# a listing that shows a random battery level and three chat icons looks like a
# leaked screenshot rather than a designed page.
# Source captures are 1440x3088 on the S23; the status bar and the gesture pill
# measure about 150 and 90 pixels there.
STATUS_H=150
GESTURE_H=90
RADIUS=44
TEXT="0xF7F8F3"

for shot in "$IN"/*.png; do
  [ -e "$shot" ] || continue
  base="$(basename "${shot%.png}")"
  caption_file="$IN/$base.txt"
  if [ -f "$caption_file" ]; then
    caption="$(head -1 "$caption_file")"
    sub="$(sed -n '2p' "$caption_file")"
  else
    caption="$(echo "$base" | sed 's/^[0-9]*-//; s/-/ /g')"
    sub=""
  fi

  ffmpeg -hide_banner -loglevel error \
    -f lavfi -i "color=c=${BG_BOTTOM}:s=${CANVAS_W}x${CANVAS_H}" \
    -f lavfi -i "gradients=s=${CANVAS_W}x${CANVAS_H}:c0=${BG_TOP}:c1=${BG_BOTTOM}:x0=0:y0=0:x1=0:y1=${CANVAS_H}" \
    -i "$shot" \
    -filter_complex "\
      [1:v]format=rgba[bg]; \
      [2:v]crop=iw:ih-${STATUS_H}-${GESTURE_H}:0:${STATUS_H},scale=${SHOT_W}:-1,format=rgba, \
           pad=iw+8:ih+8:4:4:color=0x2A2F3A[shot]; \
      [bg][shot]overlay=(W-w)/2:430:format=auto[framed]; \
      [framed]drawtext=fontfile=${FONT_BOLD}:text='${caption}':fontcolor=${TEXT}:fontsize=62:x=(w-text_w)/2:y=170:line_spacing=12, \
              drawtext=fontfile=${FONT_BODY}:text='${sub}':fontcolor=0xB6BBC4:fontsize=34:x=(w-text_w)/2:y=262, \
              drawtext=fontfile=${FONT_BOLD}:text='B I N D E R':fontcolor=${ACCENT}:fontsize=30:x=(w-text_w)/2:y=92[out]" \
    -map "[out]" -frames:v 1 -y "$OUT/$base.png"
  echo "$OUT/$base.png"
done
