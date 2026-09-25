import { StatusBar } from 'expo-status-bar';
import { BlurTargetView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { requireOptionalNativeModule } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bootLog } from './src/services/bootLog';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { TabBar } from './src/components/layout/TabBar';
import { TelemetryHud } from './src/components/TelemetryHud';
import { CreatePlaylistModal } from './src/components/modals/CreatePlaylistModal';
import { NowPlayingModal } from './src/components/modals/NowPlayingModal';
import { MiniPlayerDock } from './src/components/MiniPlayerDock';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DownloadProvider } from './src/context/DownloadContext';
import { LibraryProvider } from './src/context/LibraryContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { TrackActionsProvider } from './src/context/TrackActionsContext';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { getHasSeenOnboarding, setHasSeenOnboarding } from './src/services/storage';

function AppShell() {
  const [activeTab, setActiveTab] = useState('home');
  const [tabKeys, setTabKeys] = useState({ home: 0, library: 0, profile: 0 });
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const blurTargetRef = useRef(null);

  useEffect(() => {
    bootLog('AppShell mounted (first screen render)');
  }, []);

  const handleTabChange = (tabKey, wasActive) => {
    if (wasActive) {
      setTabKeys((keys) => ({ ...keys, [tabKey]: keys[tabKey] + 1 }));
    } else {
      setActiveTab(tabKey);
      Image.clearMemoryCache().catch(() => undefined);
    }
  };

  return (
    <View style={styles.container}>
      <BlurTargetView ref={blurTargetRef} style={styles.screenContent}>
        {activeTab === 'home' ? (
          <HomeScreen
            key={tabKeys.home}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            onOpenAccount={() => setActiveTab('profile')}
          />
        ) : activeTab === 'profile' ? (
          <AccountScreen key={tabKeys.profile} />
        ) : (
          <LibraryScreen
            key={tabKeys.library}
            onOpenAccount={() => setActiveTab('profile')}
            blurTarget={blurTargetRef}
          />
        )}
      </BlurTargetView>
      <View pointerEvents="box-none" style={styles.navigationLayer}>
        <MiniPlayerDock
          onOpen={() => setNowPlayingOpen(true)}
          blurTarget={blurTargetRef}
        />
        <TabBar
          active={activeTab}
          blurTarget={blurTargetRef}
          onChange={handleTabChange}
        />
      </View>
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
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
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGate />
          <TelemetryHud />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
    backgroundColor: 'transparent',
  },
  navigationLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    zIndex: 1000,
    elevation: 0,
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
});