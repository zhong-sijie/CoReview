import React from 'react';
import ReactDOM from 'react-dom/client';
import App from 'app-component';
import '@common/base/tailwind.css';
import { initializeVSCodeService } from '@common/services/vscodeService';

initializeVSCodeService();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
