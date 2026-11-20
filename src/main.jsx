import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './unified.css';
import './release061.css';
import './calendar062.css';
import './navigation063.css';
import './design-system.css';
import './workflow.css';
import './review-refinements.css';
import './widget-refinements.css';
import './collaboration/integration.css';

createRoot(document.getElementById('root')).render(<App />);
