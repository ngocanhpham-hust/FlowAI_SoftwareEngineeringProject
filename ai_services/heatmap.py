
import pandas as pd
import cv2
import numpy as np
import os
import sys

BASE_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        ".."
    )
)

default_trajectory_path = os.path.join(
    BASE_DIR,
    "backend",
    "outputs",
    "trajectories.csv"
)

default_processed_video_path = os.path.join(
    BASE_DIR,
    "backend",
    "public",
    "processed.mp4"
)

default_heatmap_path = os.path.join(
    BASE_DIR,
    "backend",
    "public",
    "heatmap.png"
)

TRAJECTORY_PATH = sys.argv[1] if len(sys.argv) > 1 else default_trajectory_path
PROCESSED_VIDEO_PATH = sys.argv[2] if len(sys.argv) > 2 else default_processed_video_path
HEATMAP_PATH = sys.argv[3] if len(sys.argv) > 3 else default_heatmap_path
HEATMAP_VIDEO_PATH = sys.argv[4] if len(sys.argv) > 4 else ""

os.makedirs(
    os.path.dirname(HEATMAP_PATH),
    exist_ok=True
)

if HEATMAP_VIDEO_PATH:
    os.makedirs(
        os.path.dirname(HEATMAP_VIDEO_PATH),
        exist_ok=True
    )

# =========================
# LOAD CSV
# =========================

df = pd.read_csv(
    TRAJECTORY_PATH
)

# =========================
# LOAD VIDEO FRAME
# =========================

cap = cv2.VideoCapture(
    PROCESSED_VIDEO_PATH
)

ret, frame = cap.read()

if not ret:

    print("Cannot read video")

    exit()

height, width = frame.shape[:2]
fps = cap.get(cv2.CAP_PROP_FPS)

if fps == 0:
    fps = 30

# =========================
# CREATE HEATMAP
# =========================

heatmap = np.zeros(
    (height, width),
    dtype=np.float32
)

for _, row in df.iterrows():

    x = int(row["x"])
    y = int(row["y"])

    if (
        0 <= x < width
        and 0 <= y < height
    ):

        heatmap[y, x] += 1

# =========================
# SMOOTH
# =========================

heatmap = cv2.GaussianBlur(
    heatmap,
    (101, 101),
    0
)

# =========================
# NORMALIZE
# =========================

max_value = np.max(heatmap)

if max_value > 0:
    heatmap = np.uint8(
        255 *
        heatmap /
        max_value
    )
else:
    heatmap = np.uint8(heatmap)

# =========================
# APPLY COLOR
# =========================

heatmap_color = cv2.applyColorMap(
    heatmap,
    cv2.COLORMAP_JET
)

# =========================
# OVERLAY
# =========================

overlay = cv2.addWeighted(
    frame,
    0.6,
    heatmap_color,
    0.4,
    0
)

# =========================
# SAVE
# =========================

cv2.imwrite(
    HEATMAP_PATH,
    overlay
)

if HEATMAP_VIDEO_PATH:
    points_by_frame = {}

    for _, row in df.iterrows():
        frame_index = int(row["frame"])
        points_by_frame.setdefault(frame_index, []).append((
            int(row["x"]),
            int(row["y"])
        ))

    def make_writer(output_path):
        for codec in ("avc1", "mp4v"):
            writer = cv2.VideoWriter(
                output_path,
                cv2.VideoWriter_fourcc(*codec),
                fps,
                (width, height)
            )

            if writer.isOpened():
                return writer

        return None

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    video_writer = make_writer(HEATMAP_VIDEO_PATH)

    if video_writer is None:
        print("Cannot create heatmap video")
        cap.release()
        exit()

    cumulative_heatmap = np.zeros(
        (height, width),
        dtype=np.float32
    )
    frame_index = 0

    while True:
        ret, frame = cap.read()

        if not ret:
            break

        for x, y in points_by_frame.get(frame_index, []):
            if (
                0 <= x < width
                and 0 <= y < height
            ):
                cumulative_heatmap[y, x] += 1

        blurred = cv2.GaussianBlur(
            cumulative_heatmap,
            (101, 101),
            0
        )
        max_value = np.max(blurred)

        if max_value > 0:
            normalized = np.uint8(
                255 *
                blurred /
                max_value
            )
        else:
            normalized = np.uint8(blurred)

        heatmap_color = cv2.applyColorMap(
            normalized,
            cv2.COLORMAP_JET
        )
        heatmap_frame = cv2.addWeighted(
            frame,
            0.55,
            heatmap_color,
            0.45,
            0
        )

        video_writer.write(heatmap_frame)
        frame_index += 1

    video_writer.release()

cap.release()

print("Heatmap generated")
