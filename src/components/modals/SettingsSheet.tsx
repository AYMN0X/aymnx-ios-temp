import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useLibrary } from '../../context/LibraryContext';
import { importSpotifyPlaylist } from '../../services/SpotifySyncService';
import { COLORS } from '../../theme/appTheme';

const SPOTIFY_GREEN = '#1ED760';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const KEYBOARD_VERTICAL_OFFSET = 0;
const DRAG_CLOSE_THRESHOLD = SCREEN_HEIGHT * 0.22;

type SettingsTab = 'profile' | 'apps';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const { user, logout, updateAvatar } = useAuth();
  const { createImportedPlaylist, playlists, refresh } = useLibrary();

  const displayName = user?.name || 'qsqmatrix';
  const emailValue = user?.username || 'qsqayman@gmail.com';
  const avatarUri = user?.avatarUrl;

  const importedCount = useMemo(
    () => playlists.filter((playlist) => playlist.isImported === true).length,
    [playlists]
  );

  const [rendered, setRendered] = useState(visible);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [segmentedWidth, setSegmentedWidth] = useState(0);
  const [playlistLink, setPlaylistLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState('');
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const slideYRef = useRef(SCREEN_HEIGHT);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const tabIndicator = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      slideY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          damping: 24,
          stiffness: 240,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      tabIndicator.setValue(activeTab === 'profile' ? 0 : 1);
    } else if (rendered) {
      animateClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const animateClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: SCREEN_HEIGHT,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setRendered(false);
      }
    });
  }, [slideY, backdropOpacity]);

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const handleRequestClose = handleClose;

  const showToast = useCallback(
    (message: string) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      const payload = { message, id: Date.now() + Math.random() };
      setToast(payload);
      toastOpacity.setValue(0);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      toastTimeoutRef.current = setTimeout(() => {
        toastTimeoutRef.current = null;
        setToast((current) => (current?.id === payload.id ? null : current));
      }, 2600);
    },
    [toastOpacity]
  );

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    Animated.spring(tabIndicator, {
      toValue: tab === 'profile' ? 0 : 1,
      damping: 22,
      stiffness: 260,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _evt: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4,
        onPanResponderGrant: () => {
          slideY.stopAnimation((value) => {
            slideYRef.current = value;
          });
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const next = Math.max(0, slideYRef.current + gesture.dy);
          slideYRef.current = next;
          slideY.setValue(next);
          backdropOpacity.setValue(Math.max(0, 1 - next / SCREEN_HEIGHT / 0.4));
        },
        onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          if (gesture.dy > DRAG_CLOSE_THRESHOLD) {
            animateClose();
            onCloseRef.current();
            return;
          }
          slideYRef.current = 0;
          Animated.parallel([
            Animated.spring(slideY, {
              toValue: 0,
              damping: 24,
              stiffness: 240,
              mass: 0.9,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [slideY, backdropOpacity, animateClose]
  );

  const pickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Photo library permission is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await updateAvatar(result.assets[0].uri);
        showToast('Profile photo updated');
      }
    } catch (error) {
      console.warn('[settings] Could not pick a photo.', error);
      showToast('Could not pick a photo.');
    }
  };

  const removeAvatar = async () => {
    await updateAvatar(undefined);
    showToast('Profile photo removed');
  };

  const handleAvatarMenu = () => {
    Alert.alert('Profile Photo', undefined, [
      { text: 'Change Photo', onPress: pickAvatar },
      { text: 'Remove Photo', onPress: removeAvatar, style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleImport = async () => {
    const url = playlistLink.trim();
    if (!url || importing) {
      return;
    }
    setImporting(true);
    setImportStage('Extracting playlist tracks...');
    showToast('Extracting playlist tracks...');
    try {
      const { promise } = importSpotifyPlaylist(url, {
        onStage: (stage) => {
          setImportStage(stage === 'matching' ? 'Matching streams...' : 'Extracting playlist tracks...');
          if (stage === 'matching') {
            showToast('Matching streams...');
          }
        },
        onProgress: (current, total) => {
          setImportStage(`Matching streams... (${current} of ${total})`);
        },
      });
      const playlist = await promise;
      const created = await createImportedPlaylist(
        playlist.title,
        playlist.artwork,
        playlist.tracks
      );
      if (!created) {
        throw new Error('Could not save the imported playlist.');
      }
      await refresh();
      setPlaylistLink('');
      const count = playlist.tracks.length;
      showToast(`Imported "${created.name}" with ${count} ${count === 1 ? 'track' : 'tracks'}`);
    } catch (error) {
      const message =
        error instanceof Error && error.message !== 'Import cancelled.'
          ? error.message
          : null;
      if (message) {
        showToast(message);
      }
    } finally {
      setImporting(false);
      setImportStage('');
    }
  };

  const handlePaste = async () => {
    if (importing) {
      return;
    }
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim()) {
        setPlaylistLink(text.trim());
        showToast('Playlist link pasted');
      } else {
        showToast('Clipboard is empty');
      }
    } catch {
      showToast('Could not read clipboard');
    }
  };

  const handleLogout = () => {
    onClose();
    logout();
  };

  const handleSave = () => {
    showToast('Changes saved');
    setTimeout(onClose, 250);
  };

  const renderAvatar = (size: number, radius: number, fontSize: number) => {
    if (avatarUri) {
      return <Image source={{ uri: avatarUri }} style={{ width: size, height: size, borderRadius: radius }} />;
    }
    return (
      <Text style={{ color: '#FFFFFF', fontSize, fontWeight: '700' }}>
        {displayName.charAt(0).toUpperCase()}
      </Text>
    );
  };

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdropFill} onPress={handleClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
          style={styles.keyboardWrap}
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: slideY }] },
            ]}
            {...panResponder.panHandlers}
          >
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <View style={styles.headerAvatar}>{renderAvatar(40, 20, 17)}</View>
            <View style={styles.headerMeta}>
              <Text style={styles.headerName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.headerSubtitle}>AYMNX Mobile</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <View
            style={styles.tabsWrap}
            onLayout={(event) => setSegmentedWidth(event.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  opacity: segmentedWidth > 0 ? 1 : 0,
                  width: Math.max((segmentedWidth - 6) / 2, 1),
                  transform: [
                    {
                      translateX: tabIndicator.interpolate({
                        inputRange: [0, 1],
                        outputRange: [3, (segmentedWidth + 6) / 2],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Pressable style={styles.tabItem} onPress={() => selectTab('profile')}>
              <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>
                Profile
              </Text>
            </Pressable>
            <Pressable style={styles.tabItem} onPress={() => selectTab('apps')}>
              <Text style={[styles.tabLabel, activeTab === 'apps' && styles.tabLabelActive]}>
                Connected Apps
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={[styles.contentInner, { paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'profile' ? (
              <View style={styles.section}>
                <View style={styles.avatarBlock}>
                  <View style={styles.avatarLarge}>{renderAvatar(84, 42, 34)}</View>
                  <Pressable style={styles.changeAvatarBtn} onPress={handleAvatarMenu} hitSlop={6}>
                    <Text style={styles.changeAvatarLabel}>Change / Remove</Text>
                  </Pressable>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>USERNAME</Text>
                  <View style={styles.fieldInputWrap}>
                    <TextInput
                      style={styles.fieldInput}
                      value={displayName}
                      editable={false}
                      selectionColor={COLORS.accent}
                    />
                    <Ionicons name="lock-closed" size={14} color={COLORS.textSecondary} />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                  <View style={styles.fieldInputWrap}>
                    <TextInput
                      style={styles.fieldInput}
                      value={emailValue}
                      editable={false}
                      autoCapitalize="none"
                      selectionColor={COLORS.accent}
                    />
                    <Ionicons name="lock-closed" size={14} color={COLORS.textSecondary} />
                  </View>
                </View>

                <View style={styles.googleBadge}>
                  <View style={styles.googleIconWrap}>
                    <Ionicons name="logo-google" size={16} color="#FFFFFF" />
                  </View>
                  <Text style={styles.googleBadgeText}>Signed in with Google</Text>
                  <Ionicons name="shield-checkmark" size={15} color={COLORS.green} />
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.spotifyCard}>
                  <View style={styles.spotifyTop}>
                    <View style={styles.spotifyLogo}>
                      <Ionicons name="musical-notes" size={24} color="#000000" />
                    </View>
                    <View style={styles.spotifyMeta}>
                      <Text style={styles.spotifyName}>Spotify</Text>
                      <Text style={styles.spotifySubLabel}>Public playlist import</Text>
                    </View>
                  </View>

                  <Text style={styles.spotifyDesc}>
                    Paste a public Spotify playlist link to import its tracks into your library.
                    No account needed.
                  </Text>

                  <View style={styles.linkInputWrap}>
                    <TextInput
                      style={styles.linkInput}
                      value={playlistLink}
                      onChangeText={setPlaylistLink}
                      placeholder="Paste Spotify Playlist Link"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={handleImport}
                      editable={!importing}
                      selectionColor={COLORS.accent}
                    />
                    {playlistLink.length > 0 ? (
                      <Pressable
                        style={styles.linkClearBtn}
                        onPress={() => setPlaylistLink('')}
                        disabled={importing}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                      </Pressable>
                    ) : null}
                    <TouchableOpacity
                      style={styles.pasteBtn}
                      onPress={handlePaste}
                      disabled={importing}
                      hitSlop={8}
                    >
                      <Ionicons name="clipboard-outline" size={15} color={SPOTIFY_GREEN} />
                      <Text style={styles.pasteBtnLabel} numberOfLines={1}>
                        Paste
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Pressable
                    style={[
                      styles.importBtn,
                      (!playlistLink.trim() || importing) && styles.importBtnDisabled,
                    ]}
                    onPress={handleImport}
                    disabled={!playlistLink.trim() || importing}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Ionicons name="download" size={18} color="#000000" />
                    )}
                    <Text style={styles.importBtnLabel} numberOfLines={1}>
                      {importing ? 'Importing...' : 'Import Playlist'}
                    </Text>
                  </Pressable>

                  {importing ? (
                    <View style={styles.importingRow}>
                      <ActivityIndicator size="small" color={SPOTIFY_GREEN} />
                      <Text style={styles.importingText} numberOfLines={1}>
                        {importStage || 'Importing...'}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.countCard}>
                    <Ionicons name="albums-outline" size={18} color={SPOTIFY_GREEN} />
                    <Text style={styles.countCardText}>
                      Imported playlists:{' '}
                      <Text style={styles.countCardValue}>{importedCount}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.actionBar}>
            <Pressable style={styles.logoutBtn} onPress={handleLogout} hitSlop={6}>
              <Ionicons name="log-out-outline" size={17} color={COLORS.accent} />
              <Text style={styles.logoutLabel}>Log out</Text>
            </Pressable>
            <View style={styles.actionSpacer} />
            <Pressable style={styles.cancelBtn} onPress={handleClose} hitSlop={6}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave} hitSlop={6}>
              <Text style={styles.saveLabel}>Save Changes</Text>
            </Pressable>
          </View>

          {toast ? (
            <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
              <Text style={styles.toastText} numberOfLines={2}>
                {toast.message}
              </Text>
            </Animated.View>
          ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 0,
    maxHeight: '92%',
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 24,
  },
  keyboardWrap: {
    width: '100%',
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerMeta: {
    flex: 1,
    marginLeft: 12,
  },
  headerName: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsWrap: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: '#1E1F22',
    padding: 3,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: COLORS.textPrimary,
  },
  content: {
    flexGrow: 0,
    maxHeight: '62%',
  },
  contentInner: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  section: {
    gap: 16,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  changeAvatarBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  changeAvatarLabel: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  fieldInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  googleIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBadgeText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  spotifyCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  spotifyTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotifyLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyMeta: {
    flex: 1,
    marginLeft: 12,
  },
  spotifyName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  spotifySubLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  spotifyDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  linkInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  linkInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  linkClearBtn: {
    marginLeft: 8,
    padding: 2,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(30,215,96,0.45)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  pasteBtnLabel: {
    color: SPOTIFY_GREEN,
    fontSize: 12,
    fontWeight: '700',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 25,
    backgroundColor: SPOTIFY_GREEN,
    paddingHorizontal: 16,
  },
  importBtnDisabled: {
    opacity: 0.6,
  },
  importBtnLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: -4,
  },
  importingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  countCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30,215,96,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(30,215,96,0.25)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  countCardText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  countCardValue: {
    color: SPOTIFY_GREEN,
    fontWeight: '800',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingRight: 12,
  },
  logoutLabel: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  actionSpacer: {
    flex: 1,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 86,
    backgroundColor: 'rgba(35,37,43,0.98)',
    borderColor: '#2C2F36',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});