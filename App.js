import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { TabBar } from './src/components/layout/TabBar';
import { AccountSheet } from './src/components/modals/AccountSheet';
import { CreatePlaylistModal } from './src/components/modals/CreatePlaylistModal';
import { NowPlayingModal } from './src/components/modals/NowPlayingModal';
import { MiniPlayer } from './src/components/player/MiniPlayer';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DownloadProvider } from './src/context/DownloadContext';
import { LibraryProvider } from './src/context/LibraryContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { TrackActionsProvider } from './src/context/TrackActionsContext';
import { ImportScreen } from './src/screens/ImportScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { getHasSeenOnboarding, setHasSeenOnboarding } from './src/services/storage';

function AppShell() {
  const insets = useSafeAreaInsets();
  const { currentTrack } = usePlayer();
  const [activeTab, setActiveTab] = useState('home');
  const [tabKeys, setTabKeys] = useState({ home: 0, search: 0, create: 0, library: 0 });
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [pendingPlaylistId, setPendingPlaylistId] = useState(null);

  const openImportedPlaylist = (id) => {
    setPendingPlaylistId(id);
    setActiveTab('library');
  };

  const handleTabChange = (tabKey, wasActive) => {
    if (wasActive) {
      setTabKeys((keys) => ({ ...keys, [tabKey]: keys[tabKey] + 1 }));
    } else {
      setActiveTab(tabKey);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.screenContent,
          { paddingBottom: 49 + insets.bottom + (currentTrack ? 64 : 0) },
        ]}
      >
        {activeTab === 'home' ? (
          <HomeScreen
            key={tabKeys.home}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            onOpenAccount={() => setAccountOpen(true)}
          />
        ) : activeTab === 'search' ? (
          <SearchScreen key={tabKeys.search} />
        ) : activeTab === 'create' ? (
          <ImportScreen key={tabKeys.create} onOpenImportedPlaylist={openImportedPlaylist} />
        ) : (
          <LibraryScreen
            key={tabKeys.library}
            onOpenAccount={() => setAccountOpen(true)}
            initialDetail={pendingPlaylistId ? { type: 'playlist', id: pendingPlaylistId } : null}
            onDetailConsumed={() => setPendingPlaylistId(null)}
          />
        )}
      </View>
      <MiniPlayer onOpen={() => setNowPlayingOpen(true)} />
      <TabBar active={activeTab} onChange={handleTabChange} />
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
      <CreatePlaylistModal
        visible={createPlaylistOpen}
        onClose={() => setCreatePlaylistOpen(false)}
      />
    </View>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [onboardingSeen, setOnboardingSeen] = useState(null);

  useEffect(() => {
    let mounted = true;
    getHasSeenOnboarding()
      .then((seen) => {
        if (mounted) {
          setOnboardingSeen(seen);
        }
      })
      .catch((error) => console.warn('[app] Could not load onboarding flag.', error));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.appRoot}>
      {isLoading || onboardingSeen === null ? (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
        </SafeAreaView>
      ) : !onboardingSeen ? (
        <View style={styles.onboardingRoot}>
          <StatusBar style="light" />
          <OnboardingScreen
            onContinue={() => {
              setOnboardingSeen(true);
              setHasSeenOnboarding(true).catch((error) =>
                console.warn('[app] Could not persist onboarding flag.', error)
              );
            }}
          />
        </View>
      ) : (
        <DownloadProvider>
          <PlayerProvider>
            <LibraryProvider>
              <TrackActionsProvider>
                <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                  <StatusBar style="light" />
                  {isAuthenticated ? <AppShell /> : <LoginScreen />}
                </SafeAreaView>
              </TrackActionsProvider>
            </LibraryProvider>
          </PlayerProvider>
        </DownloadProvider>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0B0C0E',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0B0C0E',
  },
  onboardingRoot: {
    flex: 1,
    backgroundColor: '#0B0C0E',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0B0C0E',
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
});