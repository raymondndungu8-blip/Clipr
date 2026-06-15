# Clipr render service — Remotion + Chromium + ffmpeg (bundled) + yt-dlp.
FROM node:20-bookworm-slim

# System libraries Remotion's headless Chromium needs, plus python3 for yt-dlp.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ca-certificates fonts-liberation fonts-dejavu-core \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libatspi2.0-0 libx11-6 libxcb1 libxext6 libxi6 \
      libglib2.0-0 \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/*

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
