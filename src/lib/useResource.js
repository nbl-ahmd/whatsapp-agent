"use client";

/**
 * Minimal read hook for authenticated GET endpoints.
 *
 * Every page in the app lists one resource, so the loading/error/reload dance
 * lives here instead of in each page. Loading is derived from whether the state
 * on hand belongs to the current path, so the effect never sets state
 * synchronously; a background refresh (refreshMs) keeps the last data on screen.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useResource(path, { enabled = true, refreshMs = 0 } = {}) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !path) return undefined;

    let active = true;

    api
      .get(path)
      .then((result) => {
        if (active) setState({ key: path, data: result, error: null });
      })
      .catch((caught) => {
        if (active) setState({ key: path, data: null, error: caught });
      });

    const timer = refreshMs ? setInterval(reload, refreshMs) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, enabled, refreshMs, nonce, reload]);

  const settled = Boolean(enabled && path) && state.key === path;

  return {
    data: settled ? state.data : null,
    error: settled ? state.error : null,
    loading: Boolean(enabled && path) && !settled,
    reload,
  };
}
