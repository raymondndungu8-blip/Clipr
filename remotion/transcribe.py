"""Transcribe a local media file with faster-whisper. Prints JSON:
  {"ok": true, "segments": [{"start": 1.2, "end": 3.4, "text": "..."}]}
No network/YouTube involved — works on uploaded files. Model is configurable
via WHISPER_MODEL (default "base"); int8 keeps memory low for small machines.
"""
import os
import sys
import json


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "file path required"}))
        return
    path = sys.argv[1]
    try:
        from faster_whisper import WhisperModel

        model_name = os.environ.get("WHISPER_MODEL", "base")
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(path, vad_filter=True)
        out = [
            {
                "start": round(float(s.start), 2),
                "end": round(float(s.end), 2),
                "text": " ".join(str(s.text).split()),
            }
            for s in segments
            if str(s.text).strip()
        ]
        print(json.dumps({"ok": True, "segments": out}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": type(e).__name__ + ": " + str(e)[:200]}))


if __name__ == "__main__":
    main()
