import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Activity } from 'lucide-react-native';
import { TrackRow } from '../components/TrackRow';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useTrackActions } from '../context/TrackActionsContext';
import { searchITunes, Track } from '../services/musicApi';
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

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playTrack } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const { openTrack } = useTrackActions();

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runSearch = async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setError('');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const tracks = await searchITunes(term);
      setResults(tracks);
    } catch (e) {
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => runSearch(text), 450);
  };

  const searchingNow = query.trim() !== '';

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchHeader}>
        <Text style={styles.searchTitle}>Search</Text>
        <Pressable style={styles.searchCamera} hitSlop={8}>
          <Feather name="camera" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.searchPill}>
        <Ionicons name="search" size={22} color="#121212" />
        <TextInput
          style={styles.searchPillInput}
          value={query}
          onChangeText={handleChange}
          placeholder="What do you want to play?"
          placeholderTextColor="#535353"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
      </View>
      {searchingNow ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchResults}
          ListHeaderComponent={
            searching ? (
              <Activity size={16} color={COLORS.white} style={styles.searchLoading} />
            ) : null
          }
          ListEmptyComponent={
            error ? (
              <Text style={styles.searchError}>{error}</Text>
            ) : !searching ? (
              <Text style={styles.searchEmpty}>No results found. Try a different search.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              liked={isLiked(item.id)}
              onPlay={() => playTrack(item, results)}
              onToggleLike={() => toggleLike(item)}
              onMore={() => openTrack(item)}
            />
          )}
        />
      ) : (
        <ScrollView
          style={styles.searchBrowse}
          contentContainerStyle={styles.searchBrowseContent}
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
    backgroundColor: COLORS.white,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  searchPillInput: {
    flex: 1,
    color: '#121212',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchLoading: {
    alignSelf: 'center',
    marginVertical: 16,
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
    paddingBottom: 90,
  },
  searchBrowse: {
    flex: 1,
  },
  searchBrowseContent: {
    paddingBottom: 90,
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