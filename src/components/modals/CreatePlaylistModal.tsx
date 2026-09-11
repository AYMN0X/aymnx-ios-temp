import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLibrary } from '../../context/LibraryContext';
import { COLORS } from '../../theme/appTheme';

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatePlaylistModal({ visible, onClose }: CreatePlaylistModalProps) {
  const { createPlaylist } = useLibrary();
  const [name, setName] = useState('');

  useEffect(() => {
    if (!visible) {
      setName('');
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Create Playlist</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={COLORS.placeholder}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.createBtn, !name.trim() && styles.disabled]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={styles.createLabel}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  backdropFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 20,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    height: 46,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 15,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
});