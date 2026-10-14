import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
export default function PasswordInput({ value, onChangeText, placeholder }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={!visible}
        style={[common.input, { paddingRight: 54 }]}
        autoCapitalize="none"
      />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        style={{ position: 'absolute', right: 10, top: 10, padding: 8 }}
      >
        <Text style={{ color: c.orange, fontWeight: '800' }}>
          {visible ? 'Hide' : 'Show'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
