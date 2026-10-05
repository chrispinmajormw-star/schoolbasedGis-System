import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { FeedbackProvider } from './lib/feedback.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FeedbackProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </FeedbackProvider>
  </React.StrictMode>,
);
