import { supabase } from './client';

/** PostgREST: colonne avec tiret */
export const SCREENS_TABLE = 'screens';
export const ROBOT_MEASUREMENTS_TABLE = 'robot_measurements';

export const SCREENS_SELECT =
  'id, nom, robot_id, created_at, address, robot, latitude, longitude, user_id, pourcentage_batterie, "temperature-carte"';

export const ROBOT_MEASUREMENTS_SELECT =
  'id, robot, temperature_carte, pourcentage_batterie, created_at, screen_id';

export function screenRowTemp(row) {
  if (!row) return null;
  const t = row['temperature-carte'] ?? row.temperature_carte;
  if (t === null || t === undefined) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function screenRowBatteryPercent(row) {
  if (!row || row.pourcentage_batterie == null) return null;
  const n = Number(row.pourcentage_batterie);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function displayRobotName(row, fallback = 'AdBot R1') {
  if (!row) return fallback;
  const r = row.robot || row.nom;
  return (r && String(r).trim()) || fallback;
}

/**
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} q
 * @param {{ screenId?: string, robotName?: string }} scope
 */
export function applyScreenScope(q, { screenId, robotName }) {
  if (screenId) return q.eq('id', screenId);
  if (robotName) {
    const safe = String(robotName).replace(/"/g, '');
    return q.or(`robot.eq."${safe}",nom.eq."${safe}"`);
  }
  return q;
}

/**
 * Scope utilisé pour robot_measurements (screen_id, robot).
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} q
 * @param {{ screenId?: string, robotName?: string }} scope
 */
export function applyRobotMeasurementsScope(q, { screenId, robotName }) {
  if (screenId) return q.eq('screen_id', screenId);
  if (robotName) {
    const safe = String(robotName).replace(/"/g, '');
    return q.eq('robot', safe);
  }
  return q;
}

export async function fetchLatestScreenRow(scope) {
  let q = supabase.from(SCREENS_TABLE).select(SCREENS_SELECT);
  q = applyScreenScope(q, scope);
  return q.order('created_at', { ascending: false }).limit(1).maybeSingle();
}

export async function fetchScreenHistorySince(scope, sinceIso) {
  let q = supabase
    .from(ROBOT_MEASUREMENTS_TABLE)
    .select(ROBOT_MEASUREMENTS_SELECT)
    .gte('created_at', sinceIso);
  q = applyRobotMeasurementsScope(q, scope);
  return q.order('created_at', { ascending: true });
}

/**
 * Subscribe to any change on `screens`.
 * Returns an unsubscribe function.
 */
export function subscribeScreensRealtime(onChange, channelName = 'screens-realtime') {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: SCREENS_TABLE }, onChange);

  channel.subscribe((status) => {
    if (__DEV__ && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
      console.warn('[Supabase realtime screens]', status);
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Historique étendu utilisé par BatteryDetailsScreen.
 * On réutilise actuellement `screens` (source batterie existante du projet)
 * pour éviter les imports manquants côté UI.
 */
export async function fetchRobotMeasurementsHistoryExtended(scope, limit = 200) {
  let q = supabase.from(ROBOT_MEASUREMENTS_TABLE).select(ROBOT_MEASUREMENTS_SELECT);
  q = applyRobotMeasurementsScope(q, scope);
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(1000, Number(limit))) : 200;
  return q.order('created_at', { ascending: false }).limit(safeLimit);
}

/**
 * Subscription temps réel utilisée par BatteryDetailsScreen.
 * Branchée sur `screens` pour rester cohérent avec la source courante.
 */
export function subscribeRobotMeasurementsRealtime(
  onChange,
  channelName = 'robot-measurements-realtime'
) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: ROBOT_MEASUREMENTS_TABLE }, onChange);

  channel.subscribe((status) => {
    if (__DEV__ && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
      console.warn('[Supabase realtime robot_measurements]', status);
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Noms distincts de la colonne `robot` (pour le sélecteur d’accueil). */
export async function fetchRobotNamesFromScreens() {
  const { data, error } = await supabase
    .from(SCREENS_TABLE)
    .select('robot')
    .not('robot', 'is', null);

  if (error) return { names: [], error };

  const seen = new Set();
  const names = [];
  for (const row of data || []) {
    const r = row.robot != null ? String(row.robot).trim() : '';
    if (r && !seen.has(r)) {
      seen.add(r);
      names.push(r);
    }
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return { names, error: null };
}
