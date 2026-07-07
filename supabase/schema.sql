-- Clipr database schema — run in Supabase SQL editor in order.

-- 1. User profiles
CREATE TABLE users_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','creator','pro','agency')),
  credits_used INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile" ON users_profiles FOR ALL USING (auth.uid() = id);

-- 2. Clip jobs
CREATE TABLE clip_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url    TEXT,
  topic         TEXT,
  style         TEXT,
  platforms     TEXT[],
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  error_message TEXT,
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clip_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_jobs" ON clip_jobs FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_clip_jobs_user ON clip_jobs(user_id);

-- 3. Clips
CREATE TABLE clips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES clip_jobs(id) ON DELETE CASCADE,
  title       TEXT,
  hook        TEXT,
  description TEXT,
  captions    TEXT[],
  hashtags    TEXT[],
  duration    TEXT,
  start_seconds  INTEGER,
  end_seconds    INTEGER,
  r2_url      TEXT,
  bg_gradient TEXT,
  virality_score INTEGER CHECK (virality_score BETWEEN 0 AND 100),
  score_reason   TEXT,
  virality_tag   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_clips" ON clips FOR ALL USING (
  auth.uid() = (SELECT user_id FROM clip_jobs WHERE id = job_id)
);

-- 4. Faceless videos
CREATE TABLE faceless_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  niche       TEXT,
  voice_style TEXT,
  duration    TEXT,
  script_json JSONB,
  r2_url      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','processing','done','failed')),
  error_message TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE faceless_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_videos" ON faceless_videos FOR ALL USING (auth.uid() = user_id);

-- 5. Social accounts (manually-added pages OR accounts the user has connected
--    via Zernio get mirrored here so the app can gate features on "is anything
--    connected" without always calling out to Zernio).
CREATE TABLE social_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('TikTok','Instagram','YouTube','Facebook')),
  display_name TEXT NOT NULL,
  profile_url  TEXT,
  external_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','error')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, platform, display_name)
);
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_accounts" ON social_accounts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_social_accounts_user ON social_accounts(user_id);

-- 6. Posts
CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id         UUID REFERENCES clips(id),
  video_id        UUID REFERENCES faceless_videos(id),
  platforms       TEXT[],
  caption         TEXT,
  scheduled_at    TIMESTAMPTZ,
  posted_at       TIMESTAMPTZ,
  status          TEXT DEFAULT 'queued' CHECK (status IN ('queued','posted','failed')),
  zernio_response JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_posts" ON posts FOR ALL USING (auth.uid() = user_id);

-- 7. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Realtime on job tables (frontend subscribes for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE clip_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE faceless_videos;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;

-- ---------------------------------------------------------------------------
-- INCREMENTAL MIGRATION — safe to paste into the Supabase SQL editor against
-- an EXISTING project. Everything above is for a brand-new project; the app
-- code (and types/database.ts) already assumes the columns/table below exist,
-- but this file previously didn't define them, so a fresh install from it
-- would have been missing them. This block is idempotent (IF NOT EXISTS) so
-- re-running it is harmless.
-- ---------------------------------------------------------------------------
ALTER TABLE clip_jobs ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS start_seconds INTEGER;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS end_seconds INTEGER;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS virality_score INTEGER CHECK (virality_score BETWEEN 0 AND 100);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS score_reason TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS virality_tag TEXT;
ALTER TABLE faceless_videos ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE TABLE IF NOT EXISTS social_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('TikTok','Instagram','YouTube','Facebook')),
  display_name TEXT NOT NULL,
  profile_url  TEXT,
  external_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','error')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, platform, display_name)
);
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_accounts" ON social_accounts;
CREATE POLICY "own_accounts" ON social_accounts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id);
