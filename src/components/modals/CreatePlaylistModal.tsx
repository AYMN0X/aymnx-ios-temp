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
      <Pressable onPress={onClose}>
        <Pressable onPress={() => {}}>
          <Text>Create Playlist</Text>
          <View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Playlist name"
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Pressable
              style={!name.trim() && styles.disabled}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text>Create</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});