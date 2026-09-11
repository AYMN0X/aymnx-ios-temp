import { Modal, StyleSheet, View } from 'react-native';
import { NowPlayingScreen } from '../../screens/NowPlayingScreen';

interface NowPlayingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NowPlayingModal({ visible, onClose }: NowPlayingModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.background} />
      <NowPlayingScreen onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B0C0E',
  },
});