import Feather from '@expo/vector-icons/Feather';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const { user, logout } = useAuth();
  const userInitial = (user?.name || user?.username || '?').charAt(0).toUpperCase();
  const emailLabel = user?.isGuest ? 'Guest account' : user?.username || 'No email';

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.centerWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Feather name="x" size={18} color="#8A8F9D" />
          </Pressable>
          <View style={styles.centerAvatar}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.centerAvatar} />
            ) : (
              <Text style={styles.centerAvatarLetter}>{userInitial}</Text>
            )}
          </View>
          <Text style={styles.cardName} numberOfLines={1}>
            {user?.name || 'User'}
          </Text>
          <Text style={styles.cardEmail} numberOfLines={1}>
            {emailLabel}
          </Text>
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={18} color="#8A8F9D" />
            <Text style={styles.logoutLabel}>Log out</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#16171B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#23252B',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 2,
  },
  centerAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#9066FE',
  },
  centerAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 14,
  },
  cardEmail: {
    color: '#8A8F9D',
    fontSize: 13,
    marginTop: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#23252B',
    alignSelf: 'stretch',
    paddingTop: 18,
  },
  logoutLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});