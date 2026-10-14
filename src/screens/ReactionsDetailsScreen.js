import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';
import { useThemedPopup } from '../components/useThemedPopup';

export default function ReactionsDetailsScreen({ navigation, route }) {
  const c = useThemeColors();
  const popup = useThemedPopup();
  const styles = makeStyles(c);
  const robotName = route?.params?.robotName || 'AdBot R1';
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [history, setHistory] = useState([]);
  const [counts, setCounts] = useState({ like: 0, dislike: 0, funny: 0, love: 0 });
  const [avgSeconds, setAvgSeconds] = useState(0);
  const [errorText, setErrorText] = useState('');

  const totals = useMemo(() => {
    const like = Number(counts.like || 0);
    const dislike = Number(counts.dislike || 0);
    const funny = Number(counts.funny || 0);
    const love = Number(counts.love || 0);
    const total = like + dislike + funny + love;
    return { like, dislike, funny, love, total, avgSeconds };
  }, [counts, avgSeconds]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorText('');

      const { data: sessionData } = await supabase.auth.getSession();
      const u = sessionData?.session?.user;
      if (!u) {
        setErrorText('Utilisateur non connecté.');
        setLoading(false);
        return;
      }
      setUserId(u.id);

      const { data, error } = await supabase
        .from('reactions_events')
        .select('id,reaction_type,count,message,created_at,interaction_seconds,robot_name')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) {
        setErrorText(error.message);
        setLoading(false);
        return;
      }

      const rows = data || [];
      const c = { like: 0, dislike: 0, funny: 0, love: 0 };
      let secsSum = 0;
      let secsN = 0;
      const mapped = rows.map((r) => {
        const k = r.reaction_type;
        if (c[k] !== undefined) c[k] += Number(r.count || 0);
        if (typeof r.interaction_seconds === 'number') {
          secsSum += r.interaction_seconds;
          secsN += 1;
        }

        const dt = new Date(r.created_at);
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');
        const meta = reactionMeta(k);
        const inc = Number(r.count || 0);
        const text = r.message || `${inc} ${meta.text}`;
        return {
          id: r.id,
          key: k,
          emoji: meta.emoji,
          time: `${hh}:${mm}`,
          inc,
          text,
        };
      });

      setCounts(c);
      setAvgSeconds(secsN ? Math.round(secsSum / secsN) : 0);
      setHistory(mapped);
      setLoading(false);
    } catch (e) {
      setErrorText(String(e?.message || e));
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteItem = async (id) => {
    try {
      if (!userId) return;
      const { error } = await supabase.from('reactions_events').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      setHistory((h) => h.filter((x) => x.id !== id));
      // reload counts quickly
      loadData();
    } catch (e) {
      await popup.alert('Erreur', String(e?.message || e));
    }
  };

  const clearAll = async () => {
    try {
      if (!userId) return;
      const confirm = await popup.confirm('Effacer', 'Supprimer tout l’historique des réactions ?', {
        okText: 'Oui',
        destructive: true,
      });
      if (!confirm) return;
      const { error } = await supabase.from('reactions_events').delete().eq('user_id', userId);
      if (error) throw error;
      setHistory([]);
      setCounts({ like: 0, dislike: 0, funny: 0, love: 0 });
      setAvgSeconds(0);
    } catch (e) {
      await popup.alert('Erreur', String(e?.message || e));
    }
  };

  return (
    <GradientBackground>
      {popup.renderPopup}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Réactions - {robotName}</Text>
        </View>

        {/* Summary bar (4 types) */}
        <View style={styles.summaryBar}>
          <SummaryPill styles={styles} emoji="👍" value={totals.like} />
          <SummaryPill styles={styles} emoji="👎" value={totals.dislike} />
          <SummaryPill styles={styles} emoji="😂" value={totals.funny} />
          <SummaryPill styles={styles} emoji="❤️" value={totals.love} />
        </View>

        <View style={styles.summaryTextBox}>
          <Text style={styles.summaryTotal}>{totals.total} Réactions en total</Text>
          <Text style={styles.summarySub}>Interactions Moyenne: {totals.avgSeconds}s</Text>
        </View>

        {loading && (
          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={{ color: c.muted, marginTop: 10 }}>Chargement…</Text>
          </View>
        )}

        {!!errorText && !loading && (
          <View style={{ marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,0,0,0.10)', borderWidth: 1, borderColor: 'rgba(255,0,0,0.25)' }}>
            <Text style={{ color: '#ffb4b4', fontWeight: '800' }}>{errorText}</Text>
            <TouchableOpacity onPress={loadData} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Text style={{ color: c.orange, fontWeight: '900' }}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        <View style={{ marginTop: 14 }}>
          {(history.length ? history : []).map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyEmoji}>{item.emoji}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.historyTime}>Aujourd'hui, {item.time}</Text>
                <Text style={styles.historyText}>{item.text}</Text>
                <View style={[styles.miniBar, { width: `${Math.min(100, Math.max(10, item.inc * 5))}%` }]} />
                <Text style={styles.historyBy}>by: myteurs</Text>
              </View>

              <View style={styles.historyRight}>
                <Text style={styles.historyInc}>+{item.inc}</Text>
                <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.trashBtn} activeOpacity={0.8}>
                  <Text style={styles.trashIcon}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {!loading && !errorText && history.length === 0 && (
            <View style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.07)' }}>
              <Text style={{ color: c.muted, fontWeight: '800' }}>Aucune réaction enregistrée pour le moment.</Text>
            </View>
          )}
        </View>

        {/* Footer actions */}
        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.footerBtn} onPress={clearAll} activeOpacity={0.9}>
            <Text style={styles.footerBtnText}>Effacer</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </GradientBackground>
  );
}

function SummaryPill({ styles, emoji, value }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillEmoji}>{emoji}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

function reactionMeta(key) {
  const map = {
    like: { emoji: '👍', text: "personnes ont aimé ce message" },
    dislike: { emoji: '👎', text: "personnes n'ont pas aimé" },
    funny: { emoji: '😂', text: "personnes ont trouvé ça drôle" },
    love: { emoji: '❤️', text: "personnes ont adoré ce message" },
  };
  return map[key] || { emoji: '✨', text: 'réaction' };
}

const makeStyles = (c) => StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
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
  summaryBar: {
    marginTop: 14,
    backgroundColor: 'rgba(255, 140, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pillEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  pillValue: {
    color: c.text,
    fontWeight: '900',
  },
  summaryTextBox: {
    marginTop: 12,
    alignItems: 'center',
  },
  summaryTotal: {
    color: c.text,
    fontWeight: '900',
    fontSize: 18,
  },
  summarySub: {
    color: c.muted,
    marginTop: 4,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  historyLeft: {
    width: 40,
    alignItems: 'center',
    marginRight: 10,
    paddingTop: 2,
  },
  historyEmoji: {
    fontSize: 24,
  },
  historyTime: {
    color: c.muted,
    fontWeight: '800',
  },
  historyText: {
    color: c.text,
    fontWeight: '900',
    marginTop: 2,
  },
  miniBar: {
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(0, 180, 255, 0.65)',
    marginTop: 10,
  },
  historyBy: {
    color: 'rgba(255,255,255,0.40)',
    marginTop: 6,
    fontWeight: '700',
    fontSize: 11,
  },
  historyRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  historyInc: {
    color: '#7CFF83',
    fontWeight: '900',
    fontSize: 16,
  },
  trashBtn: {
    marginTop: 8,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  trashIcon: {
    fontSize: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  footerBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerBtnText: {
    color: c.text,
    fontWeight: '900',
  },
});
