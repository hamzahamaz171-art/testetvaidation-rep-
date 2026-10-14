import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  AppState,
  Animated,
} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';
import {
  fetchLatestScreenRow,
  fetchRobotNamesFromScreens,
  screenRowBatteryPercent,
  screenRowTemp,
  displayRobotName,
  subscribeScreensRealtime,
} from '../supabase/screens';
import { playNotificationAlertSound } from '../services/playNotificationAlertSound';

export default function WelcomeScreen({ navigation }) {
  const c = useThemeColors();
  const isDark = c.text === '#E6EDFF';
  const styles = makeStyles(c, isDark);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reactions, setReactions] = useState({ like: 0, dislike: 0, funny: 0, love: 0 });
  const [userId, setUserId] = useState(null);

  const [temperatureC, setTemperatureC] = useState(null);
  const [temperatureStatus, setTemperatureStatus] = useState('—');
  const [activeScreen, setActiveScreen] = useState(null);

  const [robotList, setRobotList] = useState([]);
  const [robotsLoading, setRobotsLoading] = useState(true);
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [robotPickerVisible, setRobotPickerVisible] = useState(false);

  // PIN modal
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  // In-app notification bar (top, like messenger)
  const [inAppAlert, setInAppAlert] = useState(null);
  const inAppAlertY = useRef(new Animated.Value(-120)).current;
  const inAppAlertHideTimerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const u = sessionData?.session?.user;
        if (!u) return;

        setUserId(u.id);
        setEmail(u.email || '');

        const { data, error } = await supabase
          .from('profiles')
          .select('first_name,last_name,email')
          .eq('id', u.id)
          .single();

        if (!error && data) {
          const full = `${data.first_name || ''} ${data.last_name || ''}`.trim();
          setName(full);
          if (!u.email && data.email) setEmail(data.email);
        }
      } catch (e) {
        // ignore
      }
    };
    load();
  }, []);

  const refreshReactionCounts = async (uid = userId) => {
    try {
      if (!uid) return;
      const { data, error } = await supabase
        .from('reactions_events')
        .select('reaction_type,count')
        .eq('user_id', uid);

      if (error) return;

      const counts = { like: 0, dislike: 0, funny: 0, love: 0 };
      (data || []).forEach((row) => {
        const k = row.reaction_type;
        if (counts[k] !== undefined) counts[k] += Number(row.count || 0);
      });
      setReactions(counts);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (userId) refreshReactionCounts(userId);
  }, [userId]);

  // Liste des robots (colonne `screens.robot`) + mise à jour si la table change
  useEffect(() => {
    let cancelled = false;

    const loadRobots = async () => {
      setRobotsLoading(true);
      try {
        const { names, error } = await fetchRobotNamesFromScreens();
        if (cancelled) return;
        if (error) {
          setRobotList([]);
          return;
        }
        setRobotList(names);
        setSelectedRobot((prev) => {
          if (prev && names.includes(prev)) return prev;
          return names[0] ?? null;
        });
      } finally {
        if (!cancelled) setRobotsLoading(false);
      }
    };

    loadRobots();

    const unsubscribe = subscribeScreensRealtime(loadRobots, 'welcome-robot-list');

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Données batterie / température : fetch + realtime (les UPDATE envoient souvent une ligne partielle sans robot/nom — on refetch la dernière ligne pour ce robot)
  useEffect(() => {
    let alive = true;
    let debounceTimer = null;

    const computeStatus = (t) => {
      if (t === null || t === undefined || !Number.isFinite(Number(t))) return '—';
      const x = Number(t);
      if (x < 5) return 'Froid';
      if (x > 45) return 'Très chaud';
      if (x > 35) return 'Chaud';
      return 'Normal';
    };

    const applyScreenRow = (row) => {
      // Supabase Realtime peut envoyer une ligne partielle selon l'UPDATE.
      // Si `temperature-carte` n'est pas présent dans le payload, on garde
      // l'ancienne valeur locale jusqu'au refetch complet.
      if (!row) {
        setActiveScreen(null);
        setTemperatureC(null);
        setTemperatureStatus(computeStatus(null));
        return;
      }

      setActiveScreen((previous) => {
        const mergedRow = { ...(previous || {}), ...row };
        const t = screenRowTemp(mergedRow);
        const n = t === null || t === undefined ? null : Number(t);
        setTemperatureC(Number.isFinite(n) ? n : null);
        setTemperatureStatus(computeStatus(n));
        return mergedRow;
      });
    };

    const loadScreen = async () => {
      if (!selectedRobot) {
        if (alive) {
          applyScreenRow(null);
        }
        return;
      }
      try {
        const { data, error } = await fetchLatestScreenRow({ robotName: selectedRobot });
        if (error || !alive) return;
        applyScreenRow(data || null);
      } catch (e) {
        // ignore
      }
    };

    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadScreen();
      }, 200);
    };

    const realtimeMaybeForSelectedRobot = (payload) => {
      if (!alive || !selectedRobot) return;

      if (payload?.eventType === 'DELETE') {
        scheduleReload();
        return;
      }

      const row = payload?.new;
      const oldRow = payload?.old && typeof payload.old === 'object' ? payload.old : null;

      if (!row || typeof row !== 'object') {
        scheduleReload();
        return;
      }

      const rRobot = row.robot != null ? String(row.robot).trim() : '';
      const rNom = row.nom != null ? String(row.nom).trim() : '';
      const oRobot = oldRow?.robot != null ? String(oldRow.robot).trim() : '';
      const oNom = oldRow?.nom != null ? String(oldRow.nom).trim() : '';
      const hasRobotIdentity = !!(rRobot || rNom || oRobot || oNom);

      if (hasRobotIdentity) {
        const isMatch =
          rRobot === selectedRobot ||
          rNom === selectedRobot ||
          oRobot === selectedRobot ||
          oNom === selectedRobot;
        if (!isMatch) return;

        // Mise à jour immédiate avec la ligne reçue en realtime.
        // Comme ça batterie/température changent vite dans l'accueil.
        applyScreenRow(row);

        // Petit refetch de sécurité pour rester aligné avec Supabase.
        scheduleReload();
        return;
      }

      // Si le payload realtime ne contient pas robot/nom, on recharge rapidement.
      scheduleReload();
    };

    loadScreen();

    const unsubscribe = subscribeScreensRealtime(
      realtimeMaybeForSelectedRobot,
      `welcome-screen-${selectedRobot || 'none'}`
    );

    // Fallback rapide : si Supabase Realtime est lent/désactivé,
    // l'accueil se rafraîchit quand même automatiquement toutes les 2 secondes.
    const pollingTimer = setInterval(() => {
      if (alive && selectedRobot) loadScreen();
    }, 2000);

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && selectedRobot) scheduleReload();
    });

    let onVis = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVis = () => {
        if (document.visibilityState === 'visible' && selectedRobot) scheduleReload();
      };
      document.addEventListener('visibilitychange', onVis);
    }

    return () => {
      alive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollingTimer);
      unsubscribe();
      appSub.remove();
      if (onVis) document.removeEventListener('visibilitychange', onVis);
    };
  }, [selectedRobot]);

  const showInAppAlert = (title, body, level = 'warning') => {
    if (inAppAlertHideTimerRef.current) {
      clearTimeout(inAppAlertHideTimerRef.current);
      inAppAlertHideTimerRef.current = null;
    }
    setInAppAlert({ title, body, level, at: Date.now() });
    Animated.sequence([
      Animated.timing(inAppAlertY, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(inAppAlertY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setInAppAlert(null);
    });
    inAppAlertHideTimerRef.current = setTimeout(() => {
      inAppAlertHideTimerRef.current = null;
      setInAppAlert(null);
    }, 3600);
  };

  const alertSoundInitRef = useRef(false);
  const alertSoundPrevRef = useRef({ highTemp: false, lowBattery: false });
  const alertSoundRobotRef = useRef(selectedRobot);

  useEffect(() => {
    return () => {
      if (inAppAlertHideTimerRef.current) clearTimeout(inAppAlertHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (alertSoundRobotRef.current !== selectedRobot) {
      alertSoundRobotRef.current = selectedRobot;
      alertSoundInitRef.current = false;
    }
    if (!selectedRobot || !activeScreen) return;
    const rRobot = activeScreen.robot != null ? String(activeScreen.robot).trim() : '';
    const rNom = activeScreen.nom != null ? String(activeScreen.nom).trim() : '';
    if (rRobot !== selectedRobot && rNom !== selectedRobot) return;

    const t = screenRowTemp(activeScreen);
    const pct = screenRowBatteryPercent(activeScreen);
    const highTemp = t != null && Number.isFinite(Number(t)) && Number(t) > 35;
    const lowBattery = pct != null && Number.isFinite(Number(pct)) && Number(pct) < 20;

    if (!alertSoundInitRef.current) {
      alertSoundInitRef.current = true;
      alertSoundPrevRef.current = { highTemp, lowBattery };
      return;
    }
    const prev = alertSoundPrevRef.current;
    const becameHighTemp = !prev.highTemp && highTemp;
    const becameLowBattery = !prev.lowBattery && lowBattery;

    if (becameHighTemp || becameLowBattery) {
      void playNotificationAlertSound();
      if (highTemp && lowBattery) {
        showInAppAlert(
          'Alerte critique',
          `Température ${Math.round(Number(t))}°C et batterie ${Number(pct).toFixed(0)}% sur ${selectedRobot}.`,
          'critical'
        );
      } else if (becameHighTemp) {
        showInAppAlert(
          'Température élevée',
          `La température a dépassé 35°C (${Math.round(Number(t))}°C) sur ${selectedRobot}.`,
          'critical'
        );
      } else {
        showInAppAlert(
          'Batterie faible',
          `La batterie est passée sous 20% (${Number(pct).toFixed(0)}%) sur ${selectedRobot}.`,
          'warning'
        );
      }
    }
    alertSoundPrevRef.current = { highTemp, lowBattery };
  }, [activeScreen, selectedRobot]);

  const onLogout = async () => {
    await supabase.auth.signOut();
  };

  const openPlaylistWithPin = () => {
    setPin('');
    setPinError('');
    setPinModal(true);
  };

  const submitPin = () => {
    const v = String(pin || '').trim();
    if (v !== '0000') {
      setPinError('Code PIN incorrect');
      return;
    }
    setPinModal(false);
    navigation.navigate('Playlist');
  };

  const displayRobot = displayRobotName(activeScreen, selectedRobot || '—');
  const batteryPct = screenRowBatteryPercent(activeScreen);
  const screenNavParams = {
    screenId: activeScreen?.id,
    robotName: selectedRobot || displayRobot,
  };

  const positionLabel = useMemo(() => {
    if (!activeScreen) return null;
    const addr = activeScreen.address && String(activeScreen.address).trim();
    if (addr) return addr;
    const lat = activeScreen.latitude;
    const lon = activeScreen.longitude;
    if (lat != null && lon != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
      return `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
    }
    return null;
  }, [activeScreen]);

  const onPickRobot = (name) => {
    setSelectedRobot(name);
    setRobotPickerVisible(false);
  };

  const openAdsStatusForRobot = (robotName) => {
    setRobotPickerVisible(false);
    navigation?.navigate?.('AdsStatus', { robotName });
  };

  const cards = useMemo(
    () => [
      {
        title: 'Batterie',
        value: batteryPct == null ? '—' : `${batteryPct}%`,
        icon: '🔋',
        footer:
          batteryPct == null
            ? '—'
            : batteryPct <= 20
              ? 'Faible'
              : batteryPct >= 99
                ? 'Chargée'
                : 'En charge',
      },
      {
        title: 'Température',
        value: temperatureC === null ? '—' : `${Math.round(temperatureC)}°C`,
        icon: '🌡️',
        footer: temperatureStatus,
      },
      { title: 'Connecté', value: 'Wi-Fi', icon: '📶', footer: 'Stable' },
      { title: 'Notifications', icon: '🔔', footer: 'Nouveaux' },
    ],
    [temperatureC, temperatureStatus, batteryPct]
  );

  const openBatteryDetails = () => navigation?.navigate?.('BatteryDetails', screenNavParams);
  const openTemperatureDetails = () => navigation?.navigate?.('TemperatureDetails', screenNavParams);
  const openReactionsQR = () =>
    navigation?.navigate?.('ReactionsQR', { robotName: selectedRobot || displayRobot });
  const openNotificationsDetails = () => navigation?.navigate?.('NotificationsDetails', screenNavParams);

  return (
    <GradientBackground>
      {inAppAlert ? (
        <Animated.View
          style={[
            styles.inAppAlertWrap,
            { transform: [{ translateY: inAppAlertY }] },
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.inAppAlertCard,
              inAppAlert.level === 'critical'
                ? styles.inAppAlertCritical
                : styles.inAppAlertWarning,
            ]}
          >
            <View style={styles.inAppAlertDot} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.inAppAlertTitle} numberOfLines={1}>{inAppAlert.title}</Text>
              <Text style={styles.inAppAlertBody} numberOfLines={2}>{inAppAlert.body}</Text>
            </View>
            <TouchableOpacity
              style={styles.inAppAlertClose}
              onPress={() => {
                Animated.timing(inAppAlertY, {
                  toValue: -120,
                  duration: 180,
                  useNativeDriver: true,
                }).start(() => setInAppAlert(null));
              }}
            >
              <Text style={styles.inAppAlertCloseText}>×</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: 30 }]}
        showsVerticalScrollIndicator
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <TouchableOpacity
              style={styles.robotTitleBtn}
              onPress={() => !robotsLoading && setRobotPickerVisible(true)}
              activeOpacity={0.85}
              disabled={robotsLoading}
            >
              <Text style={styles.appTitle} numberOfLines={1}>
                {robotsLoading ? '…' : selectedRobot || 'Choisir un robot'}
              </Text>
              {!robotsLoading ? <Text style={styles.robotTitleChevron}> ▼</Text> : null}
            </TouchableOpacity>

            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>En service</Text>
            </View>

            {!!positionLabel && (
              <Text style={styles.positionHint} numberOfLines={2}>
                📍 {positionLabel}
              </Text>
            )}

            {!!name && <Text style={styles.subText}>Salut {name}!</Text>}
            {!!email && <Text style={styles.subTextMuted}>Connecté en tant que: {email}</Text>}
          </View>

          <Image source={require('../../assets/robot.png')} style={styles.robot} resizeMode="contain" />
        </View>

        {/* Cards */}
        <View style={styles.grid}>
          {cards.map((card) => (
            <View key={card.title} style={styles.card}>
              {card.title === 'Batterie' && (
                <TouchableOpacity style={styles.sectionDetailsBtn} onPress={openBatteryDetails} activeOpacity={0.9}>
                  <Text style={styles.sectionDetailsText}>Details</Text>
                </TouchableOpacity>
              )}
              {card.title === 'Température' && (
                <TouchableOpacity style={styles.sectionDetailsBtn} onPress={openTemperatureDetails} activeOpacity={0.9}>
                  <Text style={styles.sectionDetailsText}>Details</Text>
                </TouchableOpacity>
              )}
              {card.title === 'Notifications' && (
                <TouchableOpacity style={styles.sectionDetailsBtn} onPress={openNotificationsDetails} activeOpacity={0.9}>
                  <Text style={styles.sectionDetailsText}>Voir notifications</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardIcon}>{card.icon}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
              <Text style={styles.cardFooter}>{card.footer}</Text>
            </View>
          ))}
        </View>

        {/* Admin */}
        <View style={{ marginTop: 18 }}>
          <Text style={styles.sectionTitle}>Administration</Text>
          <TouchableOpacity style={styles.reactBtn} onPress={openPlaylistWithPin} activeOpacity={0.9}>
            <Text style={styles.reactBtnText}>Contrôler Playlist (PIN)</Text>
          </TouchableOpacity>
        </View>

        {/* Reactions */}
        <View style={{ marginTop: 18 }}>
          <Text style={styles.sectionTitle}>Réactions Rapides</Text>
          <TouchableOpacity style={styles.reactBtn} onPress={openReactionsQR} activeOpacity={0.9}>
            <Text style={styles.reactBtnText}>Réagir</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sélecteur de robot */}
      <Modal
        visible={robotPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRobotPickerVisible(false)}
      >
        <Pressable style={styles.pinOverlay} onPress={() => setRobotPickerVisible(false)}>
          <Pressable style={styles.robotPickerCard} onPress={() => {}}>
            <Text style={styles.pinTitle}>Choisir un robot</Text>
            <Text style={styles.pinSubtitle}>Données issues de Supabase (table screens)</Text>
            {robotsLoading ? (
              <View style={styles.robotPickerLoading}>
                <ActivityIndicator color={c.orange} />
              </View>
            ) : robotList.length === 0 ? (
              <Text style={styles.robotPickerEmpty}>Aucun robot trouvé.</Text>
            ) : (
              <ScrollView style={styles.robotPickerList} keyboardShouldPersistTaps="handled">
                {robotList.map((r) => (
                  <View
                    key={r}
                    style={[styles.robotPickerRow, selectedRobot === r && styles.robotPickerRowActive]}
                  >
                    <TouchableOpacity
                      style={styles.robotPickerNameZone}
                      onPress={() => onPickRobot(r)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[styles.robotPickerRowText, selectedRobot === r && styles.robotPickerRowTextActive]}
                        numberOfLines={1}
                      >
                        {r}
                      </Text>
                      {selectedRobot === r ? <Text style={styles.robotPickerCheck}>✓</Text> : null}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.robotPickerAdsBtn}
                      onPress={() => openAdsStatusForRobot(r)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.robotPickerAdsText}>ADS</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={styles.robotPickerClose} onPress={() => setRobotPickerVisible(false)}>
              <Text style={styles.robotPickerCloseText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ✅ Modern PIN modal */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <Pressable style={styles.pinOverlay} onPress={() => setPinModal(false)}>
          <Pressable style={styles.pinCard} onPress={() => {}}>
            <Text style={styles.pinTitle}>Code PIN</Text>
            <Text style={styles.pinSubtitle}>Accès réservé à l’administration</Text>

            <View style={styles.pinInputWrap}>
              <TextInput
                value={pin}
                onChangeText={(t) => {
                  setPin(t);
                  if (pinError) setPinError('');
                }}
                placeholder="0000"
                placeholderTextColor={c.muted}
                keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                secureTextEntry
                maxLength={8}
                style={styles.pinInput}
                autoFocus
              />
            </View>

            {!!pinError && <Text style={styles.pinError}>{pinError}</Text>}

            <View style={styles.pinActions}>
              <Pressable onPress={() => setPinModal(false)} style={styles.pinBtnGhost}>
                <Text style={styles.pinBtnGhostTxt}>Annuler</Text>
              </Pressable>
              <Pressable onPress={submitPin} style={styles.pinBtn}>
                <Text style={styles.pinBtnTxt}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </GradientBackground>
  );
}

const makeStyles = (c, isDark) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    inAppAlertWrap: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 54 : 18,
      left: 12,
      right: 12,
      zIndex: 9999,
    },
    inAppAlertCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    inAppAlertWarning: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.22)' : 'rgba(245,158,11,0.16)',
      borderColor: isDark ? 'rgba(245,158,11,0.60)' : 'rgba(180,83,9,0.38)',
    },
    inAppAlertCritical: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.14)',
      borderColor: isDark ? 'rgba(248,113,113,0.65)' : 'rgba(185,28,28,0.40)',
    },
    inAppAlertDot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: c.orange,
      marginRight: 10,
      marginTop: 2,
    },
    inAppAlertTitle: {
      color: c.text,
      fontWeight: '900',
      fontSize: 13,
    },
    inAppAlertBody: {
      color: c.text,
      opacity: 0.9,
      marginTop: 2,
      fontWeight: '600',
      fontSize: 12,
      lineHeight: 16,
    },
    inAppAlertClose: {
      marginLeft: 10,
      width: 26,
      height: 26,
      borderRadius: 13,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,30,58,0.10)',
    },
    inAppAlertCloseText: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: -2,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    headerTextCol: {
      flex: 1,
      minWidth: 0,
      paddingRight: 8,
    },
    robotTitleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    appTitle: {
      color: c.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    robotTitleChevron: {
      color: c.orange,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 4,
    },
    positionHint: {
      color: c.muted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 8,
      maxWidth: 220,
      lineHeight: 16,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: '#3ddc84',
      marginRight: 8,
    },
    statusText: {
      color: c.text,
      opacity: 0.9,
      fontWeight: '700',
    },
    subText: {
      color: c.text,
      opacity: 0.9,
      marginTop: 10,
      fontWeight: '700',
    },
    subTextMuted: {
      color: c.muted,
      marginTop: 4,
      maxWidth: 260,
    },
    robot: {
      width: 130,
      height: 170,
      marginLeft: 10,
    },

    grid: {
      marginTop: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    card: {
      width: '48%',
      backgroundColor: 'rgba(0,0,0,0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
      minHeight: 112,
    },
    cardTitle: {
      color: c.text,
      opacity: 0.9,
      fontWeight: '800',
    },
    cardIcon: {
      fontSize: 22,
      marginTop: 10,
    },
    cardValue: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 6,
    },
    cardFooter: {
      color: c.muted,
      marginTop: 4,
      fontWeight: '700',
    },

    sectionTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '900',
      marginBottom: 10,
    },

    sectionDetailsBtn: {
      backgroundColor: 'rgba(255, 140, 0, 0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255, 140, 0, 0.45)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      alignSelf: 'flex-start',
    },
    sectionDetailsText: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 12,
    },

    reactBtn: {
      backgroundColor: 'rgba(255, 140, 0, 0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255, 140, 0, 0.45)',
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: 'center',
    },
    reactBtnText: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 16,
    },

    logoutBtn: {
      marginTop: 18,
      backgroundColor: c.orange,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: 'center',
    },
    logoutText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 16,
    },

    // ✅ PIN modal styles
    pinOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pinCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,30,58,0.14)',
      borderRadius: 22,
      padding: 18,
    },
    pinTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
    },
    pinSubtitle: {
      color: c.muted,
      marginTop: 6,
      fontWeight: '700',
    },
    pinInputWrap: {
      marginTop: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 140, 0, 0.35)' : 'rgba(245, 158, 11, 0.45)',
      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(15,30,58,0.05)',
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'web' ? 10 : 6,
    },
    pinInput: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 6,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'android' ? 'monospace' : 'monospace',
      paddingVertical: 6,
      outlineStyle: 'none', // web
    },
    pinError: {
      marginTop: 10,
      color: '#ff6b6b',
      fontWeight: '900',
    },
    pinActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 16,
    },
    pinBtnGhost: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,30,58,0.14)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,58,0.04)',
    },
    pinBtnGhostTxt: {
      color: c.text,
      fontWeight: '900',
    },
    pinBtn: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: c.orange,
    },
    pinBtnTxt: {
      color: '#071428',
      fontWeight: '900',
    },

    robotPickerCard: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '70%',
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,58,0.14)',
      borderRadius: 22,
      padding: 18,
    },
    robotPickerLoading: {
      paddingVertical: 28,
      alignItems: 'center',
    },
    robotPickerEmpty: {
      color: c.muted,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    robotPickerList: {
      marginTop: 14,
      maxHeight: 320,
    },
    robotPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 14,
      marginBottom: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,58,0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,58,0.10)',
    },
    robotPickerNameZone: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingRight: 10,
    },
    robotPickerAdsBtn: {
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.55)' : 'rgba(245,158,11,0.70)',
      backgroundColor: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.14)',
    },
    robotPickerAdsText: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 12,
      letterSpacing: 0.4,
    },
    robotPickerRowActive: {
      borderColor: 'rgba(255, 140, 0, 0.55)',
      backgroundColor: 'rgba(255, 140, 0, 0.12)',
    },
    robotPickerRowText: {
      color: c.text,
      fontWeight: '800',
      fontSize: 16,
      flex: 1,
      marginRight: 8,
    },
    robotPickerRowTextActive: {
      color: c.orange,
    },
    robotPickerCheck: {
      color: c.orange,
      fontWeight: '900',
      fontSize: 16,
    },
    robotPickerClose: {
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,58,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,58,0.14)',
      alignItems: 'center',
    },
    robotPickerCloseText: {
      color: c.text,
      fontWeight: '900',
    },
  });
