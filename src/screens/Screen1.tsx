import * as React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Color } from '../theme/GlobalStyles';

interface Screen1Props {
  onContinue?: () => void;
}

export const Screen1: React.FC<Screen1Props> = ({ onContinue }) => {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content} edges={['bottom']}>
        <View style={styles.hero}>
          <Text style={styles.heading}>Feel the beat</Text>
          <Text style={styles.subheading}>
            Immerse yourself into the world of music today
          </Text>
        </View>

        <TouchableOpacity activeOpacity={0.8} style={styles.button} onPress={onContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Color.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 48,
    gap: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  hero: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subheading: {
    fontSize: 17,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
});