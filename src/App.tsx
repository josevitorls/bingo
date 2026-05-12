import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { Home } from './pages/Home';
import { CreateGame } from './pages/CreateGame';
import { HostPanel } from './pages/HostPanel';
import { JoinGame } from './pages/JoinGame';
import { PlayerGame } from './pages/PlayerGame';
import { Auth } from './pages/Auth';
import { Profile } from './pages/Profile';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/host/:code" element={<HostPanel />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/game/:code" element={<PlayerGame />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#16213e',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.12)',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 600,
          },
          success: {
            iconTheme: {
              primary: '#1aab5a',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#e02020',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </BrowserRouter>
  );
};

export default App;
