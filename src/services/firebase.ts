import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  GoogleAuthProvider,
  initializeAuth,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { Auth, User as FirebaseUser } from 'firebase/auth';
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import type { DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase/firestore';
import { getGoogleAuth } from './GoogleAuth';
import type { Track } from './musicApi';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}

const firebaseConfig = {
  apiKey: 'AIzaSyDxh6mcTNs1zyctiS2eN_X2MHGHvU2EvHI',
  authDomain: 'aymnx-7a808.firebaseapp.com',
  projectId: 'aymnx-7a808',
};

let cachedApp: FirebaseApp | undefined;
let cachedAuth: Auth | undefined;
let cachedDb: Firestore | undefined;

function getApp(): FirebaseApp {
  if (!cachedApp) {
    cachedApp = initializeApp(firebaseConfig);
  }
  return cachedApp;
}

export function getAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = initializeAuth(getApp(), {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  return cachedAuth;
}

export function getDb(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(getApp());
  }
  return cachedDb;
}

export async function firebaseSignIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(getAuth(), email, password);
  return credential.user;
}

export async function firebaseSignUp(
  email: string,
  password: string,
  displayName: string
): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(getAuth(), email, password);
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential.user;
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(getAuth());
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const googleAuth = getGoogleAuth();
  await googleAuth.hasPlayServices();
  const response = await googleAuth.signIn();
  const idToken = response.data?.idToken ?? undefined;
  if (!idToken) {
    throw new Error('Google sign-in was cancelled.');
  }
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(getAuth(), credential);
  return result.user;
}

interface LikedTrackDoc {
  id?: string;
  title?: string;
  name?: string;
  trackName?: string;
  artist?: string;
  artists?: string;
  album?: string;
  artwork?: string;
  artworkUrl?: string;
  coverUrl?: string;
  image?: string;
  previewUrl?: string;
  streamUrl?: string;
  streamMimeType?: string;
  provider?: string;
  permalink?: string;
  duration?: number;
}

function likedTrackFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Track {
  const data = doc.data() as LikedTrackDoc;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? data.name ?? data.trackName ?? doc.id,
    artist: data.artist ?? data.artists ?? '',
    album: data.album ?? '',
    artwork: data.artwork ?? data.artworkUrl ?? data.coverUrl ?? data.image ?? '',
    previewUrl: data.previewUrl ?? '',
    streamUrl: data.streamUrl,
    streamMimeType: data.streamMimeType,
    provider:
      typeof data.provider === 'string' ? (data.provider as Track['provider']) : undefined,
    permalink: data.permalink,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
  };
}

export async function fetchLikedTracks(userId: string): Promise<Track[]> {
  const snapshot = await getDocs(collection(getDb(), 'users', userId, 'liked'));
  return snapshot.docs.map(likedTrackFromDoc);
}

function likedDocRef(userId: string, trackId: string) {
  return doc(getDb(), 'users', userId, 'liked', trackId);
}

export async function setLikedTrack(userId: string, track: Track): Promise<void> {
  await setDoc(likedDocRef(userId, track.id), {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    previewUrl: track.previewUrl,
    streamUrl: track.streamUrl ?? null,
    streamMimeType: track.streamMimeType ?? null,
    provider: track.provider ?? null,
    permalink: track.permalink ?? null,
    duration: track.duration ?? null,
  });
}

export async function removeLikedTrack(userId: string, trackId: string): Promise<void> {
  await deleteDoc(likedDocRef(userId, trackId));
}

export interface StoredPlaylistTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverUrl: string;
  provider?: string;
  permalink?: string;
}

export interface PlaylistDoc {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  isImported?: boolean;
  tracks: Track[];
}

function trackToStored(track: Track): StoredPlaylistTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSeconds: track.duration ?? 0,
    coverUrl: track.artwork ?? '',
    provider: track.provider,
    permalink: track.permalink,
  };
}

function storedTrackToTrack(data: Record<string, unknown>): Track {
  return {
    id: typeof data.id === 'number' ? String(data.id) : typeof data.id === 'string' ? data.id : '',
    title: typeof data.title === 'string' ? data.title : '',
    artist: typeof data.artist === 'string' ? data.artist : '',
    album: typeof data.album === 'string' ? data.album : '',
    artwork:
      typeof data.coverUrl === 'string' && data.coverUrl
        ? data.coverUrl
        : typeof data.artwork === 'string'
        ? data.artwork
        : '',
    previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : '',
    provider: typeof data.provider === 'string' ? (data.provider as Track['provider']) : undefined,
    permalink: typeof data.permalink === 'string' ? data.permalink : undefined,
    duration:
      typeof data.durationSeconds === 'number'
        ? data.durationSeconds
        : typeof data.duration === 'number'
        ? data.duration
        : undefined,
  };
}

export async function createOrUpdatePlaylist(
  userId: string,
  playlist: { id: string; name: string; description?: string; tracks: Track[]; coverUrl?: string; isImported?: boolean }
): Promise<void> {
  await setDoc(doc(getDb(), 'users', userId, 'playlists', playlist.id), {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    coverUrl: playlist.coverUrl ?? '',
    isImported: playlist.isImported ?? false,
    tracks: playlist.tracks.map(trackToStored),
  });
}

export async function fetchPlaylists(userId: string): Promise<PlaylistDoc[]> {
  const snapshot = await getDocs(collection(getDb(), 'users', userId, 'playlists'));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: isset(data.id) ? data.id : item.id,
      name: isset(data.name) ? data.name : '',
      description: isset(data.description) && data.description ? data.description : undefined,
      coverUrl: isset(data.coverUrl) && data.coverUrl ? data.coverUrl : undefined,
      isImported: data.isImported === true,
      tracks: Array.isArray(data.tracks)
        ? data.tracks.map((entry) => storedTrackToTrack(entry as Record<string, unknown>))
        : [],
    };
  });
}

function isset(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function deletePlaylist(userId: string, playlistId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', userId, 'playlists', playlistId));
}