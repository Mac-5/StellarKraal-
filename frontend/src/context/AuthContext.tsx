import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiClient } from '../lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<string | null>;
}

const TOKEN_STORAGE_KEY = 'auth_token';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface RefreshResponse {
  token: string;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const tokenRef = useRef<string | null>(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const persistToken = useCallback((nextToken: string | null) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
    if (typeof window !== 'undefined') {
      if (nextToken) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setUser(null);
  }, [persistToken]);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const data = await apiClient.post<RefreshResponse>('/auth/refresh', undefined, {
        auth: false,
      });
      if (data?.token) {
        persistToken(data.token);
        return data.token;
      }
    } catch {
      // refresh failed; caller will handle redirect
    }
    return null;
  }, [persistToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const data = await apiClient.post<LoginResponse, { email: string; password: string }>(
          '/auth/login',
          { email, password },
          { auth: false }
        );
        persistToken(data.token);
        setUser(data.user);
      } finally {
        setIsLoading(false);
      }
    },
    [persistToken]
  );

  useEffect(() => {
    apiClient.setTokenProvider(() => tokenRef.current);
    apiClient.setRefreshHandler(refresh);
    apiClient.setUnauthorizedHandler(() => {
      logout();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    });
  }, [refresh, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      login,
      logout,
      refresh,
    }),
    [user, token, isLoading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
