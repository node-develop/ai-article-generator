import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useAuthStore } from '@/stores/auth';

export const useAuth = () => {
  const { user, isLoading, setUser, setLoading, isAdmin, isEditor, canGenerate } = useAuthStore();

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const session = await authClient.getSession();
        if (session?.data?.user) {
          setUser(session.data.user as any);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    };
    fetchSession();
  }, [setUser]);

  const signIn = async (email: string, password: string) => {
    const result = await authClient.signIn.email({ email, password });
    if (result?.data?.user) {
      setUser(result.data.user as any);
    }
    return result;
  };

  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
  };

  return { user, isLoading, signIn, signOut, isAdmin, isEditor, canGenerate };
};
