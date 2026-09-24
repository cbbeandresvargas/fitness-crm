import { Router, Route } from '@solidjs/router';
import { AuthProvider } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
import LeadDetail from './pages/LeadDetail';
import LeadForm from './pages/LeadForm';
import Templates from './pages/Templates';
import ImportExport from './pages/ImportExport';
import Team from './pages/Team';
import Login from './pages/Login';

export function App() {
  return (
    <AuthProvider>
      <Router>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={LeadsList} />
        <Route path="/leads/new" component={LeadForm} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/templates" component={Templates} />
        <Route path="/import-export" component={ImportExport} />
        <Route path="/team" component={Team} />
        <Route path="/login" component={Login} />
      </Router>
    </AuthProvider>
  );
}
