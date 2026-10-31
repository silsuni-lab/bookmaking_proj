import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/gaegu/400.css';
import '@fontsource/gaegu/700.css';
import './styles.css';
import App from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
