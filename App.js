import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { requireOptionalNativeModule } from 'expo';
import { bootLog } from './src/services/bootLog';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { TabBar } from './src/components/layout/TabBar';
import { TelemetryHud } from './src/components/TelemetryHud';
import { CreatePlaylistModal } from './src/components/modals/CreatePlaylistModal';
import { NowPlayingModal } from './src/components/modals/NowPlayingModal';
import { SettingsSheet } from './src/components/modals/SettingsSheet';
import { MiniPlayerDock } from './src/components/MiniPlayerDock';
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
  const [activeTab, setActiveTab] = useState('home');
  const [tabKeys, setTabKeys] = useState({ home: 0, heart: 0, search: 0, bell: 0, profile: 0 });
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [pendingPlaylistId, setPendingPlaylistId] = useState(null);

  useEffect(() => {
    bootLog('AppShell mounted (first screen render)');
  }, []);

  const openImportedPlaylist = (id) => {
    setPendingPlaylistId(id);
    setActiveTab('heart');
  };

  const handleTabChange = (tabKey, wasActive) => {
    if (tabKey === 'profile') {
      setAccountOpen(true);
      return;
    }
    if (wasActive) {
      setTabKeys((keys) => ({ ...keys, [tabKey]: keys[tabKey] + 1 }));
    } else {
      setActiveTab(tabKey);
      Image.clearMemoryCache().catch(() => undefined);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.screenContent}>
        {activeTab === 'home' ? (
          <HomeScreen
            key={tabKeys.home}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            onOpenAccount={() => setAccountOpen(true)}
          />
        ) : activeTab === 'search' ? (
          <SearchScreen key={tabKeys.search} />
        ) : activeTab === 'bell' ? (
          <ImportScreen key={tabKeys.bell} onOpenImportedPlaylist={openImportedPlaylist} />
        ) : (
          <LibraryScreen
            key={tabKeys.heart}
            onOpenAccount={() => setAccountOpen(true)}
            initialDetail={pendingPlaylistId ? { type: 'playlist', id: pendingPlaylistId } : null}
            onDetailConsumed={() => setPendingPlaylistId(null)}
          />
        )}
      </View>
      <MiniPlayerDock onOpen={() => setNowPlayingOpen(true)} />
      <TabBar active={activeTab} onChange={handleTabChange} />
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
      <SettingsSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
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
        bootLog('onboarding flag resolved', { seen });
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
  useEffect(() => {
    bootLog('App mounted');
    Image.clearMemoryCache().catch(() => undefined);
    const devMenuPrefs = requireOptionalNativeModule('DevMenuPreferences');
    if (devMenuPrefs?.setPreferencesAsync) {
      devMenuPrefs
        .setPreferencesAsync({ showFloatingActionButton: false })
        .catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
        <TelemetryHud />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: '#101313',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    backgroundColor: '#101313',
  },
  onboardingRoot: {
    flex: 1,
    backgroundColor: '#101313',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#101313',
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
});