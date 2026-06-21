"""Fetch a YouTube transcript (timed segments) via youtube-transcript-api.

Uses YouTube's timedtext endpoint, which — unlike yt-dlp's player extraction —
is not blocked from datacenter IPs, so it works without a proxy. Prints JSON:
  {"ok": true, "segments": [{"start": 1.2, "dur": 3.4, "text": "..."}]}
"""
import sys
import json


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "video id required"}))
        return
    video_id = sys.argv[1]
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
        segments = [
            {
                "start": round(float(s.start), 2),
                "dur": round(float(s.duration), 2),
                "text": " ".join(str(s.text).split()),
            }
            for s in fetched
            if str(s.text).strip()
        ]
        print(json.dumps({"ok": True, "segments": segments}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": type(e).__name__ + ": " + str(e)[:200]}))


if __name__ == "__main__":
    main()
