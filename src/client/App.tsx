import { Router, Route } from '@solidjs/router';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Route path="/" component={Dashboard} />
          <Route path="/leads" component={LeadsList} />
          <Route path="/leads/new" component={LeadForm} />
          <Route path="/leads/:id" component={LeadDetail} />
          <Route path="/inbox" component={WhatsAppInbox} />
          <Route path="/templates" component={Templates} />
          <Route path="/import-export" component={ImportExport} />
          <Route path="/settings/whatsapp" component={WhatsAppSettings} />
          <Route path="/team" component={Team} />
          <Route path="/login" component={Login} />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
