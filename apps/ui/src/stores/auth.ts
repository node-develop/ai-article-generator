import { create } from 'zustand';

type UserRole = 'admin' | 'editor' | 'viewer';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  isEditor: () => boolean;
  canGenerate: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  isAdmin: () => get().user?.role === 'admin',
  isEditor: () => get().user?.role === 'editor',
  canGenerate: () => {
    const role = get().user?.role;
    return role === 'admin' || role === 'editor';
  },
}));
