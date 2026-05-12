import { useEffect, useCallback } from 'react';
import { subscribeToGame, broadcastToGame } from '../lib/realtime';
import type { RealtimeMessage, RealtimeEventType } from '../lib/realtime';

export function useRealtime(
  code: string | null,
  onMessage: (msg: RealtimeMessage) => void
) {
  useEffect(() => {
    if (!code) return;
    const unsubscribe = subscribeToGame(code, onMessage);
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
}

export function useBroadcast(code: string | null) {
  const broadcast = useCallback(
    async (type: RealtimeEventType, payload: unknown) => {
      if (!code) return;
      await broadcastToGame(code, type, payload);
    },
    [code]
  );

  return broadcast;
}
