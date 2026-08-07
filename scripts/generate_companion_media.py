#!/usr/bin/env python3
"""Render deterministic articulated companion loops from the accepted posters."""

from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("power-cat", "power-human")
STATES = ("idle", "content", "tired", "exhausted")
FRAME_COUNT = 90
FRAME_SIZE = 512
MAX_VIDEO_BYTES = 350 * 1024


@dataclass(frozen=True)
class Warp:
    kind: str
    center: tuple[float, float]
    radius: tuple[float, float]
    curve: str
    x: float = 0.0
    y: float = 0.0
    angle: float = 0.0


WARPS: dict[tuple[str, str], tuple[Warp, ...]] = {
    ("power-cat", "idle"): (
        Warp("scale", (185, 185), (108, 24), "blink", y=-0.60),
        Warp("translate", (190, 170), (150, 138), "sway", x=5.5, y=1.0),
        Warp("rotate", (190, 125), (145, 112), "sway", angle=0.018),
    ),
    ("power-cat", "content"): (
        Warp("translate", (420, 120), (82, 88), "sway", x=14.0, y=1.5),
        Warp("rotate", (390, 170), (128, 155), "sway", angle=0.080),
        Warp("translate", (255, 300), (175, 155), "pulse", y=-8.0),
        Warp("rotate", (160, 175), (132, 125), "sway", angle=0.026),
        Warp("scale", (165, 220), (78, 48), "pulse", x=0.050, y=0.080),
    ),
    ("power-cat", "tired"): (
        Warp("scale", (220, 300), (128, 140), "pant", x=0.050, y=0.045),
        Warp("translate", (190, 165), (142, 138), "pulse", y=9.0),
        Warp("rotate", (190, 165), (142, 138), "sway", angle=0.028),
    ),
    ("power-cat", "exhausted"): (
        Warp("scale", (285, 315), (160, 112), "pant", x=0.040, y=0.065),
        Warp("translate", (305, 170), (115, 108), "pant", x=1.2, y=3.5),
        Warp("rotate", (305, 170), (118, 112), "breath", angle=0.014),
    ),
    ("power-human", "idle"): (
        Warp("scale", (225, 143), (76, 18), "blink", y=-0.68),
        Warp("translate", (230, 175), (152, 155), "sway", x=7.0, y=1.2),
        Warp("rotate", (285, 225), (125, 190), "sway", angle=0.025),
    ),
    ("power-human", "content"): (
        Warp("translate", (245, 235), (135, 165), "pulse", y=-9.0),
        Warp("scale", (245, 245), (125, 145), "pulse", x=0.045, y=0.035),
        Warp("translate", (260, 170), (165, 180), "sway", x=10.0, y=1.4),
        Warp("rotate", (260, 165), (165, 180), "sway", angle=0.035),
    ),
    ("power-human", "tired"): (
        Warp("scale", (250, 230), (120, 125), "pant", x=0.050, y=0.050),
        Warp("translate", (245, 145), (145, 145), "pulse", y=10.0),
        Warp("rotate", (250, 150), (150, 150), "sway", angle=0.030),
        Warp("translate", (300, 210), (115, 175), "pant", x=4.0),
    ),
    ("power-human", "exhausted"): (
        Warp("scale", (310, 245), (125, 112), "pant", x=0.040, y=0.065),
        Warp("translate", (345, 195), (138, 150), "pant", x=5.0, y=3.0),
        Warp("rotate", (345, 190), (142, 155), "breath", angle=0.016),
    ),
}


GRID_Y, GRID_X = np.mgrid[0:FRAME_SIZE, 0:FRAME_SIZE].astype(np.float32)


def curve_value(name: str, phase: float) -> float:
    if name == "sway":
        return math.sin(2 * math.pi * phase)
    if name == "pulse":
        return math.sin(math.pi * phase) ** 2
    if name == "pant":
        return math.sin(4 * math.pi * phase)
    if name == "breath":
        return math.sin(2 * math.pi * phase)
    if name == "blink":
        return math.sin(math.pi * phase) ** 18
    raise ValueError(f"unknown curve {name!r}")


def compact_weight(center: tuple[float, float], radius: tuple[float, float]) -> np.ndarray:
    cx, cy = center
    rx, ry = radius
    distance = ((GRID_X - cx) / rx) ** 2 + ((GRID_Y - cy) / ry) ** 2
    inside = np.clip(1.0 - distance, 0.0, 1.0)
    return inside * inside * (3.0 - 2.0 * inside)


def apply_warp_field(
    source_x: np.ndarray,
    source_y: np.ndarray,
    warp: Warp,
    amount: float,
) -> None:
    if abs(amount) < 1e-9:
        return
    weight = compact_weight(warp.center, warp.radius)
    cx, cy = warp.center
    if warp.kind == "translate":
        source_x -= weight * warp.x * amount
        source_y -= weight * warp.y * amount
        return
    if warp.kind == "scale":
        scale_x = max(0.20, 1.0 + warp.x * amount)
        scale_y = max(0.20, 1.0 + warp.y * amount)
        source_x += weight * ((GRID_X - cx) / scale_x - (GRID_X - cx))
        source_y += weight * ((GRID_Y - cy) / scale_y - (GRID_Y - cy))
        return
    if warp.kind == "rotate":
        angle = warp.angle * amount
        cosine = math.cos(angle)
        sine = math.sin(angle)
        relative_x = GRID_X - cx
        relative_y = GRID_Y - cy
        rotated_x = cosine * relative_x + sine * relative_y
        rotated_y = -sine * relative_x + cosine * relative_y
        source_x += weight * (rotated_x - relative_x)
        source_y += weight * (rotated_y - relative_y)
        return
    raise ValueError(f"unknown warp kind {warp.kind!r}")


def bilinear_sample(source: np.ndarray, source_x: np.ndarray, source_y: np.ndarray) -> np.ndarray:
    source_x = np.clip(source_x, 0, FRAME_SIZE - 1)
    source_y = np.clip(source_y, 0, FRAME_SIZE - 1)
    x0 = np.floor(source_x).astype(np.int32)
    y0 = np.floor(source_y).astype(np.int32)
    x1 = np.minimum(x0 + 1, FRAME_SIZE - 1)
    y1 = np.minimum(y0 + 1, FRAME_SIZE - 1)
    x_weight = (source_x - x0)[..., None]
    y_weight = (source_y - y0)[..., None]
    top = source[y0, x0] * (1.0 - x_weight) + source[y0, x1] * x_weight
    bottom = source[y1, x0] * (1.0 - x_weight) + source[y1, x1] * x_weight
    result = top * (1.0 - y_weight) + bottom * y_weight
    return np.clip(result + 0.5, 0, 255).astype(np.uint8)


def render_frame(source: np.ndarray, warps: tuple[Warp, ...], frame_index: int) -> np.ndarray:
    phase = frame_index / (FRAME_COUNT - 1)
    amounts = [curve_value(warp.curve, phase) for warp in warps]
    if max((abs(value) for value in amounts), default=0.0) < 1e-9:
        return source.copy()
    source_x = GRID_X.copy()
    source_y = GRID_Y.copy()
    for warp, amount in zip(warps, amounts):
        apply_warp_field(source_x, source_y, warp, amount)
    return bilinear_sample(source, source_x, source_y)


def encode_frames(frames: list[np.ndarray], output: Path, crf: int) -> None:
    process = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{FRAME_SIZE}x{FRAME_SIZE}",
            "-r",
            "30",
            "-i",
            "-",
            "-frames:v",
            str(FRAME_COUNT),
            "-an",
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-level:v",
            "4.0",
            "-preset",
            "slow",
            "-crf",
            str(crf),
            "-tune",
            "animation",
            "-x264-params",
            "keyint=89:min-keyint=89:scenecut=0",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output),
        ],
        stdin=subprocess.PIPE,
    )
    assert process.stdin is not None
    for frame in frames:
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise subprocess.CalledProcessError(process.returncode, process.args)


def render_loop(character: str, state: str) -> None:
    poster = ROOT / "assets" / character / f"{state}.webp"
    output = ROOT / "assets" / character / f"{state}.mp4"
    source = np.asarray(Image.open(poster).convert("RGB"), dtype=np.uint8)
    if source.shape != (FRAME_SIZE, FRAME_SIZE, 3):
        raise ValueError(f"{poster} has unexpected shape {source.shape}")
    frames = [
        render_frame(source, WARPS[(character, state)], frame_index)
        for frame_index in range(FRAME_COUNT)
    ]
    if not np.array_equal(frames[0], frames[-1]):
        raise AssertionError(f"{character}/{state} raw endpoints differ")
    encode_frames(frames, output, crf=22)
    if output.stat().st_size > MAX_VIDEO_BYTES:
        encode_frames(frames, output, crf=24)
    if output.stat().st_size > MAX_VIDEO_BYTES:
        raise ValueError(f"{output} exceeds {MAX_VIDEO_BYTES} bytes")
    print(f"rendered {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")


def main() -> None:
    for character in CHARACTERS:
        for state in STATES:
            render_loop(character, state)


if __name__ == "__main__":
    main()
