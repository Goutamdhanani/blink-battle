import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { MiniKit } from '@worldcoin/minikit-js';
import './index.css';

// Log startup information for debugging
console.log('🚀 [App] Starting Blink Battle Mini-App');
console.log('📍 [App] Environment:', import.meta.env.MODE);
console.log('🌐 [App] API URL:', import.meta.env.VITE_API_URL || 'Not configured');
console.log('🆔 [App] App ID:', import.meta.env.VITE_APP_ID ? 'Configured' : '❌ NOT CONFIGURED');
console.log('🌍 [App] Worldcoin App ID:', import.meta.env.VITE_WORLDCOIN_APP_ID ? 'Configured' : '❌ NOT CONFIGURED');

// Initialize MiniKit early in the app lifecycle
if (typeof window !== 'undefined') {
  const worldcoinAppId = import.meta.env.VITE_WORLDCOIN_APP_ID || import.meta.env.VITE_APP_ID;
  
  if (worldcoinAppId && worldcoinAppId !== 'app_staging_your_app_id') {
    try {
      // Install MiniKit first, then check if it's properly installed
      MiniKit.install(worldcoinAppId);
      console.log('✅ [MiniKit] Initialized with App ID:', worldcoinAppId);
      
      if (MiniKit.isInstalled()) {
        console.log('✅ [MiniKit] Running inside World App');
      } else {
        console.log('ℹ️ [MiniKit] Not in World App - some features may be limited');
      }
    } catch (error) {
      console.error('❌ [MiniKit] Initialization error:', error);
    }
  } else {
    console.warn('⚠️ [MiniKit] No valid App ID found. Set VITE_WORLDCOIN_APP_ID in .env file');
  }
}

// Set up global error handlers to catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('❌ [Global] Uncaught error:', event.error);
  console.error('❌ [Global] Error message:', event.message);
  console.error('❌ [Global] Error location:', `${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ [Global] Unhandled promise rejection:', event.reason);
  console.error('❌ [Global] Promise:', event.promise);
});

// Validate critical environment variables at startup
const validateEnv = () => {
  const errors: string[] = [];
  
  const worldcoinAppId = import.meta.env.VITE_WORLDCOIN_APP_ID || import.meta.env.VITE_APP_ID;
  if (!worldcoinAppId || worldcoinAppId === 'app_staging_your_app_id') {
    errors.push('VITE_WORLDCOIN_APP_ID or VITE_APP_ID is not set. Please configure it in your .env file.');
  }
  
  const worldIdAction = import.meta.env.VITE_WORLD_ID_ACTION || import.meta.env.VITE_WORLDCOIN_ACTION;
  if (!worldIdAction) {
    errors.push('VITE_WORLD_ID_ACTION or VITE_WORLDCOIN_ACTION is not set. World ID verification will use default action.');
  }
  
  if (!import.meta.env.VITE_PLATFORM_WALLET_ADDRESS) {
    errors.push('VITE_PLATFORM_WALLET_ADDRESS is not set. Payment features will not work.');
  }
  
  if (errors.length > 0) {
    console.warn('⚠️ [App] Environment configuration issues:');
    errors.forEach((error) => console.warn('  -', error));
    console.warn('⚠️ [App] Check .env.example for required variables');
  }
};

validateEnv();

// Render app with error boundary
const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found. The app cannot start.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
