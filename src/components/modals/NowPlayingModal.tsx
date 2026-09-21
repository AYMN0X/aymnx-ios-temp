import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { NowPlayingScreen } from '../../screens/NowPlayingScreen';

interface NowPlayingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NowPlayingModal({ visible, onClose }: NowPlayingModalProps) {
  useEffect(() => {
    if (visible) {
      return;
    }
    Image.clearMemoryCache()
      .catch(() => undefined);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {visible ? (
        <View style={styles.overlay}>
          <NowPlayingScreen onClose={onClose} />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
});