import React from 'react';
import { View } from 'react-native';

// Simple pager indicator like the screenshot (one active bar + inactive bars)
export default function PageDots({ index = 0, total = 3 }) {
  const items = Array.from({ length: total });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {items.map((_, i) => (
        <View
          key={i}
          style={{
            width: i === index ? 38 : 34,
            height: 6,
            borderRadius: 999,
            opacity: i === index ? 1 : 0.25,
            backgroundColor: '#FFFFFF',
          }}
        />
      ))}
    </View>
  );
}
