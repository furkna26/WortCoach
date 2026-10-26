-- ============================================================================
-- WORTCOACH SUPABASE VERİTABANI ŞEMASI VE GÜVENLİK POLİTİKALARI (RLS)
-- ============================================================================
-- Modül 1: Profiles, Daily Stats, Friendships, Decks
-- Sıfır emoji, %100 güvenli, atomik RPC fonksiyonları ve RLS kuralları
-- ============================================================================

-- 1. PROFILES TABLOSU
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  friend_code text unique not null,
  elo integer not null default 1000 check (elo >= 0),
  rank_tier text not null default 'Bronz',
  streak_days integer not null default 0 check (streak_days >= 0),
  last_active_date date,
  deck_privacy text not null default 'friends' check (deck_privacy in ('private', 'friends', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexler
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_friend_code on public.profiles(friend_code);
create index if not exists idx_profiles_elo on public.profiles(elo desc);

-- 2. DAILY STATS TABLOSU (Bileşik Birincil Anahtar: user_id + stat_date)
create table if not exists public.daily_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  stat_date date not null default current_date,
  artikel_correct integer not null default 0 check (artikel_correct >= 0),
  artikel_total integer not null default 0 check (artikel_total >= 0),
  cloze_correct integer not null default 0 check (cloze_correct >= 0),
  cloze_total integer not null default 0 check (cloze_total >= 0),
  review_correct integer not null default 0 check (review_correct >= 0),
  review_total integer not null default 0 check (review_total >= 0),
  total_response_time_ms bigint not null default 0 check (total_response_time_ms >= 0),
  total_questions_answered integer not null default 0 check (total_questions_answered >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, stat_date)
);

create index if not exists idx_daily_stats_date on public.daily_stats(stat_date);

-- 3. FRIENDSHIPS TABLOSU
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_friendship unique (requester_id, addressee_id),
  constraint not_self_friend check (requester_id <> addressee_id)
);

create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);
create index if not exists idx_friendships_status on public.friendships(status);

-- 4. DECKS TABLOSU
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  words_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_decks_owner on public.decks(owner_id);

-- ============================================================================
-- YARDIMCI VE TETİKLEYİCİ FONKSİYONLAR (TRIGGERS & PROCEDURES)
-- ============================================================================

-- ELO Puanına Göre Lig Adı Belirleme Fonksiyonu
create or replace function public.get_rank_tier_name(p_elo integer)
returns text
language plpgsql
immutable
as $$
begin
  if p_elo < 800 then return 'Tahta';
  elsif p_elo < 1000 then return 'Demir';
  elsif p_elo < 1200 then return 'Bronz';
  elsif p_elo < 1500 then return 'Gümüş';
  elsif p_elo < 1800 then return 'Altın';
  elsif p_elo < 2100 then return 'Platin';
  elsif p_elo < 2400 then return 'Elmas';
  else return 'Grossmeister';
  end if;
end;
$$;

-- Benzersiz 6 Haneli Friend Code Üretici (Örn: WC#4829)
create or replace function public.generate_unique_friend_code()
returns text
language plpgsql
as $$
declare
  new_code text;
  is_exists boolean;
begin
  loop
    new_code := 'WC#' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    select exists(select 1 from public.profiles where friend_code = new_code) into is_exists;
    if not is_exists then
      return new_code;
    end if;
  end loop;
end;
$$;

-- Yeni Kullanıcı Kaydolduğunda Otomatik Profil Oluşturma Trigger'ı
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_username text;
  safe_friend_code text;
begin
  chosen_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );
  
  -- Eğer username zaten varsa arkasına rastgele 3 hane ekle
  if exists (select 1 from public.profiles where username = chosen_username) then
    chosen_username := chosen_username || '_' || floor(random() * 899 + 100)::text;
  end if;

  safe_friend_code := public.generate_unique_friend_code();

  insert into public.profiles (
    id,
    username,
    friend_code,
    elo,
    rank_tier,
    streak_days,
    last_active_date,
    deck_privacy
  ) values (
    new.id,
    chosen_username,
    safe_friend_code,
    1000,
    'Bronz',
    0,
    null,
    'friends'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ATOMİK İSTATİSTİK & ELO GÜNCELLEME RPC FONKSİYONU
-- ============================================================================
-- Yarış koşullarını (race condition) engeller, ELO ve istatistiği tek işlemde yazar
create or replace function public.record_activity_stat(
  p_user_id uuid,
  p_stat_date date,
  p_type text, -- 'artikel', 'cloze', 'review'
  p_is_correct boolean,
  p_response_time_ms bigint default 0,
  p_elo_delta integer default 0
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_old_elo integer;
  v_new_elo integer;
  v_old_tier text;
  v_new_tier text;
  v_last_active date;
  v_streak integer;
  v_today date := coalesce(p_stat_date, current_date);
  v_tier_promoted boolean := false;
begin
  -- Güvenlik doğrulaması
  if auth.uid() <> p_user_id then
    raise exception 'Yetkisiz profil güncellemesi';
  end if;

  -- 1. Profil mevcut durumunu oku
  select elo, rank_tier, streak_days, last_active_date
    into v_old_elo, v_old_tier, v_streak, v_last_active
    from public.profiles
   where id = p_user_id
     for update;

  if not found then
    raise exception 'Profil bulunamadı';
  end if;

  -- 2. Yeni ELO ve Lig Hesapla
  v_new_elo := greatest(0, v_old_elo + p_elo_delta);
  v_new_tier := public.get_rank_tier_name(v_new_elo);

  if v_new_tier <> v_old_tier and v_new_elo > v_old_elo then
    v_tier_promoted := true;
  end if;

  -- 3. Streak Hesapla
  if v_last_active is null then
    v_streak := 1;
  elsif v_last_active = v_today then
    -- Aynı gün içinde streak değişmez
    null;
  elsif v_last_active = (v_today - interval '1 day')::date then
    -- Dün girmiş, seri +1
    v_streak := v_streak + 1;
  else
    -- 1 günden fazla ara vermiş, seri 1'e döner
    v_streak := 1;
  end if;

  -- 4. Profili Güncelle
  update public.profiles
     set elo = v_new_elo,
         rank_tier = v_new_tier,
         streak_days = v_streak,
         last_active_date = v_today,
         updated_at = now()
   where id = p_user_id;

  -- 5. Daily Stats Tablosuna Upsert Et
  insert into public.daily_stats (
    user_id,
    stat_date,
    artikel_correct,
    artikel_total,
    cloze_correct,
    cloze_total,
    review_correct,
    review_total,
    total_response_time_ms,
    total_questions_answered,
    updated_at
  ) values (
    p_user_id,
    v_today,
    case when p_type = 'artikel' and p_is_correct then 1 else 0 end,
    case when p_type = 'artikel' then 1 else 0 end,
    case when p_type = 'cloze' and p_is_correct then 1 else 0 end,
    case when p_type = 'cloze' then 1 else 0 end,
    case when p_type = 'review' and p_is_correct then 1 else 0 end,
    case when p_type = 'review' then 1 else 0 end,
    greatest(0, p_response_time_ms),
    1,
    now()
  )
  on conflict (user_id, stat_date) do update
  set
    artikel_correct = public.daily_stats.artikel_correct + (case when p_type = 'artikel' and p_is_correct then 1 else 0 end),
    artikel_total   = public.daily_stats.artikel_total   + (case when p_type = 'artikel' then 1 else 0 end),
    cloze_correct   = public.daily_stats.cloze_correct   + (case when p_type = 'cloze' and p_is_correct then 1 else 0 end),
    cloze_total     = public.daily_stats.cloze_total     + (case when p_type = 'cloze' then 1 else 0 end),
    review_correct  = public.daily_stats.review_correct  + (case when p_type = 'review' and p_is_correct then 1 else 0 end),
    review_total    = public.daily_stats.review_total    + (case when p_type = 'review' then 1 else 0 end),
    total_response_time_ms = public.daily_stats.total_response_time_ms + greatest(0, p_response_time_ms),
    total_questions_answered = public.daily_stats.total_questions_answered + 1,
    updated_at = now();

  return jsonb_build_object(
    'old_elo', v_old_elo,
    'new_elo', v_new_elo,
    'elo_delta', p_elo_delta,
    'old_tier', v_old_tier,
    'new_tier', v_new_tier,
    'tier_promoted', v_tier_promoted,
    'streak_days', v_streak
  );
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- ============================================================================

-- RLS Açma
alter table public.profiles enable row level security;
alter table public.daily_stats enable row level security;
alter table public.friendships enable row level security;
alter table public.decks enable row level security;

-- ----------------------------------------------------------------------------
-- PROFILES RLS
-- ----------------------------------------------------------------------------
-- Herkes profilleri okuyabilir (Arkadaş listesi, arama, ELO liderlik tablosu için)
drop policy if exists "Profiles read public" on public.profiles;
create policy "Profiles read public"
  on public.profiles for select
  using (true);

-- Sadece kendi profilini ekleyebilir
drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Sadece kendi profilini güncelleyebilir
drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
  on public.profiles for update
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- DAILY STATS RLS
-- ----------------------------------------------------------------------------
-- Herkes günlük istatistikleri okuyabilir (Arkadaşların analizlerini görmek için)
drop policy if exists "Daily stats read public" on public.daily_stats;
create policy "Daily stats read public"
  on public.daily_stats for select
  using (true);

-- Sadece kendi istatistiğini yazabilir / güncelleyebilir
drop policy if exists "Daily stats modify own" on public.daily_stats;
create policy "Daily stats modify own"
  on public.daily_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- FRIENDSHIPS RLS
-- ----------------------------------------------------------------------------
-- İstek gönderen veya alan taraf arkadaşlık kaydını okuyabilir
drop policy if exists "Friendships view own" on public.friendships;
create policy "Friendships view own"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Sadece oturum açmış kullanıcı kendi adına istek açabilir
drop policy if exists "Friendships create request" on public.friendships;
create policy "Friendships create request"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- İstek alıcısı onaylayabilir ya da taraflar güncelleyebilir
drop policy if exists "Friendships update" on public.friendships;
create policy "Friendships update"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- İki taraftan biri silebilir (Arkadaşlıktan çıkarma / isteği reddetme)
drop policy if exists "Friendships delete" on public.friendships;
create policy "Friendships delete"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ----------------------------------------------------------------------------
-- DECKS RLS (GİZLİLİK KURALLARI)
-- ----------------------------------------------------------------------------
-- Okuma kuralı:
-- 1. Kendi destesi ise okunur.
-- 2. Deste sahibinin 'deck_privacy' ayarı 'public' ise herkes okuyabilir.
-- 3. 'deck_privacy' ayarı 'friends' ise, 'friendships' tablosunda 'accepted' arkadaşı olan okuyabilir.
drop policy if exists "Decks read based on privacy" on public.decks;
create policy "Decks read based on privacy"
  on public.decks for select
  using (
    -- Sahibi
    owner_id = auth.uid()
    or
    -- Herkese açık deste
    exists (
      select 1 from public.profiles p
       where p.id = decks.owner_id
         and p.deck_privacy = 'public'
    )
    or
    -- Sadece arkadaşlar deste kontrolü
    (
      exists (
        select 1 from public.profiles p
         where p.id = decks.owner_id
           and p.deck_privacy = 'friends'
      )
      and
      exists (
        select 1 from public.friendships f
         where f.status = 'accepted'
           and (
             (f.requester_id = auth.uid() and f.addressee_id = decks.owner_id)
             or
             (f.addressee_id = auth.uid() and f.requester_id = decks.owner_id)
           )
      )
    )
  );

-- Desteleri ekleme, düzenleme ve silme sadece sahibine aittir
drop policy if exists "Decks manage own" on public.decks;
create policy "Decks manage own"
  on public.decks for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
