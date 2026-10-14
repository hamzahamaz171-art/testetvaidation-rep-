import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import {
  fetchAdsTimelineForRobot,
  formatDay,
  formatHour,
  normalizeStatus,
  resolvePublicAssetUrl,
} from '../supabase/adsCalendar';

const STATUS_LABELS = {
  airing: 'En cours',
  aired: 'Précédente',
  scheduled: 'Suivante',
};

const STATUS_ICONS = {
  airing: '▶',
  aired: '✓',
  scheduled: '⏱',
};

function getAdName(row) {
  return row?.advertisement?.name || row?.name || 'Publicité';
}

function getThumb(row) {
  return resolvePublicAssetUrl(row?.advertisement?.thumbnail_url);
}

function getRobotLabel(screen, fallback) {
  return screen?.robot || screen?.nom || fallback || 'Robot';
}

function AdImage({ row, style, placeholderStyle, placeholderTextStyle }) {
  const uri = getThumb(row);
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[style, placeholderStyle]}>
        <Text style={placeholderTextStyle}>ADS</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function AdsStatusScreen({ route, navigation }) {
  const c = useThemeColors();
  const isDark = c.text === '#E6EDFF';
  const styles = makeStyles(c, isDark);

  const { screenId, robotName } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ screen: null, current: null, previous: null, next: null, all: [] });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await fetchAdsTimelineForRobot({ screenId, robotName });
      setPayload(data);
    } catch (e) {
      setError(e?.message || 'Impossible de charger les publicités.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [screenId, robotName]);

  useEffect(() => {
    load(false);
  }, [load]);

  const robotLabel = getRobotLabel(payload.screen, robotName);
  const zone = useMemo(() => {
    const screen = payload.screen;
    if (!screen) return '—';
    if (screen.address) return String(screen.address);
    if (screen.latitude != null && screen.longitude != null) return `${Number(screen.latitude).toFixed(4)}, ${Number(screen.longitude).toFixed(4)}`;
    return '—';
  }, [payload.screen]);

  const current = payload.current;

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  return (
    <GradientBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.orange} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Publicité en cours</Text>
            <Text style={styles.subtitle}>{robotLabel}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => load(false)} activeOpacity={0.85}>
            <Text style={styles.refreshText}>↻</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={c.orange} />
            <Text style={styles.stateText}>Chargement des publicités...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorTitle}>Erreur</Text>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load(false)}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.mainCard}>
              <View style={styles.mainImageWrap}>
                <AdImage
                  row={current}
                  style={styles.mainImage}
                  placeholderStyle={styles.imagePlaceholder}
                  placeholderTextStyle={styles.imagePlaceholderText}
                />
              </View>

              <View style={styles.mainInfo}>
                <View style={styles.statusBadge}>
                  <View style={styles.greenDot} />
                  <Text style={styles.statusBadgeText}>{current ? 'En cours' : 'Aucune pub en cours'}</Text>
                </View>

                <Text style={styles.adTitle} numberOfLines={3}>{current ? getAdName(current) : 'Aucune publicité airing'}</Text>

                <View style={styles.infoLine}>
                  <Text style={styles.infoIcon}>🖥️</Text>
                  <Text style={styles.infoLabel}>Screen :</Text>
                  <Text style={styles.infoValue}>{payload.screen?.nom || '—'}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoIcon}>🤖</Text>
                  <Text style={styles.infoLabel}>Robot :</Text>
                  <Text style={styles.infoValue}>{robotLabel}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <Text style={styles.infoLabel}>Zone :</Text>
                  <Text style={styles.infoValue}>{zone}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoIcon}>📅</Text>
                  <Text style={styles.infoLabel}>Date :</Text>
                  <Text style={styles.infoValue}>{formatDay(current?.day)}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoIcon}>🕒</Text>
                  <Text style={styles.infoLabel}>Heure :</Text>
                  <Text style={styles.infoValue}>{formatHour(current?.time)}</Text>
                </View>

                <View style={styles.playingBtn}>
                  <Text style={styles.playingIcon}>▶</Text>
                  <Text style={styles.playingText}>{current ? 'En lecture' : 'Non disponible'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.timelineGrid}>
              <SmallAdCard title="Publicité précédente" row={payload.previous} c={c} isDark={isDark} />
              <SmallAdCard title="Publicité suivante" row={payload.next} c={c} isDark={isDark} />
            </View>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function SmallAdCard({ title, row, c, isDark }) {
  const styles = makeStyles(c, isDark);
  const status = normalizeStatus(row?.status);
  return (
    <View style={styles.smallCard}>
      <Text style={styles.smallSectionTitle}>{title}</Text>
      {row ? (
        <View style={styles.smallContent}>
          <AdImage
            row={row}
            style={styles.smallImage}
            placeholderStyle={styles.smallPlaceholder}
            placeholderTextStyle={styles.smallPlaceholderText}
          />
          <View style={styles.smallInfo}>
            <View style={styles.smallBadge}>
              <Text style={styles.smallBadgeIcon}>{STATUS_ICONS[status] || '•'}</Text>
              <Text style={styles.smallBadgeText}>{STATUS_LABELS[status] || row.status}</Text>
            </View>
            <Text style={styles.smallTitle} numberOfLines={2}>{getAdName(row)}</Text>
            <Text style={styles.smallMeta}>📅 {formatDay(row.day)}</Text>
            <Text style={styles.smallMeta}>🕒 {formatHour(row.time)}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptySmall}>
          <Text style={styles.emptySmallText}>Aucune donnée trouvée</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c, isDark) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 34,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingRight: 54,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    backText: {
      color: c.orange,
      fontSize: 25,
      fontWeight: '900',
      marginTop: -2,
    },
    refreshBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    refreshText: {
      color: c.orange,
      fontSize: 22,
      fontWeight: '900',
    },
    headerCenter: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    title: {
      color: c.text,
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      color: c.orange,
      fontSize: 14,
      fontWeight: '900',
      marginTop: 3,
      textAlign: 'center',
    },
    stateCard: {
      minHeight: 220,
      borderRadius: 22,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    stateText: {
      color: c.muted,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 12,
      lineHeight: 20,
    },
    errorTitle: {
      color: c.danger,
      fontWeight: '900',
      fontSize: 18,
    },
    retryBtn: {
      marginTop: 14,
      backgroundColor: c.orange,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 18,
    },
    retryText: {
      color: '#071428',
      fontWeight: '900',
    },
    mainCard: {
      borderRadius: 22,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
      padding: 14,
      flexDirection: Platform.OS === 'web' ? 'row' : 'column',
      gap: 16,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.25 : 0.10,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    mainImageWrap: {
      width: Platform.OS === 'web' ? 280 : '100%',
      alignSelf: Platform.OS === 'web' ? 'stretch' : 'center',
    },
    mainImage: {
      width: '100%',
      height: Platform.OS === 'web' ? 330 : 360,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.35)',
      backgroundColor: isDark ? 'rgba(0,0,0,0.24)' : 'rgba(15,30,58,0.05)',
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    imagePlaceholderText: {
      color: c.orange,
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: 2,
    },
    mainInfo: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      paddingVertical: 4,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.14)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(34,197,94,0.35)' : 'rgba(22,163,74,0.28)',
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 12,
      marginBottom: 14,
    },
    greenDot: {
      width: 9,
      height: 9,
      borderRadius: 9,
      backgroundColor: '#22c55e',
      marginRight: 7,
    },
    statusBadgeText: {
      color: '#22c55e',
      fontWeight: '900',
      fontSize: 13,
    },
    adTitle: {
      color: c.text,
      fontWeight: '900',
      fontSize: 26,
      lineHeight: 32,
      marginBottom: 18,
    },
    infoLine: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 11,
      flexWrap: 'wrap',
    },
    infoIcon: {
      width: 26,
      fontSize: 16,
    },
    infoLabel: {
      color: c.muted,
      fontWeight: '800',
      marginRight: 6,
    },
    infoValue: {
      color: c.text,
      fontWeight: '900',
      flexShrink: 1,
    },
    playingBtn: {
      marginTop: 14,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 18,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(34,197,94,0.35)' : 'rgba(22,163,74,0.28)',
      backgroundColor: isDark ? 'rgba(34,197,94,0.14)' : 'rgba(34,197,94,0.10)',
    },
    playingIcon: {
      color: '#22c55e',
      fontWeight: '900',
      marginRight: 9,
    },
    playingText: {
      color: '#22c55e',
      fontWeight: '900',
      fontSize: 15,
    },
    timelineGrid: {
      marginTop: 14,
      flexDirection: Platform.OS === 'web' ? 'row' : 'column',
      gap: 14,
    },
    smallCard: {
      flex: 1,
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
      padding: 14,
      minHeight: 150,
    },
    smallSectionTitle: {
      color: c.text,
      fontWeight: '900',
      fontSize: 15,
      marginBottom: 12,
    },
    smallContent: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    smallImage: {
      width: 98,
      height: 110,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0,0,0,0.24)' : 'rgba(15,30,58,0.05)',
      borderWidth: 1,
      borderColor: c.border2,
    },
    smallPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    smallPlaceholderText: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 18,
    },
    smallInfo: {
      flex: 1,
      minWidth: 0,
    },
    smallBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.12)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.30)' : 'rgba(245,158,11,0.34)',
      marginBottom: 9,
    },
    smallBadgeIcon: {
      color: c.orange,
      fontWeight: '900',
      marginRight: 5,
    },
    smallBadgeText: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 12,
    },
    smallTitle: {
      color: c.text,
      fontWeight: '900',
      fontSize: 16,
      lineHeight: 21,
      marginBottom: 6,
    },
    smallMeta: {
      color: c.muted,
      fontWeight: '800',
      marginTop: 3,
      fontSize: 12,
    },
    emptySmall: {
      minHeight: 96,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,58,0.03)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    emptySmallText: {
      color: c.muted,
      fontWeight: '800',
      textAlign: 'center',
    },
  });
