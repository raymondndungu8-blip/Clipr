'use strict';

const { sanitizeCaption } = require('../processors/clipProcessor');

/** First hex colour found in a CSS gradient/color string, for an ffmpeg `color=` source. */
function firstHexColor(cssColor, fallback = '#0a0e1a') {
  const match = String(cssColor || '').match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : fallback;
}

/**
 * Build a chained ffmpeg drawtext filter string: the hook shown near the top
 * for the first few seconds, then the caption chunks cycled evenly across
 * the clip's duration (mirrors the client-side preview's 1.1s caption
 * cycling in components/VideoPreview.tsx). Reuses sanitizeCaption so burned-in
 * text is restricted to the same drawtext-safe character set already proven
 * out in clipProcessor.js (no colons/quotes to escape).
 */
function buildCaptionFilters({ hook, captions, duration, accent }) {
  const filters = [];
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#22e06a';

  const safeHook = sanitizeCaption(hook || '');
  if (safeHook) {
    const hookEnd = Math.min(3, duration).toFixed(2);
    filters.push(
      `drawtext=text='${safeHook}':fontcolor=white:fontsize=46:borderw=3:bordercolor=black:` +
        `x=(w-text_w)/2:y=140:enable='between(t,0,${hookEnd})'`
    );
  }

  const chunks = (captions || []).map((c) => sanitizeCaption(c)).filter(Boolean);
  if (chunks.length > 0) {
    const per = duration / chunks.length;
    chunks.forEach((chunk, i) => {
      const start = (i * per).toFixed(2);
      const end = ((i + 1) * per).toFixed(2);
      filters.push(
        `drawtext=text='${chunk}':fontcolor=${safeAccent}:fontsize=54:borderw=2:bordercolor=black:` +
          `box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-text_h-220:` +
          `enable='between(t,${start},${end})'`
      );
    });
  }

  return filters;
}

module.exports = { firstHexColor, buildCaptionFilters };
