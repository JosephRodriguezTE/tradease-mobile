import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setIsAdmin(!!data?.is_admin);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [user, authLoading]);

  return { isAdmin, loading: authLoading || loading };
}
