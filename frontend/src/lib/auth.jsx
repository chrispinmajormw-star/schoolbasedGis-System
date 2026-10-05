import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const loadProfile = useCallback(async () => {
    if (!userId) { setProfile(null); setProfileError(''); return; }
    try {
      setProfile(await api.me());
      setProfileError('');
    } catch (e) {
      setProfile(null);
      setProfileError(e.message);
    }
  }, [userId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const signIn = async (email, password) => {
    if (!supabase) throw new Error('Sign-in is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
  };
  const signOut = async () => { await supabase?.auth.signOut(); setProfile(null); };
  const sendReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw new Error(error.message);
  };
  const setNewPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    setRecovering(false);
  };

  const canEdit = (schoolId) => !!profile && (profile.role === 'admin' || profile.school_id === schoolId);

  return (
    <AuthCtx.Provider value={{
      enabled: !!supabase, ready, session, profile, profileError, isAdmin: profile?.role === 'admin',
      canEdit, signIn, signOut, sendReset, recovering, setNewPassword, reloadProfile: loadProfile,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
