'use strict';

const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/**
 * Generic status/field update on a table by primary key id.
 */
async function updateJobStatus(table, id, fields) {
  const { error } = await getClient().from(table).update(fields).eq('id', id);
  if (error) {
    throw new Error(`Supabase update failed (${table}#${id}): ${error.message}`);
  }
}

/** Convenience helpers used by the processors. */
const updateClipJob = (jobId, fields) => updateJobStatus('clip_jobs', jobId, fields);
const updateFacelessVideo = (videoId, fields) => updateJobStatus('faceless_videos', videoId, fields);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST a JSON payload to the Next.js app's worker callback route,
 * authenticated with the shared worker secret. Retries once on failure.
 *
 * Returns true on success, false on final failure (logged, never throws —
 * the Supabase row is the source of truth, the callback is best-effort).
 */
async function postCallback(payload) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error('[callback] APP_URL is not set — skipping callback', payload);
    return false;
  }
  const url = `${appUrl.replace(/\/$/, '')}/api/worker/callback`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': process.env.WORKER_SECRET || '',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`callback responded HTTP ${res.status}`);
      }
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) await sleep(2000);
    }
  }
  console.error(`[callback] failed after retry (${url}):`, lastErr && lastErr.message);
  return false;
}

module.exports = { updateJobStatus, updateClipJob, updateFacelessVideo, postCallback };
