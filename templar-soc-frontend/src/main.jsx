import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { SocProvider } from './context/SocContext.jsx';
import { AudioProvider } from './audio/AudioContext.jsx';
import './styles/global.css';

// HashRouter so the built bundle works when served from any static
// path / file:// preview without server-side route rewrites.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AudioProvider>
        <SocProvider>
          <App />
        </SocProvider>
      </AudioProvider>
    </HashRouter>
  </React.StrictMode>
);
