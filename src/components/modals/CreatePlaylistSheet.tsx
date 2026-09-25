import { useState } from 'react';
import type { RefObject } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLibrary } from '../../context/LibraryContext';
import type { SavedPlaylist } from '../../services/storage';
import { COLORS } from '../../theme/appTheme';

const ABSORB_TAP = () => {};

interface CreatePlaylistSheetProps {
  blurTarget?: RefObject<View | null>;
  onClose: () => void;
  onCreated: (playlist: SavedPlaylist) => void;
}

export function CreatePlaylistSheet({ blurTarget, onClose, onCreated }: CreatePlaylistSheetProps) {
  const { createPlaylist } = useLibrary();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  const pickCover = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library access is needed to choose a cover.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setCoverUri(result.assets[0].uri);
        setError(null);
      }
    } catch (err) {
      console.warn('[library] Could not pick a cover image.', err);
      setError('Could not open your photo library.');
    }
  };

  const handleCreate = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createPlaylist(trimmedName, {
        description: description.trim() || undefined,
        coverUrl: coverUri ?? undefined,
      });
      if (!created) {
        setError('Could not create the playlist. Please try again.');
        setSubmitting(false);
        return;
      }
      onCreated(created);
    } catch (err) {
      console.warn('[library] Creating a playlist failed.', err);
      setError('Could not create the playlist. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable style={styles.scrim} onPress={onClose} />
        <Pressable style={styles.card} onPress={ABSORB_TAP}>
          <BlurView
            blurMethod="dimezisBlurView"
            blurTarget={blurTarget}
            intensity={28}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tint="systemUltraThinMaterialDark"
          />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>New Playlist</Text>

            <Pressable style={styles.coverSlot} onPress={pickCover}>
              {coverUri ? (
                <>
                  <Image source={{ uri: coverUri }} style={styles.coverImage} />
                  <View style={styles.coverEditBadge}>
                    <Ionicons name="pencil" size={13} color="#111216" />
                  </View>
                </>
              ) : (
                <View style={styles.coverEmpty}>
                  <Ionicons name="image-outline" size={26} color="rgba(255, 255, 255, 0.5)" />
                  <Text style={styles.coverEmptyLabel}>Choose cover</Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Give your playlist a name"
              placeholderTextColor={COLORS.placeholder}
              autoFocus={false}
              returnKeyType="next"
            />

            <TextInput
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add an optional description"
              placeholderTextColor={COLORS.placeholder}
              autoFocus={false}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                style={styles.cancelButton}
                onPress={onClose}
                disabled={submitting}
                hitSlop={8}
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
                onPress={handleCreate}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Create playlist"
                accessibilityState={{ disabled: !canSubmit, busy: submitting }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.createLabel}>Create</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '92%',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(20, 20, 24, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 18,
  },
  coverSlot: {
    width: 110,
    height: 110,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  coverEmptyLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  coverEditBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  descriptionInput: {
    minHeight: 76,
    fontSize: 14,
  },
  error: {
    fontSize: 12,
    color: '#E05A47',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  createButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
});
