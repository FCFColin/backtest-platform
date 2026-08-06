import { BrowserRouter as Router } from 'react-router';
import ErrorBoundary from '@/components/errorBoundaries';
import AppShell from './AppShell.js';
export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </Router>
  );
}
