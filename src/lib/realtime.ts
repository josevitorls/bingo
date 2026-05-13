import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeEventType =
  | 'draw'
  | 'players'
  | 'bingo'
  | 'status'
  | 'verify'
  | 'winner'
  | 'tie_decision'
  | 'tie_vote'
  | 'tie_response';

export interface RealtimeMessage {
  type: RealtimeEventType;
  payload: unknown;
}

type MessageHandler = (msg: RealtimeMessage) => void;

interface ChannelRef {
  channel: RealtimeChannel;
  handlers: MessageHandler[];
}

const channels = new Map<string, ChannelRef>();

export function subscribeToGame(
  code: string,
  handler: MessageHandler
): () => void {
  const key = `game:${code}`;

  if (channels.has(key)) {
    const ref = channels.get(key)!;
    ref.handlers.push(handler);
    return () => unsubscribeHandler(key, handler);
  }

  const channel = supabase.channel(key, {
    config: { broadcast: { self: true } },
  });

  const ref: ChannelRef = { channel, handlers: [handler] };
  channels.set(key, ref);

  const eventTypes: RealtimeEventType[] = [
    'draw',
    'players',
    'bingo',
    'status',
    'verify',
    'winner',
    'tie_decision',
    'tie_vote',
    'tie_response',
  ];

  for (const event of eventTypes) {
    channel.on('broadcast', { event }, (payload) => {
      const msg: RealtimeMessage = {
        type: event,
        payload: payload.payload,
      };
      for (const h of [...ref.handlers]) {
        h(msg);
      }
    });
  }

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.error(`Realtime channel error for ${key}, reconnecting...`);
      setTimeout(() => {
        channel.subscribe();
      }, 3000);
    }
  });

  return () => unsubscribeHandler(key, handler);
}

function unsubscribeHandler(key: string, handler: MessageHandler): void {
  const ref = channels.get(key);
  if (!ref) return;

  ref.handlers = ref.handlers.filter((h) => h !== handler);

  if (ref.handlers.length === 0) {
    supabase.removeChannel(ref.channel);
    channels.delete(key);
  }
}

export async function broadcastToGame(
  code: string,
  type: RealtimeEventType,
  payload: unknown
): Promise<void> {
  const key = `game:${code}`;

  // Get or create channel for broadcasting
  let ref = channels.get(key);

  if (!ref) {
    const channel = supabase.channel(key, {
      config: { broadcast: { self: true } },
    });
    ref = { channel, handlers: [] };
    channels.set(key, ref);
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });
  }

  await ref.channel.send({
    type: 'broadcast',
    event: type,
    payload,
  });
}
