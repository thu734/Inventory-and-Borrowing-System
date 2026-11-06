import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../features/auth/AuthProvider';
import { App } from './App';
import '../styles/global.css';
createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><App/></AuthProvider></StrictMode>);
