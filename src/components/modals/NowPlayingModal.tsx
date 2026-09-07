import { Modal, StyleSheet } from 'react-native';
import { AmbientBackground } from '../AmbientBackground';
import { Screen4 } from '../../screens/Screen4';

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
      <AmbientBackground style={styles.ambientLayer} />
      <Screen4 onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  ambientLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});