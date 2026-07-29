import React, { useEffect, useRef } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableWithoutFeedback, View,
} from 'react-native';

interface Props {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
}

export default function OTPBoxes({ value, onChange, hasError, autoFocus }: Props) {
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <TouchableWithoutFeedback onPress={() => ref.current?.focus()}>
      <View style={s.row}>
        {Array(6).fill(0).map((_, i) => (
          <View
            key={i}
            style={[
              s.box,
              i < value.length && !hasError && s.boxFilled,
              hasError && s.boxError,
            ]}
          >
            <Text style={s.digit}>{value[i] ?? ''}</Text>
          </View>
        ))}
        {/* Single hidden input captures typing and paste */}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={v => onChange(v.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          caretHidden
          style={s.hidden}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box:       {
    width: 48, height: 54, borderRadius: 10,
    backgroundColor: '#141414', borderWidth: 1.5, borderColor: '#2E2E2E',
    alignItems: 'center', justifyContent: 'center',
  },
  boxFilled: { borderColor: '#FF6200' },
  boxError:  { borderColor: '#EF4444' },
  digit:     { fontSize: 22, fontWeight: '700', color: '#F0F0F0' },
  hidden:    { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
