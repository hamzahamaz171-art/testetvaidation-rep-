import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/useThemeColors';

export function useThemedPopup() {
  const c = useThemeColors();
  const isDark = c.text === '#E6EDFF';
  const [state, setState] = useState(null);

  const open = useCallback((title, message, buttons) => {
    return new Promise((resolve) => {
      const safeButtons = Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }];
      setState({
        title: title || 'Info',
        message: message || '',
        buttons: safeButtons,
        resolve,
      });
    });
  }, []);

  const alert = useCallback(
    async (title, message) => {
      await open(title, message, [{ text: 'OK', value: true }]);
    },
    [open]
  );

  const confirm = useCallback(
    async (title, message, options = {}) => {
      const value = await open(title, message, [
        { text: options.cancelText || 'Annuler', style: 'cancel', value: false },
        {
          text: options.okText || 'Confirmer',
          style: options.destructive ? 'destructive' : 'default',
          value: true,
        },
      ]);
      return !!value;
    },
    [open]
  );

  const closeWith = useCallback((button) => {
    setState((prev) => {
      if (!prev) return prev;
      const resolve = prev.resolve;
      const nextValue = button?.value ?? (button?.style === 'cancel' ? false : true);
      setTimeout(() => {
        if (typeof button?.onPress === 'function') button.onPress();
        if (typeof resolve === 'function') resolve(nextValue);
      }, 0);
      return null;
    });
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        },
        card: {
          width: '100%',
          maxWidth: 380,
          backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.99)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,58,0.14)',
          borderRadius: 20,
          padding: 16,
        },
        title: { color: c.text, fontSize: 17, fontWeight: '900' },
        message: { color: c.muted, marginTop: 8, lineHeight: 20, fontWeight: '700' },
        row: {
          marginTop: 16,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 10,
        },
        btn: {
          borderRadius: 12,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        btnText: { fontWeight: '900' },
      }),
    [c.muted, c.text, isDark]
  );

  const renderPopup = (
    <Modal
      visible={!!state}
      transparent
      animationType="fade"
      onRequestClose={() => closeWith({ style: 'cancel', value: false })}
    >
      <Pressable style={styles.overlay} onPress={() => closeWith({ style: 'cancel', value: false })}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{state?.title || ''}</Text>
          {!!state?.message && <Text style={styles.message}>{state.message}</Text>}
          <View style={styles.row}>
            {(state?.buttons || []).map((btn, idx) => {
              const isDanger = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const bg = isDanger
                ? 'rgba(220,38,38,0.16)'
                : isCancel
                ? isDark
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(15,30,58,0.05)'
                : 'rgba(245,158,11,0.18)';
              const border = isDanger
                ? 'rgba(220,38,38,0.45)'
                : isCancel
                ? isDark
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(15,30,58,0.14)'
                : 'rgba(245,158,11,0.45)';
              const color = isDanger ? '#ef4444' : isCancel ? c.text : c.orange;
              return (
                <Pressable
                  key={`${btn.text || 'btn'}-${idx}`}
                  onPress={() => closeWith(btn)}
                  style={[styles.btn, { backgroundColor: bg, borderColor: border }]}
                >
                  <Text style={[styles.btnText, { color }]}>{btn.text || 'OK'}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { alert, confirm, renderPopup };
}
