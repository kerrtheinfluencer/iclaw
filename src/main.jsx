import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

// Remove splash screen
const splash = document.getElementById('splash');
if (splash) {
  splash.style.transition = 'opacity 0.4s ease-out';
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 400);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
