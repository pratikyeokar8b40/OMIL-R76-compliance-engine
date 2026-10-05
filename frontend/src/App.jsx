import React, { useState } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/Navbar';
import Header from '@/components/Header';
import HelpDialog from '@/components/HelpDialog';

// Pages
import Landing from '@/pages/Landing';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import About from '@/pages/About';
import NewEvaluation from '@/pages/NewEvaluation';
import ActiveSession from '@/pages/ActiveSession';
import Reports from '@/pages/Reports';
import ReportView from '@/pages/ReportView';
import Verify from '@/pages/Verify';
import NotFound from '@/pages/NotFound';
import Registry from '@/pages/Registry';
import Admin from '@/pages/Admin';
import JudgeAccess from '@/components/JudgeAccess'; // TEMPORARY: SIH judge access
import { syncOutbox } from '@/lib/sync';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AUDIT_ROLES, REGISTRY_ROLES, TECHNICIAN_ROLES, hasRole } from '@/lib/roles';
import { ShieldOff } from 'lucide-react';

const queryClient = new QueryClient();

function Shell({ children }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="console-shell grain flex min-h-[100dvh]">
      <Navbar
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <main className="min-w-0 flex-1 flex flex-col">
        <Header
          onOpenMobileNav={() => setMobileNav(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <div className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-7 md:px-10 md:py-10">
          {children}
        </div>
      </main>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// Route-level RBAC guard. The server is the real enforcement point, but the
// UI should reflect it too: a technician who bookmarks or types /admin
// shouldn't land on a fully rendered governance console.
function RequireRole({ roles, children }) {
  const user = useCurrentUser();
  if (hasRole(user, roles)) return children;
  return (
    <div className="panel mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f7dfdc] text-[#b24b43]">
        <ShieldOff size={22} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Restricted to authorized roles</h2>
      <p className="mt-2 text-sm leading-6 text-[#66837d]">
        {user?.role
          ? `Your role (${user.role}) doesn't have access to this area.`
          : 'Sign in with an authorized account to view this area.'}
      </p>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={() => <Shell><Home /></Shell>} />
      <Route path="/about" component={() => <Shell><About /></Shell>} />
      <Route
        path="/evaluations/new"
        component={() => (
          <Shell>
            <RequireRole roles={TECHNICIAN_ROLES}>
              <NewEvaluation />
            </RequireRole>
          </Shell>
        )}
      />
      <Route path="/sessions/active" component={() => <Shell><ActiveSession /></Shell>} />
      <Route path="/reports" component={() => <Shell><Reports /></Shell>} />
      <Route path="/reports/:id">{(params) => <Shell><ReportView id={params.id} /></Shell>}</Route>
      <Route
        path="/instruments"
        component={() => (
          <Shell>
            <RequireRole roles={REGISTRY_ROLES}>
              <Registry />
            </RequireRole>
          </Shell>
        )}
      />
      <Route
        path="/admin"
        component={() => (
          <Shell>
            <RequireRole roles={AUDIT_ROLES}>
              <Admin />
            </RequireRole>
          </Shell>
        )}
      />
      <Route path="/verify/:id">{(params) => <Verify id={params.id} />}</Route>
      <Route path="/login" component={Login} />
      <Route component={() => <Shell><NotFound /></Shell>} />
    </Switch>
  );
}

function ProtectedRouter() {
  const [location] = useLocation();
  const authenticated = localStorage.getItem('nawi-authenticated') === '1';

  if (location === '/' || location.startsWith('/verify/')) {
    return <AppRoutes />;
  }

  if (!authenticated && location !== '/login') {
    return <Login />;
  }

  return <AppRoutes />;
}

function RoutedErrorBoundary({ children }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export function App() {
  React.useEffect(() => {
    const runSync = () => { void syncOutbox(); };
    runSync();
    window.addEventListener('online', runSync);
    const t = window.setInterval(runSync, 30000);
    return () => {
      window.removeEventListener('online', runSync);
      window.clearInterval(t);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter>
          <JudgeAccess />
          <RoutedErrorBoundary>
            <ProtectedRouter />
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
