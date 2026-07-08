#!/usr/bin/env python3
"""Subject-tracking reframe analysis for the Clipr render worker.

Invocation: python3 remotion/reframe.py <videoPath> <startSec> <endSec>

Samples ~3 frames/sec across [startSec, endSec], finds the largest frontal
face per frame via OpenCV's Haar cascade, records the face-center X normalized
0..1, EMA-smooths the series, and emits a single line of JSON describing a
smoothed pan track (keyframes relative to startSec).

Robustness: never raises. On any failure prints a single JSON line with
ok:false and exits 0.
"""
import sys
import json


def emit_error(err_type, msg):
    print(json.dumps({"ok": False, "error": "%s: %s" % (err_type, str(msg)[:120])}))
    sys.exit(0)


def main():
    try:
        if len(sys.argv) < 4:
            emit_error("ArgError", "usage: reframe.py <videoPath> <startSec> <endSec>")
        video_path = sys.argv[1]
        start_sec = float(sys.argv[2])
        end_sec = float(sys.argv[3])
    except Exception as e:  # noqa: BLE001
        emit_error(type(e).__name__, e)
        return

    try:
        import cv2  # noqa: F401
    except Exception as e:  # noqa: BLE001
        emit_error(type(e).__name__, "opencv import failed: %s" % e)
        return

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap or not cap.isOpened():
            emit_error("OpenError", "cannot open video: %s" % video_path)
            return

        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0 or fps != fps:  # guard 0/NaN
            fps = 30.0
        src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        if end_sec <= start_sec:
            end_sec = start_sec  # degenerate window -> single sample

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            cap.release()
            emit_error("CascadeError", "failed to load haar cascade")
            return

        # Sample ~3 frames per second across the window.
        sample_rate = 3.0
        window = max(0.0, end_sec - start_sec)
        n_samples = int(round(window * sample_rate)) + 1
        if n_samples < 1:
            n_samples = 1

        raw = []  # list of (t_rel, cx)
        last_cx = 0.5
        for i in range(n_samples):
            if n_samples == 1:
                t_rel = 0.0
            else:
                t_rel = window * (i / float(n_samples - 1))
            t_abs = start_sec + t_rel
            cap.set(cv2.CAP_PROP_POS_MSEC, t_abs * 1000.0)
            ok, frame = cap.read()
            if not ok or frame is None:
                raw.append((t_rel, last_cx))
                continue
            fh, fw = frame.shape[0], frame.shape[1]
            if fw <= 0:
                raw.append((t_rel, last_cx))
                continue
            try:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))
            except Exception:  # noqa: BLE001
                faces = []
            if len(faces) > 0:
                # Largest face by area.
                bx, by, bw, bh = max(faces, key=lambda r: r[2] * r[3])
                cx = (bx + bw / 2.0) / float(fw)
                cx = min(1.0, max(0.0, cx))
                last_cx = cx
            raw.append((t_rel, last_cx))

        cap.release()

        # EMA smoothing (alpha ~ 0.2).
        alpha = 0.2
        smoothed = None
        reframe = []
        for t_rel, cx in raw:
            if smoothed is None:
                smoothed = cx
            else:
                smoothed = alpha * cx + (1.0 - alpha) * smoothed
            reframe.append({"t": round(t_rel, 2), "cx": round(min(1.0, max(0.0, smoothed)), 3)})

        out = {
            "ok": True,
            "srcWidth": src_w,
            "srcHeight": src_h,
            "fps": round(float(fps), 3),
            "reframe": reframe,
        }
        print(json.dumps(out))
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        emit_error(type(e).__name__, e)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        emit_error(type(e).__name__, e)
