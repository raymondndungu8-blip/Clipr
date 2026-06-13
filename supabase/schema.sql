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
  r2_url      TEXT,
  bg_gradient TEXT,
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
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE faceless_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_videos" ON faceless_videos FOR ALL USING (auth.uid() = user_id);

-- 5. Posts
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

-- 6. Auto-create profile on signup
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

-- 7. Realtime on job tables (frontend subscribes for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE clip_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE faceless_videos;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
