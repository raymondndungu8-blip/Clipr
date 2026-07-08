# Clipr render service — Remotion + Chromium + ffmpeg (bundled) + yt-dlp.
FROM node:20-bookworm-slim

# System libraries Remotion's headless Chromium needs, plus python3 for yt-dlp.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ca-certificates fonts-liberation fonts-dejavu-core \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libatspi2.0-0 libx11-6 libxcb1 libxext6 libxi6 \
      libglib2.0-0 libgl1 \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp youtube-transcript-api faster-whisper opencv-python-headless \
    && rm -rf /var/lib/apt/lists/*

# Pre-download the Whisper model so the first upload doesn't pay for it.
ENV WHISPER_MODEL=base
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

# Fail the build early if OpenCV can't import (reframe depends on it).
RUN python3 -c "import cv2; print('opencv', cv2.__version__)"

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Bake Remotion's headless shell into the image so renders don't download it at runtime.
RUN npx remotion browser ensure

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
