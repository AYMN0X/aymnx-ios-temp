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

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.acctBackdrop} onPress={onClose}>
        <Pressable style={styles.acctSheet} onPress={() => {}}>
          <View />
          <View style={styles.acctProfile}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.acctAvatar} />
            ) : (
              <View style={[styles.acctAvatar, styles.acctAvatarFallback]}>
                <Text style={styles.acctAvatarLetter}>{userInitial}</Text>
              </View>
            )}
            <View style={styles.acctMeta}>
              <Text style={styles.acctName} numberOfLines={1}>
                {user?.name}
              </Text>
              <Text style={styles.acctUsername} numberOfLines={1}>
                @{user?.username}
              </Text>
            </View>
          </View>
          <Pressable style={styles.acctLogoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={20} color="#B3B3B3" />
            <Text style={styles.acctLogoutLabel}>Log out</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  acctBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  acctSheet: {
    backgroundColor: '#282828',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  acctProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  acctAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  acctAvatarFallback: {
    backgroundColor: '#1ED760',
  },
  acctAvatarLetter: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '700',
  },
  acctMeta: {
    flex: 1,
    marginLeft: 14,
  },
  acctName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  acctUsername: {
    color: '#B3B3B3',
    fontSize: 13,
    marginTop: 2,
  },
  acctLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  acctLogoutLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 16,
  },
});