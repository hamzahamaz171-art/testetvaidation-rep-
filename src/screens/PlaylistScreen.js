import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';
import { useThemedPopup } from '../components/useThemedPopup';

const BUCKET = 'videos';
const TABLE = 'videos';

function formatTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function PlaylistScreen({ navigation, route }) {
  const c = useThemeColors();
  const popup = useThemedPopup();
  const styles = useMemo(() => makeStyles(c), [c]);

  const videoRef = useRef(null);

  const robotName = route?.params?.robotName || 'AdBot R1';
  const zone = route?.params?.zone || 'Zone A';

  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [loading, setLoading] = useState(true);

  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const current = items[currentIndex];

  const currentUrl = useMemo(() => {
    if (!current?.file_path) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(current.file_path);
    return data?.publicUrl || null;
  }, [current]);

  async function loadPlaylist() {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('robot_name', robotName)
      .eq('zone', zone)
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (!error && Array.isArray(data)) {
      setItems(data);
      setCurrentIndex(0);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadPlaylist();
  }, []);

  async function playPause() {
    if (!videoRef.current) return;
    const st = await videoRef.current.getStatusAsync();
    if (st?.isLoaded && st.isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  }

  async function goToIndex(idx, autoplay = true) {
    if (idx < 0 || idx >= items.length) return;
    setCurrentIndex(idx);
    setIsPlaying(false);
    setPositionSec(0);
    setDurationSec(0);

    // small delay to let Video remount
    setTimeout(async () => {
      try {
        if (autoplay) {
          await videoRef.current?.playAsync();
          setIsPlaying(true);
        }
      } catch {}
    }, 60);
  }

  function prev() {
    if (!items.length) return;
    const idx = currentIndex - 1;
    if (idx >= 0) goToIndex(idx);
  }

  function next() {
    if (!items.length) return;
    const idx = currentIndex + 1;
    if (idx < items.length) goToIndex(idx);
  }

  async function deleteItem(item) {
    const confirm = await popup.confirm('Supprimer', 'Supprimer cette vidéo de la playlist ?', {
      okText: 'Supprimer',
      destructive: true,
    });

    if (!confirm) return;

    // soft delete
    await supabase.from(TABLE).update({ is_active: false }).eq('id', item.id);

    // adjust current index if needed
    const newList = items.filter((x) => x.id !== item.id);
    setItems(newList);
    if (currentIndex >= newList.length) setCurrentIndex(Math.max(0, newList.length - 1));
  }

  return (
    <GradientBackground>
      {popup.renderPopup}
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.robotName}>{robotName}</Text>
            <View style={styles.statusRow}>
              <View style={styles.greenDot} />
              <Text style={styles.statusTxt}>En service</Text>
            </View>
          </View>

          <Pressable style={styles.menuBtn} hitSlop={12}>
            <Text style={styles.menuTxt}>⋯</Text>
          </Pressable>
        </View>

        {/* Orange banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Lecture Playlist</Text>
          <Text style={styles.bannerSub}>
            {current?.title ? `${current.title} — ${zone}` : `${zone}`}
          </Text>
        </View>

        {/* Playlist */}
        <View style={styles.playlistCard}>
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            ListEmptyComponent={
              <View style={{ paddingVertical: 22 }}>
                <Text style={styles.emptyTxt}>Aucune vidéo trouvée dans Supabase.</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const active = index === currentIndex;
              return (
                <Pressable
                  onPress={() => goToIndex(index)}
                  style={[styles.rowItem, active && styles.rowItemActive]}
                >
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Text style={{ fontSize: 18 }}>🍔</Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta}>{formatTime(item.duration_sec)}</Text>
                  </View>

                  <Pressable onPress={() => deleteItem(item)} hitSlop={10} style={styles.trashBtn}>
                    <Text style={styles.trashTxt}>🗑️</Text>
                  </Pressable>
                </Pressable>
              );
            }}
          />
        </View>

        {/* Player */}
        <View style={styles.playerCard}>
          <View style={styles.videoBox}>
            {currentUrl ? (
              <Video
                ref={videoRef}
                source={{ uri: currentUrl }}
                style={styles.video}
                resizeMode={ResizeMode.COVER}
                useNativeControls={false}
                isLooping={isLooping}
                onPlaybackStatusUpdate={(s) => {
                  if (!s?.isLoaded) return;
                  setIsPlaying(!!s.isPlaying);
                  setPositionSec((s.positionMillis || 0) / 1000);
                  setDurationSec((s.durationMillis || 0) / 1000);

                  if (!isLooping && s.didJustFinish) {
                    // auto next
                    if (currentIndex < items.length - 1) next();
                  }
                }}
              />
            ) : (
              <View style={[styles.video, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={styles.emptyTxt}>Aucune vidéo sélectionnée</Text>
              </View>
            )}
          </View>

          {/* Progress (simple text) */}
          <View style={styles.timeRow}>
            <Text style={styles.timeTxt}>{formatTime(positionSec)}</Text>
            <Text style={styles.timeTxt}>{formatTime(durationSec)}</Text>
          </View>

          {/* Controls */}
          <View style={styles.controlsRow}>
            <Pressable onPress={prev} style={styles.ctrlBtn} hitSlop={12}>
              <Text style={styles.ctrlTxt}>⏮</Text>
            </Pressable>

            <Pressable onPress={playPause} style={styles.playBtn} hitSlop={12}>
              <Text style={styles.playTxt}>{isPlaying ? '⏸' : '▶'}</Text>
            </Pressable>

            <Pressable onPress={next} style={styles.ctrlBtn} hitSlop={12}>
              <Text style={styles.ctrlTxt}>⏭</Text>
            </Pressable>
          </View>

          {/* Bottom actions */}
          <View style={styles.bottomRow}>
            <View style={styles.pill}>
              <Text style={styles.pillIcon}>≡</Text>
              <Text style={styles.pillTxt}>Playlist</Text>
            </View>

            <Pressable onPress={() => setIsLooping((v) => !v)} style={[styles.pill, isLooping && styles.pillActive]}>
              <Text style={styles.pillIcon}>⟲</Text>
              <Text style={[styles.pillTxt, isLooping && styles.pillTxtActive]}>Boucle</Text>
            </Pressable>
          </View>
        </View>

        {loading && <Text style={styles.loadingTxt}>Chargement…</Text>}
      </View>
    </GradientBackground>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    backTxt: { color: c.text, fontSize: 26, marginTop: -2 },
    robotName: { color: c.text, fontSize: 18, fontWeight: '800' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    greenDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#22c55e' },
    statusTxt: { color: c.muted, fontSize: 12, fontWeight: '700' },
    menuBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    menuTxt: { color: c.text, fontSize: 22, marginTop: -4 },

    banner: {
      marginTop: 12,
      backgroundColor: '#f59e0b',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
    },
    bannerTitle: { color: '#0b1220', fontWeight: '900', fontSize: 14 },
    bannerSub: { color: '#0b1220', fontWeight: '700', fontSize: 12, marginTop: 2, opacity: 0.9 },

    playlistCard: {
      marginTop: 12,
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 10,
      maxHeight: 210,
    },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.04)',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    rowItemActive: {
      borderColor: 'rgba(245,158,11,0.55)',
      backgroundColor: 'rgba(245,158,11,0.12)',
    },
    thumb: { width: 44, height: 44, borderRadius: 12 },
    thumbPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { color: c.text, fontWeight: '800' },
    rowMeta: { color: c.muted, marginTop: 2, fontSize: 12, fontWeight: '700' },
    trashBtn: { padding: 6, borderRadius: 10 },
    trashTxt: { fontSize: 16, opacity: 0.9 },

    playerCard: {
      marginTop: 12,
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
      flex: 1,
    },
    videoBox: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    video: { width: '100%', height: 220 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    timeTxt: { color: c.muted, fontWeight: '800' },

    controlsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 12 },
    ctrlBtn: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    ctrlTxt: { color: c.text, fontSize: 22, fontWeight: '900' },
    playBtn: {
      width: 76,
      height: 76,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f59e0b',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.15)',
    },
    playTxt: { color: '#0b1220', fontSize: 28, fontWeight: '900', marginLeft: 2 },

    bottomRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14 },
    pill: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    pillActive: {
      backgroundColor: 'rgba(245,158,11,0.16)',
      borderColor: 'rgba(245,158,11,0.45)',
    },
    pillIcon: { color: c.text, fontWeight: '900' },
    pillTxt: { color: c.text, fontWeight: '900' },
    pillTxtActive: { color: '#f59e0b' },

    emptyTxt: { color: c.muted, fontWeight: '700', textAlign: 'center' },
    loadingTxt: { color: c.muted, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  });
}
