#!/usr/bin/env python3
"""Validate companion motion loops and their poster frames."""

from __future__ import annotations

import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path


EXPECTED_STATES = ("idle", "content", "tired", "exhausted")
EXPECTED_CHARACTERS = ("power-cat", "power-human")
EXPECTED_DIMENSIONS = (512, 512)
EXPECTED_FPS = 30.0
MAX_VIDEO_BYTES = 350 * 1024
MAX_MEDIA_BYTES = 3 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]


def probe(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-of",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def eval_fraction(value: str) -> float:
    return float(Fraction(value))


def decode_five_loops(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-stream_loop",
            "4",
            "-i",
            str(path),
            "-f",
            "null",
            "-",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def validate_video(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return ["missing file"]

    try:
        info = probe(path)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return [f"ffprobe failed: {exc}"]

    streams = info.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(video_streams) != 1:
        errors.append(f"expected 1 video stream, found {len(video_streams)}")
        return errors

    stream = video_streams[0]
    if stream.get("codec_name") != "h264":
        errors.append(f"codec is {stream.get('codec_name')!r}, expected 'h264'")
    if stream.get("pix_fmt") != "yuv420p":
        errors.append(f"pixel format is {stream.get('pix_fmt')!r}, expected 'yuv420p'")
    dimensions = (int(stream.get("width", 0)), int(stream.get("height", 0)))
    if dimensions != EXPECTED_DIMENSIONS:
        errors.append(f"dimensions are {dimensions}, expected {EXPECTED_DIMENSIONS}")
    try:
        fps = eval_fraction(stream.get("avg_frame_rate", "0/1"))
    except (ValueError, ZeroDivisionError):
        fps = 0.0
    if abs(fps - EXPECTED_FPS) >= 0.01:
        errors.append(f"frame rate is {fps:.3f}, expected {EXPECTED_FPS:.2f}")
    if audio_streams:
        errors.append(f"expected no audio streams, found {len(audio_streams)}")

    try:
        duration = float(info.get("format", {}).get("duration", 0))
    except (TypeError, ValueError):
        duration = 0.0
    if not 2.0 <= duration <= 3.1:
        errors.append(f"duration is {duration:.3f}s, expected 2.0–3.1s")
    if path.stat().st_size > MAX_VIDEO_BYTES:
        errors.append(
            f"file size is {path.stat().st_size} bytes, limit is {MAX_VIDEO_BYTES} bytes"
        )

    if not errors:
        try:
            decode_five_loops(path)
        except (OSError, subprocess.CalledProcessError) as exc:
            errors.append(f"five-loop decode failed: {exc}")
    return errors


def validate_poster(path: Path) -> list[str]:
    if not path.is_file():
        return ["missing file"]
    try:
        info = probe(path)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return [f"ffprobe failed: {exc}"]

    video_streams = [
        stream for stream in info.get("streams", []) if stream.get("codec_type") == "video"
    ]
    if len(video_streams) != 1:
        return [f"expected 1 image stream, found {len(video_streams)}"]
    stream = video_streams[0]
    dimensions = (int(stream.get("width", 0)), int(stream.get("height", 0)))
    if dimensions != EXPECTED_DIMENSIONS:
        return [f"dimensions are {dimensions}, expected {EXPECTED_DIMENSIONS}"]
    if stream.get("codec_name") != "webp":
        return [f"codec is {stream.get('codec_name')!r}, expected 'webp'"]
    return []


def main() -> int:
    failures: list[str] = []
    media_paths: list[Path] = []

    for character in EXPECTED_CHARACTERS:
        for state in EXPECTED_STATES:
            video = ROOT / "assets" / character / f"{state}.mp4"
            poster = ROOT / "assets" / character / f"{state}.webp"
            media_paths.extend((video, poster))

            video_errors = validate_video(video)
            if video_errors:
                failures.extend(f"{video.relative_to(ROOT)}: {error}" for error in video_errors)
            else:
                print(f"PASS video {video.relative_to(ROOT)} (five-loop decode)")

            poster_errors = validate_poster(poster)
            if poster_errors:
                failures.extend(f"{poster.relative_to(ROOT)}: {error}" for error in poster_errors)
            else:
                print(f"PASS poster {poster.relative_to(ROOT)}")

    total_bytes = sum(path.stat().st_size for path in media_paths if path.is_file())
    if total_bytes > MAX_MEDIA_BYTES:
        failures.append(f"total media size is {total_bytes} bytes, limit is {MAX_MEDIA_BYTES} bytes")

    print(f"TOTAL media size: {total_bytes} bytes ({total_bytes / (1024 * 1024):.2f} MiB)")
    if failures:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        print(f"FAILED: {len(failures)} validation error(s)", file=sys.stderr)
        return 1

    print("PASS: 8 MP4, 8 WebP, five-loop decode for every MP4, total <= 3 MiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
