FROM node:20-slim

# FFmpeg (includes ffprobe) + yt-dlp
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip fonts-liberation fonts-dejavu-core \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
