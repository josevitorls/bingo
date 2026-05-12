# 🎱 BINGO Online — Multiplayer

A real-time multiplayer Bingo game built with React 18, TypeScript, Vite, Tailwind CSS, and Supabase.

## Features

- Real-time multiplayer via Supabase Realtime (WebSocket broadcast)
- Room-based games with 4-char codes (e.g. `A3B7`)
- Host panel: draw numbers manually or auto (1–60s interval)
- Multiple win modes: line, column, diagonal, full card
- Interactive 5×5 BINGO cards with FREE center cell
- Bingo verification by host
- Guest mode (no account required)
- Optional email/password accounts
- Full i18n: Portuguese (pt-BR) and English (en-US)
- Mobile-first responsive design

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime + RLS)
- **State**: React hooks + Supabase subscriptions
- **i18n**: react-i18next
- **Notifications**: react-hot-toast
- **Deployment**: Vercel

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/josevitorls/bingo.git
cd bingo
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Fill in your Supabase URL and anon key in `.env`

### 3. Run the database migration

In your Supabase dashboard → SQL Editor, run:

```
supabase/migrations/001_initial.sql
```

Or use the Supabase CLI:

```bash
npx supabase db push
```

### 4. Start development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

## Deployment (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Import repo to Vercel
2. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy — the `vercel.json` handles SPA routing

## Project Structure

```
src/
├── components/
│   ├── BingoCard/        # 5×5 interactive bingo card
│   ├── NumberBoard/      # Visual number tracker
│   ├── DrawPanel/        # Host draw controls + countdown
│   ├── PlayerList/       # Live player roster
│   └── BingoNotification/# Host bingo verification panel
├── pages/
│   ├── Home.tsx          # Landing page
│   ├── CreateGame.tsx    # Game creation form
│   ├── HostPanel.tsx     # Host control room
│   ├── JoinGame.tsx      # Player join form
│   ├── PlayerGame.tsx    # In-game player view
│   ├── Auth.tsx          # Login/register/guest
│   └── Profile.tsx       # Player stats & history
├── hooks/
│   ├── useGame.ts        # Game state + realtime sync
│   ├── useRealtime.ts    # Realtime subscribe/broadcast
│   └── useAuth.ts        # Player auth state
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── cardGenerator.ts  # 5×5 card generation
│   ├── gameCode.ts       # 4-char unique code generation
│   ├── bingoChecker.ts   # Win condition checks
│   └── realtime.ts       # Realtime channel management
├── i18n/
│   ├── pt-BR.json
│   └── en-US.json
└── types/index.ts
```

## Database Schema

See `supabase/migrations/001_initial.sql` for the full schema including:
- `players` — player profiles (guest or registered)
- `games` — game sessions with host token auth
- `game_players` — player↔game junction with card data
- `draw_events` — audit log of drawn numbers
- `card_history` — card hash deduplication

## Security

- Host actions validated via `host_token` (stored in localStorage, validated server-side via SQL function)
- RLS enabled on all tables
- Tokens generated with `crypto.randomUUID()`
- Draws performed server-side via Supabase RPC (not forgeable)
