import React from 'react'
import ReactDOM from 'react-dom/client'
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
window.L = L;
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
