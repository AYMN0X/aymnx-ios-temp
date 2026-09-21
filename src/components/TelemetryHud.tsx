import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { bootLogOnce } from '../services/bootLog';
import { useTelemetry } from '../services/telemetryService';

const MONO_FONT = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const REFRESH_MS = 1000;

export const TelemetryHud: React.FC = memo(function TelemetryHud() {
  const { heapMb, allocMb, supported } = useTelemetry(REFRESH_MS);

  bootLogOnce('TelemetryHud mounted');

  if (!supported) {
    return null;
  }

  return (
    <View style={styles.hud} pointerEvents="none">
      <View style={styles.badge}>
        <Text style={styles.mono} numberOfLines={1}>
          <Text style={styles.hardwareLabel}>HERMES: </Text>
          <Text style={styles.value}>{heapMb ?? '--'} MB</Text>
          <Text style={styles.hardwareLabel}>  ALLOC: </Text>
          <Text style={styles.allocation}>{allocMb ?? '--'} MB</Text>
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 4,
    alignItems: 'center',
    zIndex: 900,
  },
  badge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 10, 13, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mono: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
  },
  hardwareLabel: {
    color: '#ff9800',
  },
  value: {
    color: '#00e676',
  },
  allocation: {
    color: '#80d8ff',
  },
});