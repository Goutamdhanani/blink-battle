import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MiniKitProvider } from './providers/MiniKitProvider';
import { GameProvider } from './context/GameContext';
import Dashboard from './components/Dashboard';
import GameArena from './components/GameArena';
import Matchmaking from './components/Matchmaking';
import WalletConnect from './components/WalletConnect';
import ResultScreen from './components/ResultScreen';
import MatchHistory from './components/MatchHistory';
import Leaderboard from './components/Leaderboard';

function App() {
  return (
    <MiniKitProvider>
      <GameProvider>
        <Router>
          <Routes>
            <Route path="/" element={<WalletConnect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/matchmaking" element={<Matchmaking />} />
            <Route path="/game" element={<GameArena />} />
            <Route path="/result" element={<ResultScreen />} />
            <Route path="/history" element={<MatchHistory />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </GameProvider>
    </MiniKitProvider>
  );
}

export default App;
