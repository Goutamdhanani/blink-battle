import { MiniKitProvider } from './providers/MiniKitProvider';
import BrainTrainingMenu from './components/BrainTrainingMenu';

function App() {
  return (
    <MiniKitProvider>
      <BrainTrainingMenu />
    </MiniKitProvider>
  );
}

export default App;
