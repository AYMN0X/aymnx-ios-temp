import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createAccount, verifyCredentials } from '../services/storage';

export interface User {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
}

export const AUTH_USER_KEY = '@spotify_auth_user';

export type AuthResult = { ok: boolean; error?: string };

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUp: (name: string, identifier: string, password: string) => Promise<AuthResult>;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  loginGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (raw && active) {
          setUser(JSON.parse(raw) as User);
        }
      } catch (error) {
        console.warn('[auth] Failed to restore session.', error);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persistSession = useCallback(async (profile: User) => {
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
    setUser(profile);
  }, []);

  const signUp = useCallback(
    async (name: string, identifier: string, password: string): Promise<AuthResult> => {
      if (!identifier.trim()) {
        return { ok: false, error: 'Please enter a username or email.' };
      }
      if (password.length < 6) {
        return { ok: false, error: 'Password must be at least 6 characters.' };
      }
      try {
        const account = await createAccount({ name, username: identifier, password });
        await persistSession({
          id: account.id,
          name: account.name,
          username: account.username,
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not create account.',
        };
      }
    },
    [persistSession]
  );

  const login = useCallback(
    async (identifier: string, password: string): Promise<AuthResult> => {
      if (!identifier.trim() || !password) {
        return { ok: false, error: 'Enter your username or email and password.' };
      }
      const account = await verifyCredentials(identifier, password);
      if (!account) {
        return { ok: false, error: 'Invalid username or password.' };
      }
      await persistSession({
        id: account.id,
        name: account.name,
        username: account.username,
      });
      return { ok: true };
    },
    [persistSession]
  );

  const loginGuest = useCallback(async () => {
    await persistSession({ id: 'user_guest', username: 'Guest', name: 'Guest' });
  }, [persistSession]);

  const logout = useCallback(async () => {
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
      loginGuest,
      logout,
    }),
    [user, isLoading, signUp, login, loginGuest, logout]
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