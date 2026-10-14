import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';
import {
  fetchLatestScreenRow,
  screenRowBatteryPercent,
  screenRowTemp,
  displayRobotName,
  subscribeScreensRealtime,
} from '../supabase/screens';
import { sendInterventionSmsClient } from '../services/twilioInterventionSms';
import { playNotificationAlertSound } from '../services/playNotificationAlertSound';
import { useThemedPopup } from '../components/useThemedPopup';

const INTERVENTION_EMAIL_TO = 'hamzahamaz171@gmail.com';

function PillTab({ styles, active, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function NotificationsDetailsScreen({ navigation, route }) {
  const c = useThemeColors();
  const popup = useThemedPopup();
  const isDark = c.text === '#E6EDFF';

  const screenId = route?.params?.screenId;
  const robotName = route?.params?.robotName ?? 'AdBot R1';
  const scope = { screenId, robotName };

  const COLORS = {
    bg1: c.bg,
    card: c.card,
    card2: c.card2,
    text: c.text,
    muted: c.muted,
    orange: c.orange,
    blue: c.blue,
    red: c.danger,
    green: '#22c55e',
    isDark,
  };
  const styles = makeStyles(COLORS);

  const [tab, setTab] = useState('all'); // 'all' | 'critical'
  const [notifications, setNotifications] = useState([]);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionModalTitle, setActionModalTitle] = useState('');
  const [actionModalKey, setActionModalKey] = useState(null);
  const [latestScreenRow, setLatestScreenRow] = useState(null);

  const [onsiteModalVisible, setOnsiteModalVisible] = useState(false);
  const [onsiteLocation, setOnsiteLocation] = useState('');
  const [onsitePhone, setOnsitePhone] = useState('');
  const [onsiteSending, setOnsiteSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  // persist dismissed keys so they don't re-appear on each refresh
  const [dismissed, setDismissed] = useState({}); // { key: true }
  const dismissedRef = useRef({});
  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  const notificationsSoundReadyRef = useRef(false);
  const prevNotificationKeysRef = useRef(new Set());

  // --- helpers
  const formatTs = (d) => {
    try {
      return `Aujourd'hui, ${d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return "Aujourd'hui";
    }
  };

  const dismissOne = (key) => {
    setDismissed((prev) => ({ ...prev, [key]: true }));
    setNotifications((prev) => prev.filter((n) => n.key !== key));
  };

  const clearAll = () => {
    setDismissed((prev) => {
      const next = { ...prev };
      notifications.forEach((n) => {
        next[n.key] = true;
      });
      return next;
    });
    setNotifications([]);
  };

  const refreshNotifications = async () => {
    try {
      const { data: screenRow, error: screenErr } = await fetchLatestScreenRow(scope);

      let latestTemp = null;
      let latestBattery = null;

      if (!screenErr && screenRow) {
        setLatestScreenRow(screenRow);
        const t = screenRowTemp(screenRow);
        const tTime = screenRow.created_at ? new Date(screenRow.created_at) : new Date();
        if (t != null && Number.isFinite(t)) {
          latestTemp = { value: t, time: tTime };
        }

        const pct = screenRowBatteryPercent(screenRow);
        const bTime = screenRow.created_at ? new Date(screenRow.created_at) : new Date();
        latestBattery = {
          percent: pct,
          time: bTime,
        };
      } else {
        setLatestScreenRow(null);
      }

      // allow notif to re-appear when condition stops then comes back later
      setDismissed((prev) => {
        const next = { ...prev };
        if (!(latestTemp && latestTemp.value > 35)) delete next.temp_high;
        if (
          !(latestBattery && latestBattery.percent != null && latestBattery.percent < 20)
        ) {
          delete next.battery_low;
        }
        if (
          !(latestBattery && latestBattery.percent != null && latestBattery.percent >= 99)
        ) {
          delete next.battery_full;
        }
        return next;
      });

      const now = new Date();
      const list = [];
      const d = dismissedRef.current || {};

      // Temp high
      if (latestTemp && latestTemp.value > 35 && !d.temp_high) {
        list.push({
          key: 'temp_high',
          id: 'temp_high',
          ts: formatTs(latestTemp.time || now),
          title: 'Température élevée',
          body: `La température actuelle du robot est élevée : ${Math.round(
            latestTemp.value
          )}°C. Vérifiez qu'il n'est pas dans un endroit chaud et bien ventilé.`,
          level: 'critical',
          action: 'ACTIONS',
        });
      }

      // Battery low
      if (
        latestBattery &&
        latestBattery.percent != null &&
        latestBattery.percent < 20 &&
        !d.battery_low
      ) {
        list.push({
          key: 'battery_low',
          id: 'battery_low',
          ts: formatTs(latestBattery.time || now),
          title: 'Batterie faible',
          body: `Le niveau de batterie du robot est à ${latestBattery.percent}%.`,
          level: 'warning',
          action: 'RECHARGER',
        });
      }

      // Battery full (no OK button)
      if (
        latestBattery &&
        latestBattery.percent != null &&
        latestBattery.percent >= 99 &&
        !d.battery_full
      ) {
        list.push({
          key: 'battery_full',
          id: 'battery_full',
          ts: formatTs(latestBattery.time || now),
          title: 'Recharge terminée',
          body:
            'La batterie du robot est chargée à 100%. Le robot est prêt pour sa prochaine tâche.',
          level: 'ok',
          action: null,
        });
      }

      const nextKeys = new Set(list.map((n) => n.key));
      if (notificationsSoundReadyRef.current) {
        const hasNew = list.some((n) => !prevNotificationKeysRef.current.has(n.key));
        if (hasNew) {
          void playNotificationAlertSound();
        }
      } else {
        notificationsSoundReadyRef.current = true;
      }
      prevNotificationKeysRef.current = nextKeys;

      setNotifications(list);
    } catch (e) {
      console.log('refreshNotifications error', e);
    }
  };

  // ✅ Envoi automatique via Supabase Edge Function
  const sendRechargeEmail = async () => {
    try {
      const to = INTERVENTION_EMAIL_TO;
      const nameForMail = displayRobotName(latestScreenRow, robotName);
      const subject = `AdBot — Batterie faible (${nameForMail})`;
      const message =
        `Bonjour,\n\n` +
        `Le robot ${nameForMail} a une batterie faible.\n` +
        `Veuillez le recharger.\n\n` +
        `Merci.`;

      // 1) Récupérer le token (JWT)
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessErr) console.log('getSession error:', sessErr);

      if (!accessToken) {
        await popup.alert('Erreur', "Vous n'êtes pas connecté. Veuillez vous reconnecter.");
        return;
      }

      // 2) Invoke avec Authorization header
      const { data, error } = await supabase.functions.invoke('send-recharge-email', {
        body: { to, subject, message },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('send-recharge-email response:', { data, error });

      if (error) {
        await popup.alert('Erreur', `Email non envoyé.\n${error.message ?? ''}`);
        return;
      }

      if (!data?.ok) {
        await popup.alert('Erreur', `Email non envoyé.\n${data?.error ?? ''}`);
        return;
      }

      await popup.alert('✅ Envoyé', `Email envoyé à ${to}`);
    } catch (e) {
      console.log('sendRechargeEmail error', e);
      await popup.alert('Erreur', 'Email non envoyé.');
    }
  };

  /** Intervention en ligne (alerte température) — même Edge Function Resend que la recharge. */
  const sendInterventionOnlineEmail = async () => {
    try {
      setEmailSending(true);
      const nameForMail = displayRobotName(latestScreenRow, robotName);
      const temp = screenRowTemp(latestScreenRow);
      const subject = `AdBot — Intervention en ligne (température) — ${nameForMail}`;
      let message =
        `Bonjour,\n\n` +
        `Une intervention en ligne a été demandée depuis l'application suite à une alerte de température élevée.\n\n` +
        `Robot : ${nameForMail}\n`;
      if (temp != null && Number.isFinite(temp)) {
        message += `Température relevée : ${Math.round(temp)}°C\n`;
      }
      if (latestScreenRow?.address) {
        message += `Adresse (écran) : ${latestScreenRow.address}\n`;
      }
      if (latestScreenRow?.latitude != null && latestScreenRow?.longitude != null) {
        message += `Position : ${latestScreenRow.latitude}, ${latestScreenRow.longitude}\n`;
      }
      message += `\nMerci de traiter cette demande.\n`;

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessErr) console.log('getSession error:', sessErr);
      if (!accessToken) {
        await popup.alert('Erreur', "Vous n'êtes pas connecté. Veuillez vous reconnecter.");
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-recharge-email', {
        body: { to: INTERVENTION_EMAIL_TO, subject, message },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        await popup.alert('Erreur', `Email non envoyé.\n${error.message ?? ''}`);
        return;
      }
      if (!data?.ok) {
        await popup.alert('Erreur', `Email non envoyé.\n${data?.error ?? ''}`);
        return;
      }

      closeActionModal();
      await popup.alert('✅ Envoyé', `Demande d’intervention en ligne envoyée à ${INTERVENTION_EMAIL_TO}`);
    } catch (e) {
      console.log('sendInterventionOnlineEmail error', e);
      await popup.alert('Erreur', "Impossible d'envoyer l'email.");
    } finally {
      setEmailSending(false);
    }
  };

  const openOnsiteForm = () => {
    setOnsiteLocation('');
    setOnsitePhone('');
    closeActionModal();
    setOnsiteModalVisible(true);
  };

  const closeOnsiteModal = () => {
    if (onsiteSending) return;
    setOnsiteModalVisible(false);
    setOnsiteLocation('');
    setOnsitePhone('');
  };

  const submitOnsiteIntervention = async () => {
    const loc = String(onsiteLocation || '').trim();
    const phone = String(onsitePhone || '').trim();
    if (!loc) {
      await popup.alert('Champ requis', 'Indiquez la localisation du robot.');
      return;
    }
    if (!phone) {
      await popup.alert('Champ requis', 'Indiquez le numéro de contact.');
      return;
    }

    try {
      setOnsiteSending(true);

      const nameForMail = displayRobotName(latestScreenRow, robotName);
      const temp = screenRowTemp(latestScreenRow);

      const result = await sendInterventionSmsClient({
        robotName: nameForMail,
        location: loc,
        contactPhone: phone,
        temperatureC: temp,
        alertTitle: 'Température élevée',
      });

      if (!result.ok) {
        await popup.alert(
          'Erreur',
          `SMS non envoyé.\n${result.error}${result.details ? `\n${result.details}` : ''}`
        );
        return;
      }

      setOnsiteModalVisible(false);
      setOnsiteLocation('');
      setOnsitePhone('');
      await popup.alert('✅ Envoyé', 'SMS d’intervention sur place envoyé.');
    } catch (e) {
      console.log('submitOnsiteIntervention error', e);
      await popup.alert('Erreur', 'Impossible d’envoyer le SMS.');
    } finally {
      setOnsiteSending(false);
    }
  };

  useEffect(() => {
    refreshNotifications();
    const unsubscribe = subscribeScreensRealtime(
      refreshNotifications,
      `notifications-${screenId || robotName || 'all'}`
    );
    return () => unsubscribe();
  }, [screenId, robotName]);

  const filtered = useMemo(() => {
    if (tab === 'critical') {
      return notifications.filter((x) => x.level === 'critical' || x.level === 'warning');
    }
    return notifications;
  }, [notifications, tab]);

  const total = notifications.length;

  const onPressAction = (n) => {
    if (!n) return;

    // 1) ACTIONS => open the intervention modal (temperature)
    if (n.key === 'temp_high') {
      setActionModalKey(n.key);
      setActionModalTitle(n.title || 'Température élevée');
      setActionModalVisible(true);
      return;
    }

    // 2) RECHARGER => send email
    if (n.key === 'battery_low') {
      sendRechargeEmail();
      return;
    }
  };

  const closeActionModal = () => {
    setActionModalVisible(false);
    setActionModalKey(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bg} />
      {popup.renderPopup}

      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choisir une intervention</Text>
            <View style={styles.modalSubtitleRow}>
              <Ionicons name="warning" size={16} color={COLORS.orange} />
              <Text style={styles.modalSubtitle}>{actionModalTitle}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.modalBtnPrimary, emailSending && styles.modalBtnDisabled]}
              onPress={sendInterventionOnlineEmail}
              disabled={emailSending}
            >
              {emailSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="laptop-outline" size={18} color="#fff" />
              )}
              <Text style={styles.modalBtnTextPrimary}>
                {emailSending ? 'Envoi…' : 'Intervention en ligne'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.modalBtnAccent}
              onPress={openOnsiteForm}
              disabled={emailSending}
            >
              <Ionicons name="location-outline" size={18} color="#111827" />
              <Text style={styles.modalBtnTextAccent}>Intervention sur place</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.modalBtnCancel}
              onPress={closeActionModal}
            >
              <Text style={styles.modalBtnTextCancel}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={onsiteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeOnsiteModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.onsiteCard}>
            <Text style={styles.modalTitle}>Intervention sur place</Text>
            <Text style={styles.onsiteHint}>
              Renseignez la localisation du robot et un numéro de contact. Un SMS sera envoyé avec ces informations.
            </Text>

            <Text style={styles.onsiteLabel}>Localisation du robot *</Text>
            <TextInput
              style={styles.onsiteInput}
              value={onsiteLocation}
              onChangeText={setOnsiteLocation}
              placeholder="Adresse, zone, repère…"
              placeholderTextColor={COLORS.muted}
              editable={!onsiteSending}
            />

            <Text style={styles.onsiteLabel}>Numéro de contact *</Text>
            <TextInput
              style={styles.onsiteInput}
              value={onsitePhone}
              onChangeText={setOnsitePhone}
              placeholder="+212… ou 06…"
              placeholderTextColor={COLORS.muted}
              keyboardType="phone-pad"
              editable={!onsiteSending}
            />

            <TouchableOpacity
              style={[styles.modalBtnPrimary, onsiteSending && styles.modalBtnDisabled]}
              onPress={submitOnsiteIntervention}
              disabled={onsiteSending}
              activeOpacity={0.9}
            >
              {onsiteSending ? (
                <ActivityIndicator color="#fff" />
              ) : null}
              <Text style={styles.modalBtnTextPrimary}>
                {onsiteSending ? 'Envoi du SMS…' : 'Valider et envoyer le SMS'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={closeOnsiteModal}
              disabled={onsiteSending}
              activeOpacity={0.9}
            >
              <Text style={styles.modalBtnTextCancel}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.orange} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Notifications – {displayRobotName(latestScreenRow, robotName)}
        </Text>
        <View style={{ marginLeft: 'auto' }} />
      </View>

      <View style={styles.tabsRow}>
        <PillTab styles={styles} label="Toutes" active={tab === 'all'} onPress={() => setTab('all')} />
        <PillTab styles={styles} label="Critiques" active={tab === 'critical'} onPress={() => setTab('critical')} />
        <View style={{ flex: 1 }} />
        <View style={styles.wifiPill}>
          <Ionicons name="wifi" size={16} color={COLORS.text} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.summaryCard}>
          <Ionicons name="notifications" size={22} color={COLORS.text} />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.summaryTitle}>{total} Notifications</Text>
            <Text style={styles.summarySub}>Marquer toutes comme lues</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={COLORS.muted}
            style={{ marginLeft: 'auto' }}
          />
        </View>

        {filtered.map((n) => (
          <View key={n.id} style={styles.notifCard}>
            <View style={styles.notifTopRow}>
              <View style={styles.levelIconWrap(n.level)}>
                <Ionicons
                  name={
                    n.level === 'critical'
                      ? 'warning'
                      : n.level === 'warning'
                      ? 'battery-dead'
                      : n.level === 'ok'
                      ? 'checkmark-circle'
                      : n.level === 'info'
                      ? 'information-circle'
                      : 'notifications'
                  }
                  size={16}
                  color={styles.levelIconColor(n.level)}
                />
              </View>

              <Text style={styles.notifTs}>{n.ts}</Text>
              <View style={{ flex: 1 }} />

              {n.action ? (
                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.85}
                  onPress={() => onPressAction(n)}
                >
                  <Text style={styles.actionPillText}>{n.action}</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => dismissOne(n.key)}
                style={styles.closeBtn}
                activeOpacity={0.8}
                accessibilityLabel="Supprimer notification"
              >
                <Ionicons name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.notifTitle}>{n.title}</Text>
            <Text style={styles.notifBody}>{n.body}</Text>
          </View>
        ))}

        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.footerBtn}
            activeOpacity={0.85}
            onPress={clearAll}
          >
            <Text style={styles.footerBtnText}>Effacer tous notif</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.bg1 },
    bg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: COLORS.bg1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 22,
      backgroundColor: COLORS.isDark ? 'rgba(20,24,35,0.94)' : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      borderColor: COLORS.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,58,0.14)',
      padding: 16,
    },
    modalTitle: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: '900',
      marginBottom: 10,
      textAlign: 'center',
    },
    modalSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 14,
    },
    modalSubtitle: {
      color: COLORS.muted,
      fontWeight: '800',
    },
    modalBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(58,160,255,0.95)',
      marginBottom: 10,
    },
    modalBtnTextPrimary: { color: '#fff', fontWeight: '900' },
    modalBtnDisabled: { opacity: 0.65 },
    modalBtnAccent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255,152,0,0.95)',
      marginBottom: 10,
    },
    modalBtnTextAccent: { color: '#111827', fontWeight: '900' },
    modalBtnCancel: {
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: COLORS.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,30,58,0.05)',
      borderWidth: 1,
      borderColor: COLORS.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,30,58,0.14)',
      alignItems: 'center',
    },
    modalBtnTextCancel: { color: COLORS.text, fontWeight: '900' },
    onsiteCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 22,
      backgroundColor: COLORS.isDark ? 'rgba(20,24,35,0.96)' : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      borderColor: COLORS.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,58,0.14)',
      padding: 16,
    },
    onsiteHint: {
      color: COLORS.muted,
      fontWeight: '700',
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 14,
    },
    onsiteLabel: {
      color: COLORS.text,
      fontWeight: '800',
      fontSize: 13,
      marginBottom: 6,
    },
    onsiteInput: {
      backgroundColor: COLORS.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(15,30,58,0.05)',
      borderWidth: 1,
      borderColor: COLORS.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,30,58,0.14)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'web' ? 12 : 10,
      color: COLORS.text,
      fontWeight: '600',
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,152,0,0.35)',
      marginRight: 10,
    },
    headerTitle: {
      color: COLORS.text,
      fontSize: 18,
      fontWeight: '900',
    },
    tabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 10,
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      marginRight: 10,
    },
    tabActive: {
      backgroundColor: 'rgba(255,152,0,0.16)',
      borderColor: 'rgba(255,152,0,0.55)',
    },
    tabText: { color: COLORS.muted, fontWeight: '800' },
    tabTextActive: { color: COLORS.orange },
    wifiPill: {
      width: 36,
      height: 32,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    container: {
      padding: 18,
      paddingBottom: 30,
    },
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: 18,
      padding: 14,
      marginBottom: 14,
    },
    summaryTitle: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: '900',
    },
    summarySub: { color: COLORS.muted, marginTop: 2, fontWeight: '700' },
    notifCard: {
      backgroundColor: COLORS.card2,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    notifTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    levelIconWrap: (level) => ({
      width: 30,
      height: 30,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        level === 'critical'
          ? 'rgba(255,95,95,0.15)'
          : level === 'warning'
          ? 'rgba(255,152,0,0.15)'
          : level === 'ok'
          ? 'rgba(56,211,159,0.15)'
          : 'rgba(58,160,255,0.12)',
      borderWidth: 1,
      borderColor:
        level === 'critical'
          ? 'rgba(255,95,95,0.35)'
          : level === 'warning'
          ? 'rgba(255,152,0,0.40)'
          : level === 'ok'
          ? 'rgba(56,211,159,0.35)'
          : 'rgba(58,160,255,0.25)',
      marginRight: 10,
    }),
    levelIconColor: (level) =>
      level === 'critical'
        ? COLORS.red
        : level === 'warning'
        ? COLORS.orange
        : level === 'ok'
        ? COLORS.green
        : COLORS.blue,
    notifTs: { color: COLORS.muted, fontWeight: '800' },
    actionPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,152,0,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,152,0,0.45)',
      marginRight: 10,
    },
    actionPillText: { color: COLORS.orange, fontWeight: '900' },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    notifTitle: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: '900',
      marginBottom: 4,
    },
    notifBody: { color: COLORS.muted, fontWeight: '700', lineHeight: 18 },
    footerRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 10,
    },
    footerBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center',
    },
    footerBtnText: { color: COLORS.text, fontWeight: '900' },
  });