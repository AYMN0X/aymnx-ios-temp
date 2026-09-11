import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, firebaseSignIn, firebaseSignOut, firebaseSignUp, signInWithGoogle as firebaseGoogleSignIn } from '../services/firebase';
import { statusCodes } from '@react-native-google-signin/google-signin';

export interface User {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  isGuest?: boolean;
}

export const AUTH_USER_KEY = '@spotify_auth_user';

export type AuthResult = { ok: boolean; error?: string };

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUp: (name: string, identifier: string, password: string) => Promise<AuthResult>;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  loginGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function profileFromFirebaseUser(firebaseUser: FirebaseUser, stored?: User | null): User {
  const name =
    firebaseUser.displayName?.trim() ||
    stored?.name ||
    firebaseUser.email?.split('@')[0] ||
    'User';
  return {
    id: firebaseUser.uid,
    name,
    username: firebaseUser.email ?? '',
    avatarUrl: firebaseUser.photoURL ?? undefined,
  };
}

function authErrorMessage(error: unknown): string {
  const payload = (error as { code?: string; message?: string } | null) ?? {};
  const code = payload.code ?? '';
  console.warn('[auth] Firebase authentication error.', {
    code,
    message: payload.message,
  });
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return payload.message || 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let restored: User | null = null;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (raw && active) {
          restored = JSON.parse(raw) as User;
        }
      } catch (error) {
        console.warn('[auth] Failed to restore session.', error);
      } finally {
        if (active && restored?.isGuest) {
          setUser(restored);
        }
      }
    })();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!active) {
        return;
      }
      if (firebaseUser) {
        setUser(profileFromFirebaseUser(firebaseUser, restored));
      } else if (restored?.isGuest) {
        setUser(restored);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const persistSession = useCallback(async (profile: User) => {
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
    setUser(profile);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string): Promise<AuthResult> => {
      const email = identifier.trim();
      if (!email || !password) {
        return { ok: false, error: 'Enter your email and password.' };
      }
      try {
        const firebaseUser = await firebaseSignIn(email, password);
        await persistSession(profileFromFirebaseUser(firebaseUser));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authErrorMessage(error) };
      }
    },
    [persistSession]
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    try {
      const firebaseUser = await firebaseGoogleSignIn();
      await persistSession(profileFromFirebaseUser(firebaseUser));
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED || code === 'SIGN_IN_CANCELLED') {
        return { ok: false, error: 'Google sign-in was cancelled.' };
      }
      console.warn('[auth] Google sign-in error.', {
        code,
        message: (error as { message?: string })?.message,
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Google sign-in failed.',
      };
    }
  }, [persistSession]);

  const signUp = useCallback(
    async (name: string, identifier: string, password: string): Promise<AuthResult> => {
      const email = identifier.trim();
      if (!email) {
        return { ok: false, error: 'Please enter your email.' };
      }
      if (password.length < 6) {
        return { ok: false, error: 'Password must be at least 6 characters.' };
      }
      try {
        const firebaseUser = await firebaseSignUp(email, password, name);
        await persistSession(profileFromFirebaseUser(firebaseUser));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authErrorMessage(error) };
      }
    },
    [persistSession]
  );

  const loginGuest = useCallback(async () => {
    await persistSession({ id: 'user_guest', name: 'Guest', username: 'Guest', isGuest: true });
  }, [persistSession]);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut();
    } catch (error) {
      console.warn('[auth] Firebase sign out failed.', error);
    }
    await AsyncStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signUp,
      login,
      signInWithGoogle,
      loginGuest,
      logout,
    }),
    [user, isLoading, signUp, login, signInWithGoogle, loginGuest, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}