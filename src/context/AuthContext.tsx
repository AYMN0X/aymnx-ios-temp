import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface User {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
}

export const AUTH_USER_KEY = '@spotify_auth_user';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, name?: string) => Promise<void>;
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

  const login = useCallback(async (username: string, name?: string) => {
    const trimmed = username.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    const profile: User = {
      id: `user_${normalized || 'guest'}`,
      username: trimmed,
      name: name && name.trim() ? name.trim() : trimmed,
    };
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout]
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