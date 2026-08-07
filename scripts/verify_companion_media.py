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
EXPECTED_FRAME_COUNT = 90
MAX_VIDEO_BYTES = 350 * 1024
MAX_MEDIA_BYTES = 3 * 1024 * 1024
ANALYSIS_SIZE = 128
MAX_ENDPOINT_MAD = 0.004
MIN_PEAK_MOTION_MAD = 0.003
MIN_MOVING_FRAME_RATIO = 0.35
MIN_ARTICULATION_RATIO = 1.50
MIN_FRAME_LUMA = 0.02
ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = (
    ROOT
    / ".superpowers"
    / "sdd"
    / "2026-08-07-absurd-cinematic-manga-ui"
    / "task-4-work"
    / "motion-strips"
)

# State-relevant local motion must exceed motion in a stable anatomical anchor.
# Coordinates are in the 512×512 stable asset space.
ARTICULATION_ROIS = {
    ("power-cat", "idle"): ((70, 70, 330, 265), (180, 280, 410, 480)),
    ("power-cat", "content"): ((300, 40, 500, 300), (100, 250, 390, 470)),
    ("power-cat", "tired"): ((80, 60, 320, 360), (270, 300, 460, 470)),
    ("power-cat", "exhausted"): ((150, 150, 410, 430), (30, 300, 170, 500)),
    ("power-human", "idle"): ((100, 60, 360, 350), (60, 340, 310, 500)),
    ("power-human", "content"): ((100, 30, 400, 330), (150, 330, 370, 500)),
    ("power-human", "tired"): ((100, 40, 380, 340), (200, 330, 390, 500)),
    ("power-human", "exhausted"): ((180, 90, 440, 350), (40, 300, 450, 500)),
}


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


def decode_gray_frames(path: Path) -> list[bytes]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"scale={ANALYSIS_SIZE}:{ANALYSIS_SIZE}:flags=area",
            "-pix_fmt",
            "gray",
            "-f",
            "rawvideo",
            "-",
        ],
        check=True,
        capture_output=True,
    )
    frame_bytes = ANALYSIS_SIZE * ANALYSIS_SIZE
    if len(result.stdout) % frame_bytes:
        raise ValueError("raw grayscale decode returned a partial frame")
    return [
        result.stdout[offset : offset + frame_bytes]
        for offset in range(0, len(result.stdout), frame_bytes)
    ]


def scaled_roi(roi: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return tuple(round(value * ANALYSIS_SIZE / 512) for value in roi)  # type: ignore[return-value]


def frame_mad(
    left: bytes,
    right: bytes,
    roi: tuple[int, int, int, int] | None = None,
) -> float:
    if roi is None:
        indices = range(len(left))
    else:
        x1, y1, x2, y2 = scaled_roi(roi)
        indices = (
            y * ANALYSIS_SIZE + x
            for y in range(y1, y2)
            for x in range(x1, x2)
        )
    difference = 0
    count = 0
    for index in indices:
        difference += abs(left[index] - right[index])
        count += 1
    return difference / (count * 255)


def roi_edge_energy(frame: bytes, roi: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = scaled_roi(roi)
    energy = 0
    count = 0
    for y in range(y1, y2 - 1):
        for x in range(x1, x2 - 1):
            index = y * ANALYSIS_SIZE + x
            energy += abs(frame[index] - frame[index + 1])
            energy += abs(frame[index] - frame[index + ANALYSIS_SIZE])
            count += 1
    return energy / (count * 510)


def detect_black_frames(path: Path) -> bool:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-vf",
            "blackdetect=d=0.01:pix_th=0.10:pic_th=0.98",
            "-an",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return "black_start" in result.stderr


def validate_motion(
    path: Path,
    character: str,
    state: str,
) -> tuple[list[str], dict[str, float]]:
    errors: list[str] = []
    frames = decode_gray_frames(path)
    if len(frames) != EXPECTED_FRAME_COUNT:
        return [f"decoded {len(frames)} frames, expected {EXPECTED_FRAME_COUNT}"], {}

    first = frames[0]
    endpoint_mad = frame_mad(first, frames[-1])
    peak_motion_mad = max(frame_mad(first, frame) for frame in frames[1:-1])
    adjacent_mads = [
        frame_mad(left, right) for left, right in zip(frames, frames[1:])
    ]
    moving_frame_ratio = sum(value >= 0.00008 for value in adjacent_mads) / len(
        adjacent_mads
    )
    minimum_luma = min(sum(frame) / (len(frame) * 255) for frame in frames)

    target_roi, anchor_roi = ARTICULATION_ROIS[(character, state)]
    target_motion = max(
        frame_mad(first, frame, target_roi) for frame in frames[1:-1]
    )
    anchor_motion = max(
        frame_mad(first, frame, anchor_roi) for frame in frames[1:-1]
    )
    target_normalized = target_motion / max(roi_edge_energy(first, target_roi), 0.001)
    anchor_normalized = anchor_motion / max(roi_edge_energy(first, anchor_roi), 0.001)
    articulation_ratio = target_normalized / max(anchor_normalized, 0.001)

    if endpoint_mad > MAX_ENDPOINT_MAD:
        errors.append(
            f"endpoint MAD is {endpoint_mad:.5f}, limit is {MAX_ENDPOINT_MAD:.5f}"
        )
    if peak_motion_mad < MIN_PEAK_MOTION_MAD:
        errors.append(
            f"peak motion MAD is {peak_motion_mad:.5f}, minimum is {MIN_PEAK_MOTION_MAD:.5f}"
        )
    if moving_frame_ratio < MIN_MOVING_FRAME_RATIO:
        errors.append(
            f"moving-frame ratio is {moving_frame_ratio:.3f}, minimum is {MIN_MOVING_FRAME_RATIO:.3f}"
        )
    if articulation_ratio < MIN_ARTICULATION_RATIO:
        errors.append(
            f"local articulation ratio is {articulation_ratio:.3f}, minimum is {MIN_ARTICULATION_RATIO:.3f}"
        )
    if minimum_luma < MIN_FRAME_LUMA:
        errors.append(
            f"minimum frame luma is {minimum_luma:.4f}, minimum is {MIN_FRAME_LUMA:.4f}"
        )
    if detect_black_frames(path):
        errors.append("ffmpeg blackdetect found a black frame")

    return errors, {
        "endpoint_mad": endpoint_mad,
        "peak_motion_mad": peak_motion_mad,
        "moving_frame_ratio": moving_frame_ratio,
        "articulation_ratio": articulation_ratio,
        "minimum_luma": minimum_luma,
    }


def create_motion_strip(path: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            "select='eq(n,0)+eq(n,11)+eq(n,33)+eq(n,44)+eq(n,89)',"
            "scale=256:256:flags=lanczos,tile=5x1",
            "-frames:v",
            "1",
            str(output),
        ],
        check=True,
        capture_output=True,
    )


def create_motion_contact_sheet(strips: list[Path]) -> Path:
    output = REVIEW_DIR / "motion-contact-5frame.png"
    command = ["ffmpeg", "-y", "-v", "error"]
    for strip in strips:
        command.extend(("-i", str(strip)))
    scaled = ";".join(f"[{index}:v]scale=640:128[v{index}]" for index in range(8))
    inputs = "".join(f"[v{index}]" for index in range(8))
    layout = "0_0|640_0|1280_0|1920_0|0_128|640_128|1280_128|1920_128"
    command.extend(
        (
            "-filter_complex",
            f"{scaled};{inputs}xstack=inputs=8:layout={layout}[out]",
            "-map",
            "[out]",
            "-frames:v",
            "1",
            str(output),
        )
    )
    subprocess.run(command, check=True, capture_output=True)
    return output


def validate_video(
    path: Path,
    character: str,
    state: str,
) -> tuple[list[str], dict[str, float]]:
    errors: list[str] = []
    if not path.is_file():
        return ["missing file"], {}

    try:
        info = probe(path)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return [f"ffprobe failed: {exc}"], {}

    streams = info.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(video_streams) != 1:
        errors.append(f"expected 1 video stream, found {len(video_streams)}")
        return errors, {}

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
    metrics: dict[str, float] = {}
    if not errors:
        try:
            motion_errors, metrics = validate_motion(path, character, state)
            errors.extend(motion_errors)
        except (OSError, subprocess.CalledProcessError, ValueError) as exc:
            errors.append(f"motion analysis failed: {exc}")
    return errors, metrics


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
    motion_strips: list[Path] = []

    for character in EXPECTED_CHARACTERS:
        for state in EXPECTED_STATES:
            video = ROOT / "assets" / character / f"{state}.mp4"
            poster = ROOT / "assets" / character / f"{state}.webp"
            media_paths.extend((video, poster))

            video_errors, metrics = validate_video(video, character, state)
            if video_errors:
                failures.extend(f"{video.relative_to(ROOT)}: {error}" for error in video_errors)
            else:
                print(
                    f"PASS video {video.relative_to(ROOT)} "
                    f"(five-loop decode; endpoint={metrics['endpoint_mad']:.5f}; "
                    f"motion={metrics['peak_motion_mad']:.5f}; "
                    f"moving={metrics['moving_frame_ratio']:.3f}; "
                    f"articulation={metrics['articulation_ratio']:.3f}; "
                    f"min-luma={metrics['minimum_luma']:.3f})"
                )
                strip = REVIEW_DIR / f"{character}-{state}-5frame.png"
                try:
                    create_motion_strip(video, strip)
                    motion_strips.append(strip)
                except (OSError, subprocess.CalledProcessError) as exc:
                    failures.append(
                        f"{video.relative_to(ROOT)}: motion strip generation failed: {exc}"
                    )

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

    if len(motion_strips) != 8:
        print(
            f"FAILED: generated {len(motion_strips)} motion strips, expected 8",
            file=sys.stderr,
        )
        return 1
    try:
        contact_sheet = create_motion_contact_sheet(motion_strips)
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"FAILED: motion contact sheet generation failed: {exc}", file=sys.stderr)
        return 1

    print(f"PASS motion contact sheet {contact_sheet.relative_to(ROOT)}")
    print(
        "PASS: 8 MP4, 8 WebP, five-loop decode, black/endpoints/motion/articulation, "
        "five-frame strips, total <= 3 MiB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
