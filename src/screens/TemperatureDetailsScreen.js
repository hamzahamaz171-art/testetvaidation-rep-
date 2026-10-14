import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions, Modal, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import {
  fetchLatestScreenRow,
  fetchScreenHistorySince,
  fetchRobotMeasurementsHistoryExtended,
  screenRowTemp,
  displayRobotName,
  subscribeScreensRealtime,
  subscribeRobotMeasurementsRealtime,
} from '../supabase/screens';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeContext';
import { useThemedPopup } from '../components/useThemedPopup';
import { filterHistoryRowsByQuery } from '../utils/filterHistoryRows';
import { chartPointerLocalX, interpolateAlongChartFromPointer } from '../utils/chartPointerHover';

export default function TemperatureDetailsScreen({ navigation, route }) {
  const c = useThemeColors();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const popup = useThemedPopup();
  const styles = useMemo(() => makeStyles(c, isLight), [c, isLight]);
  const { width: sw } = useWindowDimensions();
  const screenId = route?.params?.screenId;
  const robotName = route?.params?.robotName || 'AdBot R1';
  const scope = { screenId, robotName };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [tempHistoryModal, setTempHistoryModal] = useState(false);
  const [fullTempHistory, setFullTempHistory] = useState([]);
  const [loadingTempHistory, setLoadingTempHistory] = useState(false);
  const [tempHistorySearch, setTempHistorySearch] = useState('');
  const [tempChartHover, setTempChartHover] = useState(null);
  const tempChartWrapW = useRef(300);

  const computeStatus = (t) => {
    if (t === null || t === undefined || !Number.isFinite(Number(t))) return '—';
    const x = Number(t);
    if (x < 5) return 'Froid';
    if (x > 45) return 'Très chaud';
    if (x > 35) return 'Chaud';
    return 'Normal';
  };

  const statusEmoji = (status) => {
    if (status === 'Froid') return '❄️';
    if (status === 'Très chaud') return '🚨';
    if (status === 'Chaud') return '🔥';
    if (status === 'Normal') return '✅';
    return '🌡️';
  };


  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoadError('');
        setLoading(true);

        const { data: latestRow, error: latestErr } = await fetchLatestScreenRow(scope);

        if (latestErr) throw latestErr;

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: histRows, error: histErr } = await fetchScreenHistorySince(scope, since);

        if (histErr) throw histErr;

        if (!alive) return;
        setLatest(latestRow || null);
        setHistory(Array.isArray(histRows) ? histRows : []);
      } catch (e) {
        if (!alive) return;
        setLoadError(e?.message || 'Erreur lors du chargement depuis Supabase.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    const reload = () => { load(); };
    const unsubscribeScreens = subscribeScreensRealtime(
      reload,
      `temperature-details-screens-${screenId || robotName || 'all'}`
    );
    const unsubscribeMeasurements = subscribeRobotMeasurementsRealtime(
      reload,
      `temperature-details-measures-${screenId || robotName || 'all'}`
    );

    return () => {
      alive = false;
      unsubscribeScreens();
      unsubscribeMeasurements();
    };
  }, [screenId, robotName]);

  const latestTemp = screenRowTemp(latest);
  const resolvedRobotName = displayRobotName(latest, robotName);
  const currentStatus = computeStatus(latestTemp);

  /**
   * Date/heure : priorité à robot_measurements (created_at le plus récent),
   * sinon repli sur la ligne écran `screens` pour éviter « -- » si l’historique est vide.
   */
  const lastMeasurementLabel = useMemo(() => {
    const rows = Array.isArray(history) ? history : [];
    const fromMeasurements = rows.length ? rows[rows.length - 1]?.created_at : null;
    const iso = fromMeasurements ?? latest?.created_at ?? null;
    if (iso == null) return '--';
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [history, latest]);

  /**
   * Points de la courbe = les 10 dernières mesures réelles depuis robot_measurements.
   * Si l'historique est encore vide, on affiche au moins la valeur actuelle.
   */
  const chartPoints = useMemo(() => {
    const now = Date.now();
    const rows = Array.isArray(history) ? history : [];
    const allValidPoints = [];

    rows.forEach((row, index) => {
      const v = screenRowTemp(row);
      if (v == null || !Number.isFinite(v)) return;
      const parsedTime = row?.created_at ? new Date(row.created_at).getTime() : NaN;
      // Pour une courbe lisible, si plusieurs mesures arrivent dans la même seconde,
      // on espace légèrement les points tout en gardant l'ordre réel.
      const t = Number.isFinite(parsedTime) ? parsedTime : now - (rows.length - 1 - index) * 1000;
      allValidPoints.push({ t, v });
    });
    const points = allValidPoints.slice(-10);

    const vLive = screenRowTemp(latest);
    if (!points.length && vLive != null && Number.isFinite(vLive)) {
      return [
        { t: now - 1000, v: vLive },
        { t: now, v: vLive },
      ];
    }

    if (points.length === 1) {
      return [
        { t: points[0].t - 1000, v: points[0].v },
        points[0],
      ];
    }

    // Si la dernière valeur live est différente de la dernière mesure historisée,
    // on l'ajoute pour que l'écran reste immédiatement à jour.
    const last = points[points.length - 1];
    if (vLive != null && Number.isFinite(vLive) && last && last.v !== vLive) {
      points.push({ t: Math.max(now, last.t + 1000), v: vLive });
    }

    return points.slice(-10);
  }, [history, latest]);

  const stats = useMemo(() => {
    const vals = chartPoints.map((p) => p.v).filter((x) => Number.isFinite(x));
    if (!vals.length) return { min: '--', max: '--', avg: '--' };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      min: `${min.toFixed(1)}°C`,
      max: `${max.toFixed(1)}°C`,
      avg: `${avg.toFixed(1)}°C`,
    };
  }, [chartPoints]);

  const graph = useMemo(() => {
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const W = Math.max(300, Math.min(sw - 28, 580));
    const H = 245;
    const padLeft = 48;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 42;

    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    const xAxisY = padTop + plotH;
    const yAxisX = padLeft;

    if (!chartPoints.length) {
      return {
        empty: true,
        W,
        H,
        padLeft,
        padRight,
        padTop,
        padBottom,
        xAxisY,
        yAxisX,
      };
    }

    const firstT = chartPoints[0]?.t ?? Date.now() - 1000;
    const lastT = chartPoints[chartPoints.length - 1]?.t ?? Date.now();
    const t0 = firstT === lastT ? firstT - 1000 : firstT;
    const t1 = firstT === lastT ? lastT + 1000 : lastT;
    const span = Math.max(1, t1 - t0);

    const vals = chartPoints.map((p) => p.v);
    let minV = Math.min(...vals);
    let maxV = Math.max(...vals);
    if (minV === maxV) {
      minV -= 4;
      maxV += 4;
    }
    const vPad = Math.max(1.8, (maxV - minV) * 0.15);
    const yMin = minV - vPad;
    const yMax = maxV + vPad;

    const xAt = (t) => padLeft + ((t - t0) / span) * plotW;
    const yAt = (v) => {
      const t = (Number(v) - yMin) / (yMax - yMin || 1);
      return padTop + (1 - clamp(t, 0, 1)) * plotH;
    };

    const pts = chartPoints.map((p) => ({ x: xAt(p.t), y: yAt(p.v), t: p.t, v: p.v }));

    const catmullRomToBezier = (pList) => {
      if (pList.length < 2) return `M ${yAxisX} ${xAxisY}`;
      let d = `M ${pList[0].x.toFixed(2)} ${pList[0].y.toFixed(2)}`;
      for (let i = 0; i < pList.length - 1; i++) {
        const p0 = pList[i - 1] || pList[i];
        const p1 = pList[i];
        const p2 = pList[i + 1];
        const p3 = pList[i + 2] || p2;
        const tt = 0.5;
        const c1x = p1.x + (p2.x - p0.x) * (tt / 6);
        const c1y = p1.y + (p2.y - p0.y) * (tt / 6);
        const c2x = p2.x - (p3.x - p1.x) * (tt / 6);
        const c2y = p2.y - (p3.y - p1.y) * (tt / 6);
        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
      return d;
    };

    const pathLine = catmullRomToBezier(pts);
    const last = pts[pts.length - 1];

    const fillD =
      pts.length > 0
        ? `${pathLine} L ${pts[pts.length - 1].x.toFixed(2)} ${xAxisY} L ${pts[0].x.toFixed(2)} ${xAxisY} Z`
        : '';

    const yGridCount = 5;
    const yTicks = [];
    for (let i = 0; i < yGridCount; i++) {
      const frac = i / (yGridCount - 1);
      const value = yMax - frac * (yMax - yMin);
      const y = padTop + frac * plotH;
      yTicks.push({ value, y });
    }

    const tickIndexes = Array.from(new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1]));
    const xTicks = tickIndexes.map((idx) => ({
      x: pts[idx].x,
      label: idx === pts.length - 1 ? 'Maintenant' : `Mes. ${idx + 1}`,
      key: idx,
      anchor: idx === 0 ? 'start' : idx === pts.length - 1 ? 'end' : 'middle',
    }));

    const hoverPoints = pts.map((p) => ({
      x: p.x,
      y: p.y,
      value: typeof p.v === 'number' && Number.isFinite(p.v) ? p.v : 0,
    }));

    return {
      empty: false,
      W,
      H,
      padLeft,
      padRight,
      padTop,
      padBottom,
      xAxisY,
      yAxisX,
      pathLine,
      fillD,
      last,
      yTicks,
      xTicks,
      gridColor: `${c.border}`,
      axisColor: c.muted,
      lineColor: c.orange,
      fillId: 'tempAreaGrad',
      glowId: 'tempGlowGrad',
      hoverPoints,
    };
  }, [chartPoints, sw, c.orange, c.border, c.muted]);

  const clearTempChartHover = useCallback(() => setTempChartHover(null), []);

  const onTempChartPointer = useCallback(
    (e) => {
      if (graph.empty) return;
      const pts = graph.hoverPoints;
      if (!pts?.length) return;
      const lx = chartPointerLocalX(e);
      if (lx == null) return;
      const wrapW = tempChartWrapW.current || graph.W;
      const res = interpolateAlongChartFromPointer(lx, wrapW, graph.W, pts);
      if (!res || !Number.isFinite(res.value)) return;
      const tooltipW = 64;
      const vy = Number.isFinite(res.y) ? res.y : graph.H / 2;
      setTempChartHover({
        text: `${Number(res.value).toFixed(1)}°C`,
        left: Math.min(Math.max(lx - tooltipW / 2, 4), Math.max(wrapW - tooltipW - 4, 4)),
        top: Math.max(Math.min(vy - 38, graph.H - 34), 4),
      });
    },
    [graph]
  );

  const tempChartPointerProps =
    Platform.OS === 'web'
      ? { onMouseMove: onTempChartPointer, onMouseLeave: clearTempChartHover }
      : { onPointerMove: onTempChartPointer, onPointerLeave: clearTempChartHover };

  const tempHistoryRows = useMemo(() => {
    const rows = Array.isArray(fullTempHistory) ? fullTempHistory : [];
    return [...rows].sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [fullTempHistory]);

  const filteredTempHistoryRows = useMemo(
    () => filterHistoryRowsByQuery(tempHistoryRows, tempHistorySearch, 'temp'),
    [tempHistoryRows, tempHistorySearch]
  );

  const closeTempHistoryModal = () => {
    setTempHistoryModal(false);
    setTempHistorySearch('');
  };

  const openTemperatureHistory = async () => {
    setTempHistoryModal(true);
    setLoadingTempHistory(true);
    try {
      const { data, error } = await fetchRobotMeasurementsHistoryExtended(scope, 200);
      if (error) throw error;
      setFullTempHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      await popup.alert('Erreur', e?.message || "Impossible de charger l'historique.");
      setFullTempHistory([]);
    } finally {
      setLoadingTempHistory(false);
    }
  };

  return (
    <GradientBackground>
      {popup.renderPopup}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>Température — {resolvedRobotName}</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>Chargement…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{loadError}</Text>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[`${c.blue}44`, `${c.card2}`, `${c.orange}26`]}
              start={{ x: 0.05, y: 0.05 }}
              end={{ x: 1, y: 0.95 }}
              style={styles.heroCard}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroLeft}>
                  <View style={styles.measureBadge}>
                    <Text style={styles.measureBadgeIcon}>🌡️</Text>
                    <Text style={styles.measureBadgeText}>Dernière mesure</Text>
                  </View>

                  <Text style={styles.kpiValue}>
                    {latestTemp === null || !Number.isFinite(latestTemp) ? '--' : `${latestTemp.toFixed(1)}°C`}
                  </Text>

                  <View style={styles.statusBadge}>
                    <Text style={styles.statusEmoji}>{statusEmoji(currentStatus)}</Text>
                    <Text style={styles.statusText}>{currentStatus}</Text>
                  </View>
                </View>

                <View style={styles.robotZone}>
                  <View style={styles.orangeGlow} />
                  <View style={styles.robotHead}>
                    <View style={styles.robotCamera} />
                    <Text style={styles.robotFace}>⌒ ⌒</Text>
                    <Text style={styles.robotSmile}>◡</Text>
                    <Text style={styles.robotThermo}>🌡️</Text>
                  </View>
                  <View style={styles.robotNeck} />
                  <View style={styles.robotBase}>
                    <View style={styles.robotWheel} />
                    <View style={styles.robotWheel} />
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.lastMeasureBanner}>
              <Text style={styles.lastMeasureLabel}>🕒 Dernière mesure</Text>
              <Text style={styles.lastMeasureValue} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                {lastMeasurementLabel}
              </Text>
            </View>

            <View style={styles.graphCard}>
              <View style={styles.graphHeader}>
                <View style={styles.graphTitleRow}>
                  <View style={styles.graphIconBox}>
                    <Text style={styles.graphIcon}>📈</Text>
                  </View>
                  <View style={styles.graphTextWrap}>
                    <Text style={styles.graphTitle}>Température </Text>
                    <Text style={styles.graphSubtitle}>Historique réel</Text>
                  </View>
                </View>
                <View style={styles.periodPill}>
                  <Text style={styles.periodPillText}>10 mesures</Text>
                </View>
              </View>

              {graph.empty ? (
                <Text style={styles.graphEmpty}>Aucune mesure de température enregistrée.</Text>
              ) : (
                <View
                  style={[
                    styles.chartSvgWrap,
                    { width: graph.W, alignSelf: 'center' },
                    Platform.OS === 'web' ? { cursor: 'crosshair' } : null,
                  ]}
                  onLayout={(e) => {
                    tempChartWrapW.current = e.nativeEvent.layout.width;
                  }}
                  collapsable={false}
                  {...tempChartPointerProps}
                >
                  <Svg width={graph.W} height={graph.H} style={styles.graphSvg}>
                    <Defs>
                      <SvgLinearGradient id={graph.fillId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={graph.lineColor} stopOpacity="0.42" />
                        <Stop offset="1" stopColor={graph.lineColor} stopOpacity="0.03" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id={graph.glowId} x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={graph.lineColor} stopOpacity="0.18" />
                        <Stop offset="1" stopColor={graph.lineColor} stopOpacity="0.75" />
                      </SvgLinearGradient>
                    </Defs>

                    {graph.yTicks.map((tk, idx) => (
                      <Line
                        key={`grid-${idx}`}
                        x1={graph.yAxisX}
                        y1={tk.y}
                        x2={graph.W - graph.padRight}
                        y2={tk.y}
                        stroke={graph.gridColor}
                        strokeWidth="1"
                        strokeDasharray="5 8"
                        opacity={0.55}
                      />
                    ))}

                    <Line
                      x1={graph.yAxisX}
                      y1={graph.padTop}
                      x2={graph.yAxisX}
                      y2={graph.xAxisY}
                      stroke={graph.axisColor}
                      strokeWidth="1.5"
                    />
                    <Line
                      x1={graph.yAxisX}
                      y1={graph.xAxisY}
                      x2={graph.W - graph.padRight}
                      y2={graph.xAxisY}
                      stroke={graph.axisColor}
                      strokeWidth="1.5"
                    />

                    <Path d={graph.fillD} fill={`url(#${graph.fillId})`} />
                    <Path
                      d={graph.pathLine}
                      stroke={graph.lineColor}
                      strokeWidth="7"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.16"
                    />
                    <Path
                      d={graph.pathLine}
                      stroke={`url(#${graph.glowId})`}
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Circle
                      cx={graph.last.x}
                      cy={graph.last.y}
                      r="8"
                      fill={graph.lineColor}
                      stroke={c.text}
                      strokeWidth="2"
                      opacity="0.96"
                    />

                    {graph.yTicks.map((tk, idx) => (
                      <SvgText key={`yt-${idx}`} x={6} y={tk.y + 4} fill={c.muted} fontSize="11" fontWeight="800">
                        {tk.value.toFixed(0)}°
                      </SvgText>
                    ))}

                    {graph.xTicks.map((tk) => (
                      <SvgText
                        key={`xt-${tk.key}`}
                        x={tk.x}
                        y={graph.H - 8}
                        fill={c.muted}
                        fontSize="11"
                        fontWeight="800"
                        textAnchor={tk.anchor}
                      >
                        {tk.label}
                      </SvgText>
                    ))}
                  </Svg>
                  {tempChartHover ? (
                    <View
                      style={[
                        styles.chartTooltip,
                        { left: tempChartHover.left, top: tempChartHover.top },
                      ]}
                      pointerEvents="none"
                    >
                      <Text style={styles.chartTooltipText}>{tempChartHover.text}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconBlue]}><Text style={styles.statEmoji}>❄️</Text></View>
                <Text style={styles.statLabelBlue}>Min</Text>
                <Text style={styles.statValue}>{stats.min}</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconPurple]}><Text style={styles.statEmoji}>〰️</Text></View>
                <Text style={styles.statLabelPurple}>Moyenne</Text>
                <Text style={styles.statValue}>{stats.avg}</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconRed]}><Text style={styles.statEmoji}>🔥</Text></View>
                <Text style={styles.statLabelRed}>Max</Text>
                <Text style={styles.statValue}>{stats.max}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.historyBtn} activeOpacity={0.9} onPress={openTemperatureHistory}>
              <Text style={styles.historyBtnIcon}>📋</Text>
              <Text style={styles.historyBtnText}>Historique complet</Text>
              <Text style={styles.historyBtnArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal
        visible={tempHistoryModal}
        animationType="slide"
        transparent
        onRequestClose={closeTempHistoryModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique température — {resolvedRobotName}</Text>
              <TouchableOpacity
                onPress={closeTempHistoryModal}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>robot_measurements (Supabase)</Text>

            {loadingTempHistory ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={c.text} />
                <Text style={styles.modalLoadingText}>Chargement…</Text>
              </View>
            ) : tempHistoryRows.length === 0 ? (
              <Text style={styles.modalEmpty}>Aucune mesure enregistrée pour ce robot.</Text>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher (date, heure, °C, robot, id…)"
                    placeholderTextColor={c.muted}
                    value={tempHistorySearch}
                    onChangeText={setTempHistorySearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {tempHistorySearch.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setTempHistorySearch('')}
                      style={styles.searchClear}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.searchClearText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {filteredTempHistoryRows.length === 0 ? (
                  <Text style={styles.modalEmpty}>Aucun résultat pour cette recherche.</Text>
                ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.tableHeadRow}>
                    <Text style={[styles.th, styles.colDate]}>Date</Text>
                    <Text style={[styles.th, styles.colTime]}>Heure</Text>
                    <Text style={[styles.th, styles.colTemp]}>Temp. °C</Text>
                    <Text style={[styles.th, styles.colRobot]}>Robot</Text>
                    <Text style={[styles.th, styles.colId]}>ID</Text>
                  </View>
                  <ScrollView style={styles.tableBody} nestedScrollEnabled>
                    {filteredTempHistoryRows.map((row, idx) => {
                      const d = row?.created_at ? new Date(row.created_at) : null;
                      const dateStr = d ? d.toLocaleDateString('fr-FR') : '—';
                      const timeStr = d
                        ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '—';
                      const temp = screenRowTemp(row);
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
                          <Text style={[styles.td, styles.colTemp]} numberOfLines={1}>
                            {temp != null && Number.isFinite(temp) ? temp.toFixed(1) : '—'}
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
  container: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingRight: 50,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: c.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  backText: {
    color: c.orange,
    fontSize: 22,
    fontWeight: '900',
  },
  title: {
    flex: 1,
    color: c.text,
    fontSize: 18,
    fontWeight: '900',
  },
  center: {
    marginTop: 40,
    alignItems: 'center',
  },
  muted: {
    marginTop: 10,
    color: c.muted,
  },
  error: {
    color: c.danger,
    textAlign: 'center',
  },
  heroCard: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${c.blue}55`,
    overflow: 'hidden',
    minHeight: 235,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 205,
  },
  heroLeft: {
    flex: 1.12,
    zIndex: 2,
  },
  measureBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${c.blue}2F`,
    borderColor: `${c.blue}66`,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  measureBadgeIcon: {
    fontSize: 16,
    marginRight: 7,
  },
  measureBadgeText: {
    color: c.text,
    fontSize: 12,
    fontWeight: '800',
  },
  kpiValue: {
    color: c.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${c.orange}22`,
    borderColor: `${c.orange}AA`,
    borderWidth: 1.2,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  statusEmoji: {
    fontSize: 19,
    marginRight: 8,
  },
  statusText: {
    color: c.orange,
    fontSize: 18,
    fontWeight: '900',
  },
  /** Bandeau type pilule : fond bleu très clair, bordure bleue, date en bleu marine (cf. maquette). */
  lastMeasureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginBottom: 18,
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
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  robotZone: {
    flex: 0.88,
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  orangeGlow: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: `${c.orange}44`,
    right: 2,
    top: 32,
  },
  robotHead: {
    width: 82,
    height: 130,
    borderRadius: 20,
    backgroundColor: '#0A0F1E',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.36)',
    alignItems: 'center',
    paddingTop: 8,
    shadowColor: c.orange,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  robotCamera: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.blue,
    marginBottom: 18,
  },
  robotFace: {
    color: c.orange,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 4,
    marginLeft: 4,
  },
  robotSmile: {
    color: c.orange,
    fontSize: 24,
    fontWeight: '900',
    marginTop: -8,
    marginBottom: 10,
  },
  robotThermo: {
    fontSize: 22,
  },
  robotNeck: {
    width: 42,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  robotBase: {
    width: 108,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: -5,
  },
  robotWheel: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#121827',
    borderWidth: 4,
    borderColor: '#7F1D1D',
    marginBottom: -8,
  },
  graphCard: {
    backgroundColor: c.card,
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  graphTitleRow: {
    flexDirection: 'row',
    flex: 1,
    paddingRight: 10,
  },
  graphIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: `${c.orange}18`,
    borderWidth: 1,
    borderColor: `${c.orange}75`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  graphIcon: {
    fontSize: 22,
  },
  graphTextWrap: {
    flex: 1,
  },
  graphTitle: {
    color: c.text,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 3,
  },
  graphSubtitle: {
    color: c.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  periodPill: {
    backgroundColor: c.card2,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  periodPillText: {
    color: c.text,
    fontSize: 13,
    fontWeight: '900',
  },
  chartSvgWrap: {
    position: 'relative',
  },
  chartTooltip: {
    position: 'absolute',
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: isLight ? 'rgba(15, 30, 58, 0.88)' : 'rgba(0, 0, 0, 0.78)',
    borderWidth: 1,
    borderColor: isLight ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.2)',
    zIndex: 30,
    alignItems: 'center',
  },
  chartTooltipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  graphSvg: {
    alignSelf: 'center',
  },
  graphEmpty: {
    color: c.muted,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statCard: {
    width: '31.7%',
    minHeight: 118,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 22,
    padding: 10,
    justifyContent: 'center',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  statIconBlue: {
    backgroundColor: `${c.blue}24`,
    borderWidth: 1,
    borderColor: `${c.blue}80`,
  },
  statIconPurple: {
    backgroundColor: '#8B5CF633',
    borderWidth: 1,
    borderColor: '#8B5CF699',
  },
  statIconRed: {
    backgroundColor: '#EF444433',
    borderWidth: 1,
    borderColor: '#EF444499',
  },
  statEmoji: {
    fontSize: 19,
  },
  statLabelBlue: {
    color: c.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  statLabelPurple: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: '900',
  },
  statLabelRed: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '900',
  },
  statValue: {
    color: c.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },

  historyBtn: {
    marginTop: 4,
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
  colTemp: { width: 72 },
  colRobot: { width: 100 },
  colId: { width: 44 },
});
