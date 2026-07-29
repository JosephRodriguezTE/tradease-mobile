import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

// ─── In-memory guest state (cleared on app close) ─────────────
let guestMode = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function setGuestMode(v: boolean) {
  guestMode = v;
  notify();
}

export function isGuestActive() {
  return guestMode;
}

// ─── The hook ─────────────────────────────────────────────────
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(guestMode);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // signing in clears guest mode
        guestMode = false;
        notify();
      }
    });

    // Guest mode changes
    const guestListener = () => setIsGuest(guestMode);
    listeners.add(guestListener);

    return () => {
      subscription.unsubscribe();
      listeners.delete(guestListener);
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    guestMode = false;
    notify();
  }, []);

  const enterGuestMode = useCallback(() => {
    guestMode = true;
    notify();
  }, []);

  return {
    user,
    session,
    loading,
    isAuthenticated: !!user,
    isGuest,
    signOut,
    enterGuestMode,
  };
}