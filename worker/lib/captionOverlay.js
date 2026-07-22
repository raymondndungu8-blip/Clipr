'use strict';

function escapeDrawtext(val) {
  return String(val || '').replace(/'/g, "'\\''").replace(/\n/g, ' ');
}

function firstHexColor(cssColor, fallback = '#0a0e1a') {
  const match = String(cssColor || '').match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : fallback;
}

const APPROX_CHAR_WIDTH = 34;

function calcLineX(chunk) {
  const estimatedW = chunk.length * APPROX_CHAR_WIDTH;
  return `(w-${estimatedW})/2`;
}

function calcWordX(chunk, wordIdx) {
  let before = 0;
  const words = chunk.split(/\s+/);
  for (let k = 0; k < wordIdx; k++) {
    before += words[k].length + 1;
  }
  const offset = before * APPROX_CHAR_WIDTH;
  const lineX = calcLineX(chunk);
  return offset === 0 ? lineX : `${lineX}+${offset}`;
}

function buildCaptionFilters({ hook, captions, duration, accent }) {
  const filters = [];
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#22e06a';
  const safeDuration = Math.max(3, Number(duration) || 10);

  const safeHook = escapeDrawtext(hook);
  if (safeHook) {
    const hookEnd = Math.min(3, safeDuration).toFixed(2);
    filters.push(
      `drawtext=text='${safeHook}':fontcolor=white:fontsize=46:borderw=3:bordercolor=black:` +
        `x=(w-text_w)/2:y=140:enable='between(t,0,${hookEnd})'`
    );
  }

  const chunks = (captions || []).map((c) => escapeDrawtext(c)).filter(Boolean);
  if (chunks.length > 0) {
    const per = safeDuration / chunks.length;
    chunks.forEach((chunk, i) => {
      const chunkStart = i * per;
      const chunkEnd = (i + 1) * per;
      const words = chunk.split(/\s+/).filter(Boolean);
      const wordDuration = words.length > 0 ? per / words.length : per;
      const lineX = calcLineX(chunk);
      const capY = 'h-text_h-220';

      filters.push(
        `drawtext=text='${chunk}':fontcolor=white:fontsize=54:borderw=2:bordercolor=black:` +
          `box=1:boxcolor=black@0.55:boxborderw=18:x=${lineX}:y=${capY}:` +
          `enable='between(t,${chunkStart.toFixed(2)},${chunkEnd.toFixed(2)})'`
      );

      words.forEach((word, j) => {
        const wStart = chunkStart + j * wordDuration;
        const wEnd = Math.min(wStart + wordDuration, chunkEnd);
        const wX = calcWordX(chunk, j);

        filters.push(
          `drawtext=text='${word}':fontcolor=${safeAccent}:fontsize=54:borderw=2:bordercolor=black:` +
            `x=${wX}:y=${capY}:enable='between(t,${wStart.toFixed(2)},${wEnd.toFixed(2)})'`
        );
      });
    });
  }

  return filters;
}

module.exports = { firstHexColor, buildCaptionFilters };
