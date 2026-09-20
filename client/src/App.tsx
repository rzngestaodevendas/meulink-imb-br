import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import PublicProperty from "./pages/PublicProperty";
import ManageProperties from "./pages/ManageProperties";
import Team from "./pages/Team";
import AuditLog from "./pages/AuditLog";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import BrokerPortal from "./pages/BrokerPortal";
import PublicCatalog from "./pages/PublicCatalog";
import AdminUsers from "./pages/AdminUsers";

function ProtectedApp() {
  return <DashboardLayout><Organizations /></DashboardLayout>;
}

function ProtectedProperties() {
  return <DashboardLayout><ManageProperties /></DashboardLayout>;
}

function ProtectedTeam() {
  return <DashboardLayout><Team /></DashboardLayout>;
}

function ProtectedAuditLog() {
  return <DashboardLayout><AuditLog /></DashboardLayout>;
}

function ProtectedOrganizations() {
  return <DashboardLayout><Organizations /></DashboardLayout>;
}

function ProtectedAdminUsers() {
  return <DashboardLayout><AdminUsers /></DashboardLayout>;
}

function FriendlyPath() {
  const [, params] = useRoute("/:value");
  const value = params?.value || "";
  return /^ML-\d+$/i.test(value) ? <PublicProperty /> : <BrokerPortal />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PublicProperty} />
      <Route path="/imovel/:code" component={PublicProperty} />
      <Route path="/corretor/:brokerSlug/imovel/:code" component={PublicProperty} />
      <Route path="/corretora/:brokerSlug/imovel/:code" component={PublicProperty} />
      <Route path="/tabela/:slug" component={BrokerPortal} />
      <Route path="/tabela/:slug/compartilhar" component={PublicCatalog} />
      <Route path="/painelgestao" component={ProtectedApp} />
      <Route path="/painelgestao/imoveis" component={ProtectedProperties} />
      <Route path="/painelgestao/equipe" component={ProtectedTeam} />
      <Route path="/painelgestao/auditoria" component={ProtectedAuditLog} />
      <Route path="/painelgestao/construtoras" component={ProtectedOrganizations} />
      <Route path="/painelgestao/construtoras/:id" component={() => <DashboardLayout><OrganizationDetail /></DashboardLayout>} />
      <Route path="/painelgestao/usuarios" component={ProtectedAdminUsers} />
      <Route path="/app" component={ProtectedApp} />
      <Route path="/app/imoveis" component={ProtectedProperties} />
      <Route path="/app/equipe" component={ProtectedTeam} />
      <Route path="/app/auditoria" component={ProtectedAuditLog} />
      <Route path="/app/construtoras" component={ProtectedOrganizations} />
      <Route path="/app/usuarios" component={ProtectedAdminUsers} />
      <Route path="/:value" component={FriendlyPath} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
