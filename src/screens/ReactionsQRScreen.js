import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import QRCode from 'react-native-qrcode-svg';

export default function ReactionsQRScreen({ navigation, route }) {
  const c = useThemeColors();
  const styles = makeStyles(c);
  const robotName = route?.params?.robotName || 'AdBot R1';

  // On web, Expo may not expose the LAN host automatically. If the app is opened on
  // http://localhost:8081, scanning from another phone will fail (localhost points to the phone).
  // We allow a manual LAN host override (e.g., 192.168.1.108:8081) stored in localStorage.
  const [manualHost, setManualHost] = useState('');
  const [manualHostDraft, setManualHostDraft] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const saved = window?.localStorage?.getItem('adbot_manual_host') || '';
      if (saved) {
        setManualHost(saved);
        setManualHostDraft(saved);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Resolve the Metro dev server LAN host (IP:PORT).
  // Phones cannot reach "localhost" of your PC, so we prefer a real LAN IP when available.
  const lanHostUri = useMemo(() => {
    const candidates = [
      Constants?.manifest?.debuggerHost,
      Constants?.expoConfig?.hostUri,
      Constants?.manifest2?.extra?.expoClient?.hostUri,
      Constants?.expoConfig?.extra?.expoClient?.hostUri,
    ].filter(Boolean);

    // Manual override (web) has priority.
    if (manualHost) return String(manualHost);

    const nonLocal = candidates.find(
      (h) => !String(h).startsWith('localhost') && !String(h).startsWith('127.0.0.1')
    );
    if (nonLocal) return String(nonLocal);
    if (candidates.length) return String(candidates[0]);
    return '';
  }, [manualHost]);

  const webUrl = useMemo(() => {
    const qp = `robotName=${encodeURIComponent(robotName)}`;
    // Expo web routes use /--/path
    if (lanHostUri) return `http://${lanHostUri}/--/reactions?${qp}`;
    if (typeof window !== 'undefined') return `${window.location.origin}/--/reactions?${qp}`;
    return '';
  }, [robotName, lanHostUri]);

  // QR value:
  // - In Expo Go/dev: use exp://<LAN_IP>:<PORT>/--/reactions?... so another phone can open it.
  // - In standalone builds: use the custom scheme pi-mobile://reactions?... (works if the app is installed).
  // - On web: also allow opening the same route in the browser.
  const qrValue = useMemo(() => {
    const qp = `robotName=${encodeURIComponent(robotName)}`;

    // Prefer an Expo Go compatible link when we know the LAN host.
    // This fixes "localhost" issues when another phone scans the QR.
    if (lanHostUri && !lanHostUri.startsWith('localhost') && !lanHostUri.startsWith('127.0.0.1')) {
      return `exp://${lanHostUri}/--/reactions?${qp}`;
    }

    // Web: open the web route directly
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}/--/reactions?${qp}`;
    }

    // Fallback: custom scheme (standalone)
    return ExpoLinking.createURL('reactions', {
      scheme: 'pi-mobile',
      queryParams: { robotName },
    });
  }, [robotName, lanHostUri]);

  const showManualHostBox = useMemo(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined') return false;
    const host = String(lanHostUri || '');
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1') || !host;
    return window.location.hostname === 'localhost' && isLocal;
  }, [lanHostUri]);

  const saveManualHost = () => {
    const v = String(manualHostDraft || '').trim();
    if (!v) {
      setManualHost('');
      try { window?.localStorage?.removeItem('adbot_manual_host'); } catch (e) {}
      return;
    }
    setManualHost(v);
    try { window?.localStorage?.setItem('adbot_manual_host', v); } catch (e) {}
  };

  return (
    <GradientBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner pour réagir</Text>
        </View>

        {/* QR Code */}
        <View style={styles.qrWrap}>
          <View style={styles.qrCard}>
            <QRCode value={qrValue} size={260} />
          </View>
          <Text style={styles.hint}>Scanne ce QR Code avec un autre appareil pour ouvrir l’écran des réactions.</Text>
          {!!webUrl && (
            <Text style={styles.webHint} selectable>
              Si tu veux l’ouvrir sur un navigateur: {webUrl}
            </Text>
          )}

          {showManualHostBox && (
            <View style={styles.manualBox}>
              <Text style={styles.manualTitle}>⚠️ Sur téléphone, "localhost" ne marche pas</Text>
              <Text style={styles.manualSub}>
                Mets l’IP de ton PC (ex: 192.168.1.108:8081), puis rescane.
              </Text>
              <View style={styles.manualRow}>
                <TextInput
                  value={manualHostDraft}
                  onChangeText={setManualHostDraft}
                  placeholder="192.168.1.108:8081"
                  placeholderTextColor={c.muted}
                  style={styles.manualInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={saveManualHost} style={styles.manualBtn} activeOpacity={0.9}>
                  <Text style={styles.manualBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </GradientBackground>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    backIcon: {
      color: c.orange,
      fontSize: 20,
      fontWeight: '900',
    },
    headerTitle: {
      color: c.text,
      fontSize: 20,
      fontWeight: '900',
    },
    qrWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 30,
    },
    qrCard: {
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.10)',
    },
    hint: {
      marginTop: 16,
      color: c.muted,
      textAlign: 'center',
      fontWeight: '800',
      maxWidth: 320,
    },
    webHint: {
      marginTop: 10,
      color: c.muted,
      textAlign: 'center',
      fontWeight: '700',
      maxWidth: 340,
      opacity: 0.9,
    },
    manualBox: {
      marginTop: 16,
      width: '100%',
      maxWidth: 420,
      padding: 14,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    manualTitle: {
      color: c.text,
      fontWeight: '900',
      textAlign: 'center',
    },
    manualSub: {
      marginTop: 6,
      color: c.muted,
      fontWeight: '700',
      textAlign: 'center',
    },
    manualRow: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    manualInput: {
      flex: 1,
      minWidth: 220,
      height: 44,
      borderRadius: 14,
      paddingHorizontal: 12,
      color: c.text,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      fontWeight: '800',
    },
    manualBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: 'rgba(255, 140, 0, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255, 140, 0, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    manualBtnText: {
      color: c.orange,
      fontWeight: '900',
    },
  });
