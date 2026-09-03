import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, AuthResponse } from '../types';
import { apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<UserRole>;
  logout: () => void;
  getRedirectPath: (role: UserRole) => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getRedirectPath = (userRole: UserRole): string => {
    switch (userRole) {
      case 'ADMIN':
        return '/admin/dashboard';
      case 'PAPER_SETTER':
        return '/setter/dashboard';
      case 'CANDIDATE':
        return '/candidate/dashboard';
      default:
        return '/login';
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await apiClient.get<User>('/auth/me');
        setUser(response.data);
        setRole(response.data.role);
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_info');
        setUser(null);
        setRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (identifier: string, password: string): Promise<UserRole> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', {
      identifier: identifier.trim(),
      email: identifier.trim(),
      password,
    });

    const data = response.data;
    localStorage.setItem('access_token', data.access_token);
    
    // Fetch full profile
    const profileRes = await apiClient.get<User>('/auth/me');
    setUser(profileRes.data);
    setRole(data.role);

    return data.role;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    setUser(null);
    setRole(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        getRedirectPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
