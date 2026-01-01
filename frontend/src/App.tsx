import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MiniKitProvider } from './providers/MiniKitProvider';
import { GameProvider } from './context/GameContext';
import { SocketProvider } from './context/SocketContext';
import AuthWrapper from './components/AuthWrapper';
import Dashboard from './components/Dashboard';
import GameArena from './components/GameArena';
import Matchmaking from './components/Matchmaking';
import PracticeMode from './components/PracticeMode';
import ResultScreen from './components/ResultScreen';
import MatchHistory from './components/MatchHistory';
import Leaderboard from './components/Leaderboard';
import DebugPanel from './components/DebugPanel';

function App() {
  return (
    <MiniKitProvider>
      <GameProvider>
        <SocketProvider>
          <AuthWrapper>
            <Router>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/practice" element={<PracticeMode />} />
                <Route path="/matchmaking" element={<Matchmaking />} />
                <Route path="/game" element={<GameArena />} />
                <Route path="/result" element={<ResultScreen />} />
                <Route path="/history" element={<MatchHistory />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </AuthWrapper>
          <DebugPanel />
        </SocketProvider>
      </GameProvider>
    </MiniKitProvider>
  );
}

export default App;
