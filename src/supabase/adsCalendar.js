import { supabase } from './client';
import { fetchLatestScreenRow } from './screens';

const CALENDAR_SELECT = 'id, name, ad_id, user_id, time, day, status, created_at, updated_at, screen_id';
const ADS_SELECT = 'id, name, thumbnail_url, status, submitted_at, updated_at, user_id, video_url';

export function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export function formatCalendarDateTime(row) {
  const day = row?.day ? String(row.day) : '';
  const time = row?.time ? String(row.time) : '00:00:00';
  const cleanTime = time.length === 5 ? `${time}:00` : time;
  if (!day) return null;
  const date = new Date(`${day}T${cleanTime}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHour(time) {
  if (!time) return '—';
  const parts = String(time).split(':');
  if (parts.length < 2) return String(time);
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

export function formatDay(day) {
  if (!day) return '—';
  return String(day);
}

export function resolvePublicAssetUrl(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  // In your DB the values often look like: adbot/zoneA/file.mp4 or adbot/file.jpeg.
  // Supabase public URL needs the bucket name + path inside that bucket.
  const parts = raw.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const bucket = parts[0];
    const path = parts.slice(1).join('/');
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  return raw;
}

async function fetchAdvertisementsByIds(ids) {
  const cleanIds = Array.from(new Set((ids || []).filter((id) => id !== null && id !== undefined)));
  if (cleanIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('advertisements')
    .select(ADS_SELECT)
    .in('id', cleanIds);

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((ad) => map.set(Number(ad.id), ad));
  return map;
}

function chooseAds(rows) {
  const enriched = [...(rows || [])].sort((a, b) => {
    const da = formatCalendarDateTime(a)?.getTime() ?? 0;
    const db = formatCalendarDateTime(b)?.getTime() ?? 0;
    return da - db;
  });

  const current = enriched.find((row) => normalizeStatus(row.status) === 'airing') || null;

  if (current) {
    const currentTime = formatCalendarDateTime(current)?.getTime() ?? Number.POSITIVE_INFINITY;
    const previous = [...enriched]
      .filter((row) => normalizeStatus(row.status) === 'aired')
      .filter((row) => (formatCalendarDateTime(row)?.getTime() ?? -1) <= currentTime)
      .pop() || enriched.filter((row) => normalizeStatus(row.status) === 'aired').pop() || null;

    const next = enriched
      .filter((row) => normalizeStatus(row.status) === 'scheduled')
      .find((row) => (formatCalendarDateTime(row)?.getTime() ?? Number.POSITIVE_INFINITY) >= currentTime) ||
      enriched.find((row) => normalizeStatus(row.status) === 'scheduled') ||
      null;

    return { current, previous, next, all: enriched };
  }

  return {
    current: null,
    previous: enriched.filter((row) => normalizeStatus(row.status) === 'aired').pop() || null,
    next: enriched.find((row) => normalizeStatus(row.status) === 'scheduled') || null,
    all: enriched,
  };
}

export async function fetchAdsTimelineForRobot({ screenId, robotName }) {
  let screen = null;
  if (screenId) {
    const { data, error } = await supabase
      .from('screens')
      .select('id, nom, robot_id, created_at, address, robot, latitude, longitude, user_id, pourcentage_batterie, "temperature-carte"')
      .eq('id', screenId)
      .maybeSingle();
    if (error) throw error;
    screen = data || null;
  } else if (robotName) {
    const { data, error } = await fetchLatestScreenRow({ robotName });
    if (error) throw error;
    screen = data || null;
  }

  if (!screen?.id) {
    return { screen: null, current: null, previous: null, next: null, all: [] };
  }

  const { data: calendarRows, error: calendarError } = await supabase
    .from('calendar')
    .select(CALENDAR_SELECT)
    .eq('screen_id', screen.id)
    .order('day', { ascending: true })
    .order('time', { ascending: true });

  if (calendarError) throw calendarError;

  const adsMap = await fetchAdvertisementsByIds((calendarRows || []).map((row) => row.ad_id));
  const rowsWithAds = (calendarRows || []).map((row) => ({
    ...row,
    advertisement: row.ad_id != null ? adsMap.get(Number(row.ad_id)) || null : null,
  }));

  return { screen, ...chooseAds(rowsWithAds) };
}
