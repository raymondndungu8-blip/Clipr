'use strict';

function escapeDrawtext(val) {
  return String(val || '').replace(/'/g, "'\\''").replace(/\n/g, ' ');
}

function firstHexColor(cssColor, fallback = '#0a0e1a') {
  const match = String(cssColor || '').match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : fallback;
}

function buildCaptionFilters({ hook, captions, duration, accent }) {
  const filters = [];
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#22e06a';

  const safeHook = escapeDrawtext(hook);
  if (safeHook) {
    const hookEnd = Math.min(3, duration).toFixed(2);
    filters.push(
      `drawtext=text='${safeHook}':fontcolor=white:fontsize=46:borderw=3:bordercolor=black:` +
        `x=(w-text_w)/2:y=140:enable='between(t,0,${hookEnd})'`
    );
  }

  const chunks = (captions || []).map((c) => escapeDrawtext(c)).filter(Boolean);
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
