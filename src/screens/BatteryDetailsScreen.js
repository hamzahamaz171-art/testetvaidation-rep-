import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Platform, Modal, TextInput } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import {
  fetchLatestScreenRow,
  fetchScreenHistorySince,
  fetchRobotMeasurementsHistoryExtended,
  screenRowBatteryPercent,
  screenRowTemp,
  displayRobotName,
  subscribeScreensRealtime,
  subscribeRobotMeasurementsRealtime,
} from '../supabase/screens';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { useThemedPopup } from '../components/useThemedPopup';
import { filterHistoryRowsByQuery } from '../utils/filterHistoryRows';
import { chartPointerLocalX, interpolateAlongChartFromPointer } from '../utils/chartPointerHover';

export default function BatteryDetailsScreen({ navigation, route }) {
  const c = useThemeColors();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const popup = useThemedPopup();
  const styles = useMemo(() => makeStyles(c, isLight), [c, isLight]);
  const screenId = route?.params?.screenId;
  const robotName = route?.params?.robotName || 'AdBot R1';
  const [tab, setTab] = useState('battery');
  const [lowBatteryAlert, setLowBatteryAlert] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [batteryHistoryModal, setBatteryHistoryModal] = useState(false);
  const [fullBatteryHistory, setFullBatteryHistory] = useState([]);
  const [loadingBatteryHistory, setLoadingBatteryHistory] = useState(false);
  const [batteryHistorySearch, setBatteryHistorySearch] = useState('');
  const [batteryChartHover, setBatteryChartHover] = useState(null);
  const batteryChartWrapW = useRef(320);

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const scope = { screenId, robotName };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError('');

        const { data: latestRow, error: latestErr } = await fetchLatestScreenRow(scope);

        if (latestErr) throw latestErr;

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: histRows, error: histErr } = await fetchScreenHistorySince(scope, since);

        if (histErr) throw histErr;

        if (!isMounted) return;
        setLatest(latestRow || null);
        setHistory(Array.isArray(histRows) ? histRows : []);
      } catch (e) {
        if (!isMounted) return;
        setLoadError(e?.message || 'Erreur lors du chargement depuis Supabase.');
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    load();
    const reload = () => { load(); };
    const unsubscribeScreens = subscribeScreensRealtime(
      reload,
      `battery-details-screens-${screenId || robotName || 'all'}`
    );
    const unsubscribeMeasurements = subscribeRobotMeasurementsRealtime(
      reload,
      `battery-details-measures-${screenId || robotName || 'all'}`
    );

    return () => {
      isMounted = false;
      unsubscribeScreens();
      unsubscribeMeasurements();
    };
  }, [screenId, robotName]);

  const percent = screenRowBatteryPercent(latest) ?? 0;
  const tempC = screenRowTemp(latest);
  const resolvedRobotName = displayRobotName(latest, robotName);

  const summary = useMemo(() => {
    const rows = Array.isArray(history) ? history : [];
    /** Dernière entrée = mesure la plus récente (robot_measurements.created_at) */
    const newestCreatedAt = rows.length ? rows[rows.length - 1]?.created_at : null;
    const lastTime =
      newestCreatedAt != null
        ? new Date(newestCreatedAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : '--';

    return {
      percent,
      status: percent >= 99 ? 'Chargée' : percent <= 20 ? 'Batterie faible' : 'En charge',
      robot: latest?.robot ?? '—',
      nom: latest?.nom ?? '—',
      address: latest?.address ?? '—',
      latitude: latest?.latitude,
      longitude: latest?.longitude,
      userId: latest?.user_id,
      robotId: latest?.robot_id,
      lastTime,
      eta: undefined,
      health: undefined,
      temperature: tempC == null || !Number.isFinite(tempC) ? '—' : tempC.toFixed(1),
    };
  }, [percent, latest, tempC, history]);

  /**
   * Courbe batterie = les 10 dernières mesures réelles depuis robot_measurements.
   * On garde l'ordre ancien -> récent pour une courbe lisible.
   */
  const series = useMemo(() => {
    const rows = Array.isArray(history) ? history : [];
    let values = rows
      .map((row) => screenRowBatteryPercent(row))
      .filter((x) => typeof x === 'number' && Number.isFinite(x))
      .slice(-10)
      .map((x) => clamp(x, 0, 100));

    if (!values.length && typeof percent === 'number' && Number.isFinite(percent)) {
      values = [clamp(percent, 0, 100), clamp(percent, 0, 100)];
    } else if (values.length === 1) {
      values = [values[0], values[0]];
    }

    const count = values.length;
    const labelIndexes = Array.from(new Set([0, Math.floor((count - 1) / 2), count - 1]));
    const labels = labelIndexes.map((index) => ({
      index,
      label: index === count - 1 ? 'Maintenant' : `Mes. ${index + 1}`,
    }));

    return { values, labels };
  }, [history, percent]);

  /**
   * ✅ Graph like Paint:
   * - Draw axes (X bottom, Y left)
   * - Y ticks 0/25/50/75/100
   * - X ticks sur les dernières mesures
   * - Smooth curve through points
   */
  const graph = useMemo(() => {
    // SVG canvas
    const W = 320;
    const H = 170;

    // Plot area inside canvas
    const padLeft = 42;   // space for Y labels
    const padRight = 12;
    const padTop = 14;
    const padBottom = 34; // space for X labels

    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;

    const vals = series?.values || [];
    const n = vals.length || 1;

    // Convert percent to Y coordinate (0 at bottom, 100 at top)
    const yFromPercent = (p) => {
      const pc = clamp(Number(p) || 0, 0, 100);
      return padTop + (1 - pc / 100) * plotH;
    };

    const xFromIndex = (i) => {
      if (n <= 1) return padLeft;
      return padLeft + (i * plotW) / (n - 1);
    };

    const points = vals.map((p, i) => ({ x: xFromIndex(i), y: yFromPercent(p) }));

    // Smooth curve: Catmull-Rom -> Bezier
    const catmullRomToBezier = (pts) => {
      if (pts.length < 2) return `M ${padLeft} ${padTop + plotH}`;
      let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;

        const t = 0.5;
        const c1x = p1.x + (p2.x - p0.x) * (t / 6);
        const c1y = p1.y + (p2.y - p0.y) * (t / 6);
        const c2x = p2.x - (p3.x - p1.x) * (t / 6);
        const c2y = p2.y - (p3.y - p1.y) * (t / 6);

        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
      return d;
    };

    const path = catmullRomToBezier(points);
    const last = points[points.length - 1] || { x: padLeft, y: padTop + plotH };

    // Y ticks like your drawing
    const yTicks = [0, 25, 50, 75, 100].map((v) => ({
      value: v,
      y: yFromPercent(v),
    }));

    // X ticks based on measurement labels
    const xTicks = (series?.labels || []).map((it) => ({
      index: it.index,
      label: it.label,
      x: xFromIndex(it.index),
    }));

    // Axis lines
    const xAxisY = padTop + plotH;
    const yAxisX = padLeft;

    const hoverPoints = points.map((p, i) => ({
      x: p.x,
      y: p.y,
      value: typeof vals[i] === 'number' && Number.isFinite(vals[i]) ? vals[i] : 0,
    }));

    return {
      W, H,
      padLeft, padRight, padTop, padBottom,
      xAxisY, yAxisX,
      path,
      last,
      yTicks,
      xTicks,
      hoverPoints,
    };
  }, [series]);

  const clearBatteryChartHover = useCallback(() => setBatteryChartHover(null), []);

  const onBatteryChartPointer = useCallback(
    (e) => {
      const pts = graph.hoverPoints;
      if (!pts?.length) return;
      const lx = chartPointerLocalX(e);
      if (lx == null) return;
      const wrapW = batteryChartWrapW.current || graph.W;
      const res = interpolateAlongChartFromPointer(lx, wrapW, graph.W, pts);
      if (!res || !Number.isFinite(res.value)) return;
      const tooltipW = 56;
      const vy = Number.isFinite(res.y) ? res.y : graph.H / 2;
      setBatteryChartHover({
        text: `${Math.round(res.value)}%`,
        left: Math.min(Math.max(lx - tooltipW / 2, 4), Math.max(wrapW - tooltipW - 4, 4)),
        top: Math.max(Math.min(vy - 36, graph.H - 30), 4),
      });
    },
    [graph]
  );

  const batteryChartPointerProps =
    Platform.OS === 'web'
      ? { onMouseMove: onBatteryChartPointer, onMouseLeave: clearBatteryChartHover }
      : { onPointerMove: onBatteryChartPointer, onPointerLeave: clearBatteryChartHover };

  const batteryHistoryRows = useMemo(() => {
    const rows = Array.isArray(fullBatteryHistory) ? fullBatteryHistory : [];
    return [...rows].sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [fullBatteryHistory]);

  const filteredBatteryHistoryRows = useMemo(
    () => filterHistoryRowsByQuery(batteryHistoryRows, batteryHistorySearch, 'battery'),
    [batteryHistoryRows, batteryHistorySearch]
  );

  const closeBatteryHistoryModal = () => {
    setBatteryHistoryModal(false);
    setBatteryHistorySearch('');
  };

  const openBatteryHistory = async () => {
    setBatteryHistoryModal(true);
    setLoadingBatteryHistory(true);
    try {
      const { data, error } = await fetchRobotMeasurementsHistoryExtended(scope, 200);
      if (error) throw error;
      setFullBatteryHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      await popup.alert('Erreur', e?.message || "Impossible de charger l'historique.");
      setFullBatteryHistory([]);
    } finally {
      setLoadingBatteryHistory(false);
    }
  };

  const buildPdfHtml = async () => {
    const safe = (x) => (x === null || x === undefined ? '--' : String(x));
    const nowStr = new Date().toLocaleString();
    const pdfRobotName = displayRobotName(latest, robotName);

    // ✅ Extra insights (24h)
    const vals = (series?.values || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
    const minP = vals.length ? Math.min(...vals) : 0;
    const maxP = vals.length ? Math.max(...vals) : 0;
    const avgP = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    const measurements = Array.isArray(history) ? history.length : 0;

    const reco = percent <= 20
      ? "Batterie faible : branchez le robot à un chargeur et limitez l'utilisation."
      : percent <= 50
      ? "Batterie moyenne : planifiez une recharge bientôt."
      : "Batterie OK : utilisation normale.";

    // ✅ Embed company logo in PDF (transparent PNG)
    let logoDataUrl = '';
    try {
      const asset = Asset.fromModule(require('../../assets/company_logo.png'));
      await asset.downloadAsync();
      const base64 = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      logoDataUrl = `data:image/png;base64,${base64}`;
    } catch (e) {
      // ignore
    }

    const svg = `
      <svg width="100%" height="220" viewBox="0 0 ${graph.W} ${graph.H}" xmlns="http://www.w3.org/2000/svg">
        <!-- axes -->
        <line x1="${graph.yAxisX}" y1="${graph.padTop}" x2="${graph.yAxisX}" y2="${graph.xAxisY}" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
        <line x1="${graph.yAxisX}" y1="${graph.xAxisY}" x2="${graph.W - graph.padRight}" y2="${graph.xAxisY}" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>

        <!-- horizontal grid + y ticks -->
        ${graph.yTicks.map(t => `
          <line x1="${graph.yAxisX}" y1="${t.y}" x2="${graph.W - graph.padRight}" y2="${t.y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
          <line x1="${graph.yAxisX - 6}" y1="${t.y}" x2="${graph.yAxisX}" y2="${t.y}" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
          <text x="${graph.yAxisX - 10}" y="${t.y + 4}" font-size="10" text-anchor="end" fill="rgba(255,255,255,0.75)">${t.value}</text>
        `).join('')}

        <!-- x ticks -->
        ${graph.xTicks.map(t => `
          <line x1="${t.x}" y1="${graph.xAxisY}" x2="${t.x}" y2="${graph.xAxisY + 6}" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
          <text x="${t.x}" y="${graph.xAxisY + 20}" font-size="10" text-anchor="middle" fill="rgba(255,255,255,0.70)">${t.label}</text>
        `).join('')}

        <!-- curve -->
        <path d="${graph.path}" fill="none" stroke="rgba(255,165,0,0.95)" stroke-width="3" />
        <circle cx="${graph.last.x}" cy="${graph.last.y}" r="4.5" fill="rgba(255,165,0,0.95)" />
      </svg>
    `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Rapport Batterie - ${pdfRobotName}</title>
          <style>
            body{font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; color:#111;}
            .header{display:flex; justify-content:space-between; align-items:flex-start; gap:16px;}
            .brand{display:flex; align-items:center; gap:10px;}
            .logo{width:34px; height:34px; object-fit:contain;}
            .title{font-size:22px; font-weight:800;}
            .meta{color:#555; font-size:12px; margin-top:4px;}
            .pill{display:inline-block; padding:6px 10px; border-radius:999px; background:#fff3e0; border:1px solid #ffd7a0; font-weight:700; font-size:12px;}
            .card{margin-top:14px; border:1px solid #eee; border-radius:14px; padding:14px;}
            .grid{display:grid; grid-template-columns: 1fr 1fr; gap:10px;}
            .kv{display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f3f3f3;}
            .kv:last-child{border-bottom:none;}
            .k{color:#555; font-weight:700;}
            .v{font-weight:900;}
            .chartBox{margin-top:12px; padding:12px; border-radius:14px; border:1px solid #eee; background:#111;}
            .footer{margin-top:18px; font-size:11px; color:#777;}
            .chartTitle{color:#fff; font-weight:900; margin-bottom:8px;}
            .note{margin-top:10px; padding:10px 12px; border-radius:12px; background:#f7f7f7; border:1px solid #eee; font-size:12px; color:#333;}
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">
                ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" />` : ''}
                <div class="title">Rapport Batterie — ${pdfRobotName}</div>
              </div>
              <div class="meta">Généré le ${nowStr} • Source: Supabase (screens + robot_measurements)</div>
            </div>
            <div class="pill">${safe(summary.status)} • ${safe(summary.percent)}%</div>
          </div>

          <div class="card">
            <div class="grid">
              <div>
                <div class="kv"><div class="k">Robot (écran)</div><div class="v">${safe(summary.robot)}</div></div>
                <div class="kv"><div class="k">Nom</div><div class="v">${safe(summary.nom)}</div></div>
                <div class="kv"><div class="k">Adresse</div><div class="v">${safe(summary.address)}</div></div>
                <div class="kv"><div class="k">Température carte</div><div class="v">${safe(summary.temperature)} °C</div></div>
              </div>
              <div>
                <div class="kv"><div class="k">Dernière mesure</div><div class="v">${safe(summary.lastTime)}</div></div>
                <div class="kv"><div class="k">Mesures historisées</div><div class="v">${measurements}</div></div>
                <div class="kv"><div class="k">Min</div><div class="v">${minP}%</div></div>
                <div class="kv"><div class="k">Max</div><div class="v">${maxP}%</div></div>
                <div class="kv"><div class="k">Moyenne</div><div class="v">${avgP}%</div></div>
              </div>
            </div>

            <div class="chartBox">
              <div class="chartTitle">Batterie (%) — 10 dernières mesures</div>
              ${svg}
            </div>

            <div class="note"><b>Conseil</b> : ${safe(reco)}</div>
          </div>

          <div class="footer">AdBot • Rapport généré depuis l'application mobile.</div>
        </body>
      </html>
    `;
  };

  const onExportPdf = async () => {
    try {
      const html = await buildPdfHtml();

      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (!w) {
          await popup.alert('Popup bloqué', "Autorise les popups pour télécharger le PDF.");
          return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: "Exporter rapport d'énergie" });
      } else {
        await popup.alert('PDF généré', `Fichier créé: ${uri}`);
      }
    } catch (e) {
      await popup.alert('Erreur', e?.message || "Impossible de générer le PDF.");
    }
  };

  return (
    <GradientBackground>
      {popup.renderPopup}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Batterie – {resolvedRobotName}</Text>
        </View>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Chargement depuis Supabase...</Text>
          </View>
        )}
        {!!loadError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        )}

        <View style={styles.topCard}>
          <View style={styles.topLeft}>
            <View style={styles.statusPill}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>{summary.status}</Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.bigPercent}>{summary.percent}%</Text>
              {summary.eta ? <Text style={styles.etaText}>{summary.eta}</Text> : null}
            </View>

            <Text style={styles.smallLine}>Health : {summary.health != null ? `${summary.health}%` : '—'}</Text>
            <Text style={styles.smallLine}>
              Température : {summary.temperature === '—' ? '—' : `${summary.temperature}°C`}
            </Text>
          </View>

          <View style={styles.topRight}>
            <View style={styles.robotBox}>
              <View style={styles.robotImgWrap}>
                <Image source={require('../../assets/robot.png')} style={styles.robotImg} resizeMode="contain" />
                <View style={styles.robotBadge}>
                  <Text style={styles.robotBadgeText}>{summary.percent}%</Text>
                </View>
              </View>
              <View style={styles.barsRow}>
                <View style={styles.barOn} />
                <View style={styles.barOn} />
                <View style={styles.barOn} />
                <View style={styles.barOff} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'battery' && styles.tabBtnActive]}
            onPress={() => setTab('battery')}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabText, tab === 'battery' && styles.tabTextActive]}>Batterie</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'infos' && styles.tabBtnActive]}
            onPress={() => setTab('infos')}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabText, tab === 'infos' && styles.tabTextActive]}>Infos écran</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionHeader}>
            {tab === 'battery' ? 'Niveau de Batterie — historique' : 'Données écran '}
          </Text>

          {tab === 'battery' ? (
            <>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>🤖 Robot</Text>
                <Text style={styles.kvValue}>{summary.robot}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>📛 Nom</Text>
                <Text style={styles.kvValue}>{summary.nom}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>📍 Adresse</Text>
                <Text style={styles.kvValue} numberOfLines={2}>{summary.address}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>🧪 Source</Text>
                <Text style={styles.kvValue}>Supabase (screens)</Text>
              </View>
              <View style={styles.lastMeasureBanner}>
                <Text style={styles.lastMeasureLabel}>🕒 Dernière mesure</Text>
                <Text style={styles.lastMeasureValue} numberOfLines={2}>
                  {summary.lastTime}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>user_id</Text>
                <Text style={styles.kvValue}>{summary.userId != null ? String(summary.userId) : '—'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>robot_id</Text>
                <Text style={styles.kvValue} numberOfLines={1}>{summary.robotId ?? '—'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Latitude</Text>
                <Text style={styles.kvValue}>{summary.latitude != null ? String(summary.latitude) : '—'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Longitude</Text>
                <Text style={styles.kvValue}>{summary.longitude != null ? String(summary.longitude) : '—'}</Text>
              </View>
            </>
          )}

          {tab === 'battery' ? (
          <View style={{ marginTop: 14 }}>
            <View style={styles.chartHeaderRow}>
              <View style={[styles.smallTab, styles.smallTabActive]}>
                <Text style={[styles.smallTabText, styles.smallTabTextActive]}>% Batterie🔋🪫 </Text>
              </View>
            </View>

            <View style={styles.chartBox}>
              <Text style={styles.axisTitle}>Batterie</Text>

              <View
                style={[
                  styles.chartSvgWrap,
                  Platform.OS === 'web' ? { cursor: 'crosshair' } : null,
                ]}
                onLayout={(e) => {
                  batteryChartWrapW.current = e.nativeEvent.layout.width;
                }}
                collapsable={false}
                {...batteryChartPointerProps}
              >
                <Svg width="100%" height={graph.H} viewBox={`0 0 ${graph.W} ${graph.H}`}>
                  {/* Axes */}
                  <Line x1={graph.yAxisX} y1={graph.padTop} x2={graph.yAxisX} y2={graph.xAxisY} stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
                  <Line x1={graph.yAxisX} y1={graph.xAxisY} x2={graph.W - graph.padRight} y2={graph.xAxisY} stroke="rgba(255,255,255,0.45)" strokeWidth="2" />

                  {/* Y grid + ticks + labels */}
                  {graph.yTicks.map((t) => (
                    <React.Fragment key={`y-${t.value}`}>
                      <Line
                        x1={graph.yAxisX}
                        y1={t.y}
                        x2={graph.W - graph.padRight}
                        y2={t.y}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="1"
                      />
                      <Line
                        x1={graph.yAxisX - 6}
                        y1={t.y}
                        x2={graph.yAxisX}
                        y2={t.y}
                        stroke="rgba(255,255,255,0.45)"
                        strokeWidth="2"
                      />
                    </React.Fragment>
                  ))}

                  {/* X ticks */}
                  {graph.xTicks.map((t) => (
                    <Line
                      key={`x-${t.index}`}
                      x1={t.x}
                      y1={graph.xAxisY}
                      x2={t.x}
                      y2={graph.xAxisY + 6}
                      stroke="rgba(255,255,255,0.45)"
                      strokeWidth="2"
                    />
                  ))}

                  {/* Curve */}
                  <Path d={graph.path} fill="none" stroke="rgba(255,165,0,0.90)" strokeWidth="3" />
                  <Circle cx={graph.last.x} cy={graph.last.y} r="5" fill="rgba(255,165,0,0.95)" />
                </Svg>
                {batteryChartHover ? (
                  <View
                    style={[
                      styles.chartTooltip,
                      { left: batteryChartHover.left, top: batteryChartHover.top },
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={styles.chartTooltipText}>{batteryChartHover.text}</Text>
                  </View>
                ) : null}
              </View>

              {/* Y labels (0/25/50/75/100) as real text (easier than SVG text in RN) */}
              <View style={styles.yLabelCol} pointerEvents="none">
                {graph.yTicks
                  .slice()
                  .reverse() // show 100 on top
                  .map((t) => (
                    <Text key={`yl-${t.value}`} style={styles.yLabel}>
                      {t.value}
                    </Text>
                  ))}
              </View>

              {/* X labels row (04h..01h) */}
              <View style={styles.chartAxisRow}>
                {series.labels.map((it) => (
                  <Text key={it.index} style={styles.axisText}>
                    {it.label}
                  </Text>
                ))}
              </View>

              <Text style={styles.xAxisTitle}>mesures</Text>
            </View>

            <TouchableOpacity style={styles.historyBtn} activeOpacity={0.9} onPress={openBatteryHistory}>
              <Text style={styles.historyBtnIcon}>📋</Text>
              <Text style={styles.historyBtnText}>Historique complet</Text>
              <Text style={styles.historyBtnArrow}>›</Text>
            </TouchableOpacity>
          </View>
          ) : null}

          <View style={styles.actionRow}>
            <Text style={styles.actionLabel}>🔔 Alerte batterie faible (20%)</Text>
            <TouchableOpacity
              style={[styles.toggle, lowBatteryAlert ? styles.toggleOn : styles.toggleOff]}
              onPress={() => setLowBatteryAlert((v) => !v)}
              activeOpacity={0.9}
            >
              <View style={[styles.toggleKnob, lowBatteryAlert ? styles.toggleKnobOn : styles.toggleKnobOff]} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.exportBtn} activeOpacity={0.9} onPress={onExportPdf}>
            <Text style={styles.exportIcon}>🧾</Text>
            <Text style={styles.exportText}>Exporter rapport d'énergie</Text>
            <Text style={styles.exportArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={batteryHistoryModal}
        animationType="slide"
        transparent
        onRequestClose={closeBatteryHistoryModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique — {resolvedRobotName}</Text>
              <TouchableOpacity
                onPress={closeBatteryHistoryModal}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>robot_measurements (Supabase)</Text>

            {loadingBatteryHistory ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={c.text} />
                <Text style={styles.modalLoadingText}>Chargement…</Text>
              </View>
            ) : batteryHistoryRows.length === 0 ? (
              <Text style={styles.modalEmpty}>Aucune mesure enregistrée pour ce robot.</Text>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher (date, heure, %, robot, id…)"
                    placeholderTextColor={c.muted}
                    value={batteryHistorySearch}
                    onChangeText={setBatteryHistorySearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {batteryHistorySearch.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setBatteryHistorySearch('')}
                      style={styles.searchClear}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.searchClearText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {filteredBatteryHistoryRows.length === 0 ? (
                  <Text style={styles.modalEmpty}>Aucun résultat pour cette recherche.</Text>
                ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.tableHeadRow}>
                    <Text style={[styles.th, styles.colDate]}>Date</Text>
                    <Text style={[styles.th, styles.colTime]}>Heure</Text>
                    <Text style={[styles.th, styles.colBatt]}>Batterie</Text>
                    <Text style={[styles.th, styles.colRobot]}>Robot</Text>
                    <Text style={[styles.th, styles.colId]}>ID</Text>
                  </View>
                  <ScrollView style={styles.tableBody} nestedScrollEnabled>
                    {filteredBatteryHistoryRows.map((row, idx) => {
                      const d = row?.created_at ? new Date(row.created_at) : null;
                      const dateStr = d ? d.toLocaleDateString('fr-FR') : '—';
                      const timeStr = d
                        ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '—';
                      const batt = screenRowBatteryPercent(row);
                      return (
                        <View
                          key={String(row.id)}
                          style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
                        >
                          <Text style={[styles.td, styles.colDate]} numberOfLines={1}>
                            {dateStr}
                          </Text>
                          <Text style={[styles.td, styles.colTime]} numberOfLines={1}>
                            {timeStr}
                          </Text>
                          <Text style={[styles.td, styles.colBatt]} numberOfLines={1}>
                            {batt != null ? `${batt}%` : '—'}
                          </Text>
                          <Text style={[styles.td, styles.colRobot]} numberOfLines={1}>
                            {row?.robot != null ? String(row.robot) : '—'}
                          </Text>
                          <Text style={[styles.td, styles.colId]} numberOfLines={1}>
                            {row?.id != null ? String(row.id) : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </ScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

const makeStyles = (c, isLight) => StyleSheet.create({
  container: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  backText: { color: c.text, fontSize: 18, fontWeight: '800' },
  headerTitle: { color: c.text, fontSize: 18, fontWeight: '800' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  loadingText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  errorRow: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,0,0,0.12)' },
  errorText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800' },

  topCard: {
    marginTop: 14, borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'stretch',
  },
  topLeft: { flex: 1, paddingRight: 12 },
  topRight: { width: 140, alignItems: 'flex-end' },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,165,0,0.15)', borderWidth: 1, borderColor: 'rgba(255,165,0,0.25)',
  },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(0,255,140,0.9)', marginRight: 8 },
  statusText: { color: c.text, fontWeight: '700', fontSize: 12 },

  bigPercent: { color: c.text, fontSize: 44, fontWeight: '900', lineHeight: 48 },
  etaText: { color: 'rgba(255,255,255,0.82)', marginTop: 2, fontWeight: '700' },
  smallLine: { color: 'rgba(255,255,255,0.75)', marginTop: 6, fontWeight: '600' },

  robotBox: {
    width: 110,
    height: 100,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  robotImgWrap: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  robotImg: { width: 70, height: 70 },
  robotBadge: {
    position: 'absolute',
    right: -6,
    top: -6,
    backgroundColor: 'rgba(255,165,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  robotBadgeText: { color: c.text, fontWeight: '900', fontSize: 12 },

  barsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 8 },
  barOn: { flex: 1, height: 12, borderRadius: 6, marginHorizontal: 2, backgroundColor: 'rgba(0,255,140,0.85)' },
  barOff: { flex: 1, height: 12, borderRadius: 6, marginHorizontal: 2, backgroundColor: 'rgba(255,255,255,0.15)' },

  tabsRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  tabBtn: {
    flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  tabBtnActive: { backgroundColor: 'rgba(255,165,0,0.16)', borderColor: 'rgba(255,165,0,0.28)' },
  tabText: { color: 'rgba(255,255,255,0.72)', fontWeight: '800' },
  tabTextActive: { color: c.text },

  detailsCard: {
    marginTop: 12, borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionHeader: { color: c.text, fontSize: 16, fontWeight: '900', marginBottom: 10 },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  kvLabel: { color: 'rgba(255,255,255,0.82)', fontWeight: '700' },
  kvValue: { color: c.text, fontWeight: '900' },

  lastMeasureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 999,
    backgroundColor: isLight ? '#EAF4FF' : 'rgba(61, 123, 255, 0.14)',
    borderWidth: 1,
    borderColor: isLight ? 'rgba(74, 141, 255, 0.38)' : 'rgba(140, 188, 255, 0.42)',
  },
  lastMeasureLabel: {
    color: isLight ? 'rgba(15, 30, 58, 0.52)' : 'rgba(230, 237, 255, 0.62)',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
  },
  lastMeasureValue: {
    flex: 1,
    color: isLight ? '#0F1E3A' : '#E8F0FF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },

  chartHeaderRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  smallTab: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  smallTabActive: { backgroundColor: 'rgba(255,165,0,0.16)', borderColor: 'rgba(255,165,0,0.28)' },
  smallTabText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800', fontSize: 12 },
  smallTabTextActive: { color: c.text },

  // ✅ Chart box now looks like Cartesian graph
  chartBox: {
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 12,
    position: 'relative',
  },
  chartSvgWrap: {
    width: '100%',
    position: 'relative',
  },
  chartTooltip: {
    position: 'absolute',
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 30,
    alignItems: 'center',
  },
  chartTooltipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  axisTitle: {
    position: 'absolute',
    left: 14,
    top: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '800',
    fontSize: 12,
  },

  // Y labels column aligned like your sketch
  yLabelCol: {
    position: 'absolute',
    left: 8,
    top: 26,
    height: 110,
    justifyContent: 'space-between',
  },
  yLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'right',
    width: 30,
  },

  chartAxisRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 11 },

  xAxisTitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '800',
    fontSize: 12,
    alignSelf: 'flex-end',
  },

  actionRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionLabel: { color: 'rgba(255,255,255,0.82)', fontWeight: '800' },
  toggle: { width: 50, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: 'rgba(0,255,140,0.35)', borderWidth: 1, borderColor: 'rgba(0,255,140,0.45)' },
  toggleOff: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  toggleKnob: { width: 22, height: 22, borderRadius: 999, backgroundColor: c.text },
  toggleKnobOn: { alignSelf: 'flex-end' },
  toggleKnobOff: { alignSelf: 'flex-start' },

  exportBtn: {
    marginTop: 12, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  exportIcon: { fontSize: 16 },
  exportText: { color: c.text, fontWeight: '800', flex: 1 },
  exportArrow: { color: 'rgba(255,255,255,0.6)', fontWeight: '900', fontSize: 18 },

  historyBtn: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: isLight ? '#E8F3FF' : 'rgba(74, 141, 255, 0.16)',
    borderWidth: 1,
    borderColor: isLight ? 'rgba(74, 141, 255, 0.45)' : 'rgba(140, 188, 255, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyBtnIcon: { fontSize: 16 },
  historyBtnText: {
    color: isLight ? '#0F1E3A' : c.text,
    fontWeight: '800',
    flex: 1,
  },
  historyBtnArrow: {
    color: isLight ? '#1E4A8C' : 'rgba(200, 220, 255, 0.95)',
    fontWeight: '900',
    fontSize: 18,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: isLight ? 'rgba(15, 30, 58, 0.45)' : 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    backgroundColor: isLight ? '#FFFFFF' : c.bg2,
    borderWidth: 1,
    borderColor: isLight ? c.border2 : c.border2,
    shadowColor: isLight ? '#0F1E3A' : '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: isLight ? 0.12 : 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: { color: c.text, fontSize: 17, fontWeight: '900', flex: 1, paddingRight: 12 },
  modalSubtitle: {
    color: c.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: isLight ? 'rgba(15, 30, 58, 0.05)' : 'rgba(255,255,255,0.06)',
  },
  searchIcon: { fontSize: 15 },
  searchInput: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
    minHeight: 36,
  },
  searchClear: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  searchClearText: {
    color: c.muted,
    fontSize: 16,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isLight ? 'rgba(15, 30, 58, 0.06)' : 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: isLight ? c.border : c.border,
  },
  modalCloseText: { color: c.text, fontSize: 18, fontWeight: '900' },
  modalLoading: { paddingVertical: 40, alignItems: 'center' },
  modalLoadingText: { marginTop: 10, color: c.muted, fontWeight: '700' },
  modalEmpty: {
    color: c.muted,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 28,
  },

  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: isLight ? `${c.blue}35` : 'rgba(170, 210, 255, 0.45)',
    backgroundColor: isLight ? `${c.blue}14` : 'rgba(130, 175, 255, 0.16)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  tableBody: { maxHeight: 420 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? c.border : 'rgba(255,255,255,0.12)',
  },
  tableRowEven: {
    backgroundColor: isLight ? '#F8FAFF' : 'rgba(255,255,255,0.03)',
  },
  tableRowOdd: {
    backgroundColor: isLight ? '#FFFFFF' : 'rgba(140, 185, 255, 0.07)',
  },
  th: {
    color: c.orange,
    fontWeight: '900',
    fontSize: 11,
  },
  td: { color: c.text, fontWeight: '700', fontSize: 12 },
  colDate: { width: 92 },
  colTime: { width: 88 },
  colBatt: { width: 72 },
  colRobot: { width: 100 },
  colId: { width: 44 },
});