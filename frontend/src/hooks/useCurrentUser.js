import { useEffect, useState } from 'react';
import { api } from '@/api/client';

/**
 * Real logged-in user, fetched from GET /users/me.
 * Falls back to whatever was cached from the last successful login/fetch
 * (so the sidebar doesn't blank out when offline), but never invents one.
 */
export function useCurrentUser() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nawi-user') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (cancelled) return;
        setUser(data);
        localStorage.setItem('nawi-user', JSON.stringify(data));
      })
      .catch(() => {
        // Offline or local-mode session — keep whatever was cached, if anything.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}

export default useCurrentUser;
