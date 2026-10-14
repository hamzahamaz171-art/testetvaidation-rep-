import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';
import { useThemedPopup } from '../components/useThemedPopup';

const REACTIONS = [
  { key: 'like', label: "J'aime", icon: 'thumbs-up' },
  { key: 'dislike', label: "Je n'aime pas", icon: 'thumbs-down' },
  { key: 'haha', label: 'Haha', icon: 'happy' },
  { key: 'love', label: "J'adore", icon: 'heart' },
];

export default function ReactionsScreen({ navigation, route }) {
  const c = useThemeColors();
  const popup = useThemedPopup();
  const robotName = route?.params?.robotName || 'AdBot R1';

  const COLORS = useMemo(
    () => ({
      bg: c.bg,
      bg2: c.bg2 || c.bg,
      card: c.card,
      card2: c.card2,
      text: c.text,
      muted: c.muted,
      orange: c.orange,
      border: 'rgba(255,255,255,0.12)',
      inputBg: 'rgba(255,255,255,0.06)',
    }),
    [c]
  );
  const styles = makeStyles(COLORS);

  const [selectedReaction, setSelectedReaction] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // ⭐ Tiny tap animation per star (UI only)
  const starScales = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current;
  const animateStar = (idx) => {
    const v = starScales[idx];
    if (!v) return;
    v.stopAnimation();
    v.setValue(1);
    Animated.sequence([
      Animated.spring(v, { toValue: 1.22, useNativeDriver: true, speed: 30, bounciness: 10 }),
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
    ]).start();
  };
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!selectedReaction && !rating && !comment.trim()) {
      await popup.alert('Info', "Choisis une réaction, une note ou écris un commentaire avant d'envoyer.");
      return;
    }

    try {
      setSending(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const u = sessionData?.session?.user;
      if (!u) {
        await popup.alert('Connexion requise', 'Connecte-toi pour envoyer une réaction.');
        return;
      }

      // DB expects: user_id + robot_name + reaction_type in {like,dislike,funny,love}
      const dbReactionType = selectedReaction === 'haha' ? 'funny' : (selectedReaction || 'none');

      // Store rating in interaction_seconds (integer 0-5) to avoid schema changes.
      // Store comment in message. Reaction key is reaction_type.
      const payload = {
        user_id: u.id,
        robot_name: robotName,
        reaction_type: dbReactionType,
        count: 1,
        message: comment?.trim() ? comment.trim() : null,
        interaction_seconds: rating || 0,
      };

      const { error } = await supabase.from('reactions_events').insert([payload]);
      if (error) throw error;

      await popup.alert('Merci ✅', 'Avis envoyé.');
      setSelectedReaction(null);
      setRating(0);
      setComment('');
    } catch (e) {
      console.log('send reaction error', e);
      await popup.alert('Erreur', "Impossible d'envoyer pour le moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bg} />
      {popup.renderPopup}

      {/* Top bar: back + ReactionsDetails */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.orange} />
        </TouchableOpacity>

        <Text style={styles.robotName}>{robotName}</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate('ReactionsDetails', { robotName })}
          style={[styles.detailsBtn]}
          activeOpacity={0.85}
        >
          <Text style={styles.detailsBtnText}>ReactionsDetails</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Donnez votre avis</Text>
          <Text style={styles.subTitle}>Que pensez-vous de votre expérience ?</Text>

          {/* Quick reactions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Réactions rapides</Text>
            <View style={styles.reactionsRow}>
              {REACTIONS.map((r) => {
                const active = selectedReaction === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => setSelectedReaction(r.key)}
                    activeOpacity={0.85}
                    style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                  >
                    <Ionicons
                      name={r.icon}
                      size={20}
                      color={active ? COLORS.orange : COLORS.text}
                      style={{ marginBottom: 6 }}
                    />
                    <Text style={[styles.reactionLabel, active && { color: COLORS.orange }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Rating */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Évaluer votre expérience</Text>
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }).map((_, i) => {
                const idx = i + 1;
                const filled = idx <= rating;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      setRating(idx);
                      animateStar(i);
                    }}
                    activeOpacity={0.8}
                    style={styles.starBtn}
                  >
                    <Animated.View style={{ transform: [{ scale: starScales[i] }] }}>
                      <Ionicons
                        name={filled ? 'star' : 'star-outline'}
                        size={28}
                        color={filled ? COLORS.orange : COLORS.muted}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Comment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Laissez-nous un commentaire</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Écrire ici..."
              placeholderTextColor={COLORS.muted}
              multiline
              style={styles.input}
            />
          </View>

          <TouchableOpacity
            onPress={send}
            activeOpacity={0.9}
            disabled={sending}
            style={[styles.sendBtn, sending && { opacity: 0.75 }]}
          >
            <Text style={styles.sendBtnText}>{sending ? 'Envoi…' : 'Envoyer'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.bg },
    bg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: COLORS.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,152,0,0.35)',
    },
    robotName: {
      color: COLORS.text,
      fontWeight: '900',
      fontSize: 14,
      marginLeft: 10,
      flex: 1,
    },
    detailsBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,152,0,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,152,0,0.45)',
    },
    detailsBtnText: { color: COLORS.orange, fontWeight: '900' },
    container: {
      padding: 18,
      paddingBottom: 34,
    },
    title: {
      color: COLORS.text,
      fontSize: 24,
      fontWeight: '900',
      marginTop: 4,
    },
    subTitle: {
      color: COLORS.muted,
      marginTop: 6,
      fontWeight: '700',
    },
    section: {
      marginTop: 18,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 18,
      padding: 14,
    },
    sectionTitle: {
      color: COLORS.text,
      fontWeight: '900',
      marginBottom: 12,
      fontSize: 14,
    },
    reactionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    reactionBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: COLORS.card2,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    reactionBtnActive: {
      borderColor: 'rgba(255,152,0,0.55)',
      backgroundColor: 'rgba(255,152,0,0.10)',
    },
    reactionLabel: {
      color: COLORS.text,
      fontWeight: '800',
      fontSize: 12,
      textAlign: 'center',
    },
    starsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    starBtn: {
      marginRight: 6,
    },
    input: {
      minHeight: 110,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: COLORS.inputBg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      color: COLORS.text,
      fontWeight: '700',
      textAlignVertical: 'top',
    },
    sendBtn: {
      marginTop: 18,
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: COLORS.orange,
    },
    sendBtnText: {
      color: '#0b1020',
      fontWeight: '900',
      fontSize: 16,
    },
  });
