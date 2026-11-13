#!/usr/bin/env python3
"""Frame Lab v1 — exhaustively analyze every decoded video frame, including subpixel local motion.
Requires: numpy + opencv-python-headless; ffprobe optional for per-frame VFR timestamps.
No frame sampling; all frames, full native resolution. Designed for bounded, isolated jobs.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path
import cv2
import numpy as np

MAX_FRAMES = int(os.getenv("FRAME_LAB_MAX_FRAMES", "12000"))
MAX_PIXELS = int(os.getenv("FRAME_LAB_MAX_PIXELS", str(3840 * 2160)))
WEBP_QUALITY = int(os.getenv("FRAME_LAB_WEBP_QUALITY", "82"))

def finite(value):
    value = float(value)
    return round(value, 5) if math.isfinite(value) else None

def save_json(path, data):
    path = Path(path)
    temp = path.with_suffix(path.suffix + ".part")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temp, path)

def timestamps(path):
    """Get actual presentation timestamps; do not assume constant frame rate when ffprobe is present."""
    try:
        process = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(path)],
            capture_output=True, text=True, timeout=80, check=True
        )
        values = json.loads(process.stdout).get("frames", [])
        return [float(x.get("best_effort_timestamp_time", 0)) for x in values]
    except (OSError, subprocess.SubprocessError, ValueError, TypeError, json.JSONDecodeError):
        return []

def safe_roi(x, y, w, h, width, height):
    x = max(0, min(width - 2, int(round(x))))
    y = max(0, min(height - 2, int(round(y))))
    w = max(2, min(width - x, int(round(w))))
    h = max(2, min(height - y, int(round(h))))
    return x, y, w, h

def phase_shift(prev, curr, rect):
    x, y, w, h = safe_roi(*rect, prev.shape[1], prev.shape[0])
    if w < 12 or h < 12:
        return 0.0, 0.0, 0.0
    p = prev[y:y+h, x:x+w].astype(np.float32)
    q = curr[y:y+h, x:x+w].astype(np.float32)
    window = cv2.createHanningWindow((w, h), cv2.CV_32F)
    try:
        (dx, dy), response = cv2.phaseCorrelate(p * window, q * window)
        if not math.isfinite(dx + dy) or response < 0.01:
            return 0.0, 0.0, 0.0
        return float(np.clip(dx, -20, 20)), float(np.clip(dy, -20, 20)), float(response)
    except cv2.error:
        return 0.0, 0.0, 0.0

def local_affine(prev, curr, rect):
    """Pyramidal Lucas-Kanade point tracks with subpixel coordinates; affine estimate per adjacent frame."""
    x, y, w, h = safe_roi(*rect, prev.shape[1], prev.shape[0])
    patch = prev[y:y+h, x:x+w]
    points = cv2.goodFeaturesToTrack(patch, maxCorners=140, qualityLevel=.005,
                                     minDistance=3, blockSize=3)
    if points is not None and len(points) >= 4:
        points = points.reshape(-1, 2).astype(np.float32)
        points += np.array([x, y], dtype=np.float32)
        nxt, status, errors = cv2.calcOpticalFlowPyrLK(
            prev, curr, points.reshape(-1, 1, 2), None, winSize=(21, 21), maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, .005))
        if nxt is not None and status is not None:
            ok = status.ravel() == 1
            old, new = points[ok], nxt.reshape(-1, 2)[ok]
            if len(old) >= 4:
                mat, inliers = cv2.estimateAffine2D(
                    old, new, method=cv2.RANSAC, ransacReprojThreshold=1.25,
                    maxIters=1200, confidence=.98)
                if mat is not None:
                    center = np.array([x + w / 2, y + h / 2, 1.], dtype=np.float64)
                    moved = mat @ center
                    ax, ay = mat[0, :2], mat[1, :2]
                    scale_x = float(np.linalg.norm(ax))
                    scale_y = float(np.linalg.norm(ay))
                    angle = math.degrees(math.atan2(float(mat[1, 0]), float(mat[0, 0])))
                    residuals = np.linalg.norm(
                        new - (old @ mat[:, :2].T + mat[:, 2]), axis=1)
                    return {
                        "dx": finite(moved[0] - center[0]), "dy": finite(moved[1] - center[1]),
                        "rotation_deg": finite(angle), "scale_x": finite(scale_x),
                        "scale_y": finite(scale_y),
                        "shear_proxy": finite(float(np.dot(ax, ay))),
                        "deformation_residual_px": finite(np.median(residuals)),
                        "features": len(old),
                        "inlier_ratio": finite(np.mean(inliers)) if inliers is not None else None,
                        "method": "lk_affine_subpixel"
                    }
    dx, dy, confidence = phase_shift(prev, curr, (x, y, w, h))
    return {"dx": finite(dx), "dy": finite(dy), "rotation_deg": None,
            "scale_x": None, "scale_y": None, "shear_proxy": None,
            "deformation_residual_px": None, "features": 0,
            "inlier_ratio": finite(confidence), "method": "phase_correlation_fallback"}

def auto_regions(flow, global_x, global_y):
    residual = flow - np.array([global_x, global_y], dtype=np.float32)
    magnitudes = cv2.magnitude(residual[:, :, 0], residual[:, :, 1])
    # Include very small motion as evidence, but eliminate isolated compression artifacts.
    nonzero = magnitudes[magnitudes > .04]
    adaptive = float(np.percentile(nonzero, 75)) if nonzero.size else .2
    threshold = max(.22, min(2.0, adaptive))
    mask = (magnitudes >= threshold).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, count):
        x, y, w, h, area = [int(v) for v in stats[i]]
        if area < 12 or w < 3 or h < 3:
            continue
        region = flow[y:y+h, x:x+w]
        selected = labels[y:y+h, x:x+w] == i
        vectors = region[selected]
        out.append({"x":x,"y":y,"w":w,"h":h,"area":area,
                    "dx":finite(np.median(vectors[:, 0])),
                    "dy":finite(np.median(vectors[:, 1])),
                    "local_motion_px":finite(np.median(np.linalg.norm(
                        vectors - np.array([global_x, global_y]), axis=1)))})
    return sorted(out, key=lambda q:q["area"], reverse=True)[:36]

def metric_motion(prev, curr):
    # Dense optical flow at native pixel resolution, on every adjacent source frame.
    flow = cv2.calcOpticalFlowFarneback(
        prev, curr, None, pyr_scale=.5, levels=4, winsize=15,
        iterations=4, poly_n=7, poly_sigma=1.5, flags=0)
    h, w = flow.shape[:2]
    # Robust median on full image approximates camera/background transform;
    # local vectors retain object motion relative to camera.
    global_x = float(np.median(flow[:, :, 0]))
    global_y = float(np.median(flow[:, :, 1]))
    res = flow - np.array([global_x, global_y], dtype=np.float32)
    residual_mag = cv2.magnitude(res[:, :, 0], res[:, :, 1])
    mag = cv2.magnitude(flow[:, :, 0], flow[:, :, 1])
    return {
        "camera_dx_px": finite(global_x),
        "camera_dy_px": finite(global_y),
        "flow_mean_px": finite(np.mean(mag)),
        "flow_p95_px": finite(np.percentile(mag, 95)),
        "residual_mean_px": finite(np.mean(residual_mag)),
        "residual_p95_px": finite(np.percentile(residual_mag, 95)),
        "subpixel_motion_fraction": finite(np.mean((mag > .04) & (mag < 1.0))),
        "regions": auto_regions(flow, global_x, global_y)
    }

def normalize_objects(objects, width, height):
    valid = []
    for i, item in enumerate(objects[:40]):
        if not isinstance(item, dict):
            continue
        try:
            rect = safe_roi(item["x"], item["y"], item["w"], item["h"], width, height)
            start = max(0, int(item.get("startFrame", 0)))
        except (KeyError, TypeError, ValueError):
            continue
        valid.append({"id": str(item.get("id", i))[:60],
                      "label": str(item.get("label", "Objeto " + str(i + 1)))[:100],
                      "startFrame": start, "rect": list(map(float, rect))})
    return valid

def track_objects(prev, curr, objects, index):
    tracks = []
    for obj in objects:
        if index <= obj["startFrame"]:
            continue
        rect = obj["rect"]
        move = local_affine(prev, curr, rect)
        dx, dy = move["dx"] or 0, move["dy"] or 0
        scale_x = move["scale_x"] if move["scale_x"] is not None else 1
        scale_y = move["scale_y"] if move["scale_y"] is not None else 1
        x, y, w, h = rect
        next_rect = safe_roi(x + dx, y + dy, w * scale_x, h * scale_y,
                             curr.shape[1], curr.shape[0])
        obj["rect"] = list(map(float, next_rect))
        px, py, pw, ph = safe_roi(*rect, prev.shape[1], prev.shape[0])
        nx, ny, nw, nh = next_rect
        old_avg = float(np.mean(prev[py:py+ph, px:px+pw]))
        new_avg = float(np.mean(curr[ny:ny+nh, nx:nx+nw]))
        move.update({"id": obj["id"], "label": obj["label"], "bbox": list(next_rect),
                     "brightness_delta": finite(new_avg - old_avg),
                     "opacity": None}) # Cannot infer alpha from composited pixels alone.
        tracks.append(move)
    return tracks

def analyze_clip(path, kind, root, rois):
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError("Could not decode " + kind + " video")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(capture.get(cv2.CAP_PROP_FPS)) or 30.0
    if not (0 < width * height <= MAX_PIXELS):
        raise RuntimeError("Video exceeds maximum allowed native resolution")
    frame_dir = root / ("frames_" + kind)
    frame_dir.mkdir(parents=True, exist_ok=True)
    pts = timestamps(path)
    objects = normalize_objects(rois, width, height) if kind == "reference" else []
    prev = None
    rows = []
    tic = time.monotonic()
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        i = len(rows)
        if i >= MAX_FRAMES:
            raise RuntimeError("Video exceeds maximum frame count: " + str(MAX_FRAMES))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if not cv2.imwrite(str(frame_dir / ("%06d.webp" % i)), frame,
                           [cv2.IMWRITE_WEBP_QUALITY, WEBP_QUALITY]):
            raise RuntimeError("Could not save frame " + str(i))
        t = pts[i] if i < len(pts) else i / fps
        entry = {"frame": i, "time_s": finite(t), "objects": []}
        if prev is not None:
            entry.update(metric_motion(prev, gray))
            entry["objects"] = track_objects(prev, gray, objects, i)
        else:
            entry.update({"camera_dx_px":0, "camera_dy_px":0,
                          "flow_mean_px":0, "flow_p95_px":0,
                          "residual_mean_px":0, "residual_p95_px":0,
                          "subpixel_motion_fraction":0, "regions":[]})
        rows.append(entry)
        prev = gray
        if i % 10 == 0:
            save_json(root / "progress.json", {"status":"processing","stage":kind,
                          "processedFrames":i+1,"elapsedSeconds":finite(time.monotonic()-tic)})
    capture.release()
    if not rows:
        raise RuntimeError("No frames decoded in " + kind)
    return {"width":width,"height":height,"fps":finite(fps),
            "frameCount":len(rows),"timestampsFromFfprobe":len(pts)>=len(rows),
            "duration_s":finite(rows[-1]["time_s"] + 1/fps),"frames":rows}

def diff_frames(root, ref, rend):
    if not rend:
        return []
    ref_frames, render_frames = ref["frames"], rend["frames"]
    times = np.array([row["time_s"] for row in render_frames])
    if len(times) == 0:
        return []
    diffdir = root / "frames_diff"
    diffdir.mkdir(exist_ok=True)
    comparison = []
    for row in ref_frames:
        i = row["frame"]
        target = row["time_s"]
        ri = int(np.searchsorted(times, target))
        ri = min(max(ri, 0), len(times)-1)
        if ri and abs(times[ri-1]-target) < abs(times[ri]-target):
            ri -= 1
        a = cv2.imread(str(root / "frames_reference" / ("%06d.webp" % i)))
        b = cv2.imread(str(root / "frames_render" / ("%06d.webp" % ri)))
        if a is None or b is None:
            continue
        if a.shape != b.shape:
            b = cv2.resize(b, (a.shape[1],a.shape[0]), interpolation=cv2.INTER_AREA)
        delta = cv2.absdiff(a,b)
        avg = float(np.mean(delta))
        heat = cv2.applyColorMap(cv2.cvtColor(delta, cv2.COLOR_BGR2GRAY), cv2.COLORMAP_TURBO)
        cv2.imwrite(str(diffdir / ("%06d.webp" % i)), heat,
                    [cv2.IMWRITE_WEBP_QUALITY, 78])
        comparison.append({"refFrame":i,"renderFrame":ri,
                           "timeDeltaMs":finite(1000*(times[ri]-target)),
                           "maeRgb":finite(avg),
                           "p95AbsDiff":finite(np.percentile(delta, 95))})
        if i % 10 == 0:
            save_json(root / "progress.json", {"status":"processing","stage":"comparison",
                        "processedFrames":i+1,"totalFrames":len(ref_frames)})
    return comparison

def run(args):
    root = Path(args.output).resolve()
    root.mkdir(parents=True, exist_ok=True)
    roi_path = root.parent / "objects.json"
    try:
        rois = json.loads(roi_path.read_text(encoding="utf-8")).get("objects", []) if roi_path.exists() else []
    except (ValueError, OSError):
        rois = []
    ref = analyze_clip(Path(args.reference), "reference", root, rois)
    rend = analyze_clip(Path(args.render), "render", root, []) if args.render else None
    compare = diff_frames(root, ref, rend)
    report = {
        "schemaVersion":"frame-lab-1.0",
        "analysisMode":"every-decoded-frame-no-sampling",
        "limitations":[
            "The source contains no captured temporal evidence between adjacent frames.",
            "Subpixel optical flow is an estimate affected by compression, texture and motion blur.",
            "Brightness changes are measured; exact alpha/opacity cannot be separated from compositing.",
            "Automatic motion regions are proposals; persistent object identities require labeled ROIs.",
            "A paired render is compared by nearest presentation timestamp; inspect timeDeltaMs."
        ],
        "reference":ref,"render":rend,"comparison":compare
    }
    save_json(root / "report.json", report)
    save_json(root / "progress.json", {"status":"completed","referenceFrames":ref["frameCount"],
               "renderFrames":rend["frameCount"] if rend else 0,
               "comparedFrames":len(compare)})
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True)
    parser.add_argument("--render")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = run(args)
        print(json.dumps({"ok":True,"frames":result["reference"]["frameCount"],
             "objects":len(result["reference"]["frames"][-1]["objects"])}))
    except Exception as exc:
        root = Path(args.output)
        root.mkdir(parents=True, exist_ok=True)
        save_json(root/"progress.json", {"status":"failed","error":str(exc)[:450]})
        print(json.dumps({"ok":False,"error":str(exc)}),file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
