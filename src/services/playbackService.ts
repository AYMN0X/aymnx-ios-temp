import TrackPlayer from 'react-native-track-player';
import { Event } from 'react-native-track-player';

export interface PlaybackServiceBridge {
  onRemoteNext: () => Promise<void>;
  onRemotePrevious: () => Promise<void>;
  onQueueEnded: () => Promise<void>;
}

let bridge: PlaybackServiceBridge | null = null;

export function setPlaybackServiceBridge(next: PlaybackServiceBridge | null): void {
  bridge = next;
}

export async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.reset();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    if (bridge) {
      bridge.onRemoteNext();
    } else {
      TrackPlayer.skipToNext();
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    if (bridge) {
      await bridge.onRemotePrevious();
      return;
    }
    const position = await TrackPlayer.getPosition();
    if (position > 3) {
      await TrackPlayer.seekTo(0);
    } else {
      await TrackPlayer.skipToPrevious();
    }
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    TrackPlayer.seekTo(position);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, ({ interval }) => {
    if (Number.isFinite(interval)) {
      TrackPlayer.seekBy(interval);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }) => {
    if (Number.isFinite(interval)) {
      TrackPlayer.seekBy(-interval);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, ({ paused, permanent }) => {
    if (permanent) {
      return;
    }
    if (paused) {
      TrackPlayer.pause();
    } else {
      TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (bridge) {
      bridge.onQueueEnded();
    }
  });
}