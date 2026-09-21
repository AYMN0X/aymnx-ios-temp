import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoundCloudResultRow } from '../components/SoundCloudResultRow';
import { usePlayer } from '../context/PlayerContext';
import { searchSoundCloudTracks, Track } from '../services/musicApi';
import { COLORS } from '../theme/appTheme';

const SEARCH_CATEGORIES = [
  { key: 'podcasts', title: 'Podcasts', color: '#E13300' },
  { key: 'made-for-you', title: 'Made For You', color: '#1E3264' },
  { key: 'charts', title: 'Charts', color: '#8D67AB' },
  { key: 'new-releases', title: 'New Releases', color: '#E8115B' },
  { key: 'discover', title: 'Discover', color: '#8C1932' },
  { key: 'concerts', title: 'Concerts', color: '#1E3264' },
  { key: 'pop', title: 'Pop', color: '#148A08' },
  { key: 'hip-hop', title: 'Hip-Hop', color: '#BC5900' },
  { key: 'rock', title: 'Rock', color: '#E91429' },
  { key: 'dance', title: 'Dance / Electronic', color: '#D84000' },
];

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 25;

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const { currentTrack, playTrack } = usePlayer();

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    const seq = ++searchSeqRef.current;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError('');
      setHasSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setError('');
    try {
      const tracks = await searchSoundCloudTracks(trimmed, SEARCH_LIMIT);
      if (seq !== searchSeqRef.current) {
        return;
      }
      setResults(tracks.slice(0, SEARCH_LIMIT));
      setHasSearched(true);
    } catch (e) {
      if (seq !== searchSeqRef.current) {
        return;
      }
      setError('Search failed. Please try again.');
      setResults([]);
      setHasSearched(true);
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = text.trim();
    searchSeqRef.current += 1;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError('');
      setHasSearched(false);
      setSearching(false);
      return;
    }
    setResults([]);
    setError('');
    setHasSearched(false);
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const searchingNow = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchHeader}>
        <Text style={styles.searchTitle}>Search</Text>
        <Pressable style={styles.searchCamera} hitSlop={8}>
          <Feather name="camera" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.searchPill}>
        <Ionicons name="search" size={22} color={COLORS.placeholder} />
        <TextInput
          style={styles.searchPillInput}
          value={query}
          onChangeText={handleChange}
          placeholder="Search SoundCloud"
          placeholderTextColor={COLORS.placeholder}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
      </View>
      {searchingNow ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          windowSize={5}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.searchResults, { paddingBottom: insets.bottom + 146 }]}
          ListHeaderComponent={
            <>
              <Pressable
                onPress={() => runSearch(query)}
                style={({ pressed }) => [
                  styles.searchCloudHeader,
                  pressed && styles.searchCloudHeaderPressed,
                ]}
                accessibilityRole="button"
              >
                <View style={styles.searchCloudIcon}>
                  <Ionicons name="headset" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.searchCloudHeaderText}>Search SoundCloud</Text>
                <Feather name="chevron-right" size={18} color={COLORS.textSecondary} />
              </Pressable>
            </>
          }
          ListEmptyComponent={
            searching ? (
              <ActivityIndicator
                size="small"
                color="#E94B35"
                style={styles.searchLoading}
              />
            ) : error ? (
              <Text style={styles.searchError}>{error}</Text>
            ) : hasSearched ? (
              <Text style={styles.searchEmpty}>
                Nothing found on SoundCloud. Try a different search.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <SoundCloudResultRow
              track={item}
              active={currentTrack?.id === item.id}
              onPlay={() => playTrack(item, results)}
            />
          )}
        />
      ) : (
        <ScrollView
          style={styles.searchBrowse}
          contentContainerStyle={[styles.searchBrowseContent, { paddingBottom: insets.bottom + 146 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.browseTitle}>Browse all</Text>
          <View style={styles.browseGrid}>
            {SEARCH_CATEGORIES.map((cat) => (
              <View key={cat.key} style={[styles.browseCard, { backgroundColor: cat.color }]}>
                <Text style={styles.browseCardTitle} numberOfLines={2}>
                  {cat.title}
                </Text>
                <View style={styles.browseArt} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  searchTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  searchCamera: {
    padding: 4,
  },
  searchPill: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  searchPillInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchLoading: {
    alignSelf: 'center',
    marginVertical: 16,
  },
  searchCloudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  searchCloudHeaderPressed: {
    backgroundColor: COLORS.cardPress,
  },
  searchCloudIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E94B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCloudHeaderText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchError: {
    color: '#F15E6C',
    marginTop: 24,
    textAlign: 'center',
  },
  searchEmpty: {
    color: COLORS.textSecondary,
    marginTop: 24,
    textAlign: 'center',
  },
  searchResults: {
  },
  searchBrowse: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchBrowseContent: {
  },
  browseTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  browseGrid: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    columnGap: 12,
  },
  browseCard: {
    width: '48%',
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  browseCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '70%',
  },
  browseArt: {
    position: 'absolute',
    bottom: -6,
    right: -12,
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    transform: [{ rotate: '25deg' }],
    elevation: 4,
  },
});