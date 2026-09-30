import { Router, Route } from '@solidjs/router';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
import LeadDetail from './pages/LeadDetail';
import LeadForm from './pages/LeadForm';
import Templates from './pages/Templates';
import ImportExport from './pages/ImportExport';
import Team from './pages/Team';
import Login from './pages/Login';
import WhatsAppInbox from './pages/WhatsAppInbox';
import WhatsAppSettings from './pages/WhatsAppSettings';
import ActivityCatalog from './pages/ActivityCatalog';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Route path="/login" component={Login} />
          <Route path="/" component={() => <ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/leads" component={() => <ProtectedRoute><LeadsList /></ProtectedRoute>} />
          <Route path="/leads/new" component={() => <ProtectedRoute><LeadForm /></ProtectedRoute>} />
          <Route path="/leads/:id" component={() => <ProtectedRoute><LeadDetail /></ProtectedRoute>} />
          <Route path="/inbox" component={() => <ProtectedRoute><WhatsAppInbox /></ProtectedRoute>} />
          <Route path="/templates" component={() => <ProtectedRoute><Templates /></ProtectedRoute>} />
          <Route path="/import-export" component={() => <ProtectedRoute><ImportExport /></ProtectedRoute>} />
          <Route path="/activities" component={() => <ProtectedRoute><ActivityCatalog /></ProtectedRoute>} />
          <Route path="/settings/whatsapp" component={() => <ProtectedRoute adminOnly><WhatsAppSettings /></ProtectedRoute>} />
          <Route path="/team" component={() => <ProtectedRoute adminOnly><Team /></ProtectedRoute>} />
          <Route path="*404" component={() => <ProtectedRoute><Dashboard /></ProtectedRoute>} />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
