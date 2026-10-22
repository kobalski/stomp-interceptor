import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './Dashboard';
import './Dashboard.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Dashboard />
    </React.StrictMode>
  );
}
