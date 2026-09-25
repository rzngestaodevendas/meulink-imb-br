import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import PublicProperty from "./pages/PublicProperty";
import BrokerPortal from "./pages/BrokerPortal";
import PublicCatalog from "./pages/PublicCatalog";
const ManageProperties = lazy(() => import("./pages/ManageProperties"));
const Team = lazy(() => import("./pages/Team"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Organizations = lazy(() => import("./pages/Organizations"));
const OrganizationDetail = lazy(() => import("./pages/OrganizationDetail"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Developments = lazy(() => import("./pages/Developments"));
const LoadingPage = () => <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500">Carregando painel...</div>;
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<LoadingPage />}>{children}</Suspense>;

function ProtectedApp() {
  return <DashboardLayout><Lazy><Organizations /></Lazy></DashboardLayout>;
}

function ProtectedDevelopments() { return <DashboardLayout><Lazy><Developments /></Lazy></DashboardLayout>; }

function ProtectedProperties() {
  return <DashboardLayout><Lazy><ManageProperties /></Lazy></DashboardLayout>;
}

function ProtectedTeam() {
  return <DashboardLayout><Lazy><Team /></Lazy></DashboardLayout>;
}

function ProtectedAuditLog() {
  return <DashboardLayout><Lazy><AuditLog /></Lazy></DashboardLayout>;
}

function ProtectedOrganizations() {
  return <DashboardLayout><Lazy><Organizations /></Lazy></DashboardLayout>;
}

function ProtectedAdminUsers() {
  return <DashboardLayout><Lazy><AdminUsers /></Lazy></DashboardLayout>;
}

function FriendlyPath() {
  const [, params] = useRoute("/:value");
  const value = params?.value || "";
  return /^ML-\d+$/i.test(value) ? <PublicProperty /> : <BrokerPortal />;
}

function PublicTableEntry() {
  const search = new URLSearchParams(window.location.search);
  return search.has("acesso") || search.has("compartilhar") ? <BrokerPortal /> : <PublicCatalog />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PublicProperty} />
      <Route path="/imovel/:code" component={PublicProperty} />
      <Route path="/corretor/:brokerSlug/imovel/:code" component={PublicProperty} />
      <Route path="/corretora/:brokerSlug/imovel/:code" component={PublicProperty} />
      <Route path="/tabelas/:slug/compartilhar" component={PublicCatalog} />
      <Route path="/tabelas/:slug/:responsible" component={PublicCatalog} />
      <Route path="/tabelas/:slug" component={PublicTableEntry} />
      <Route path="/tabela/:slug/compartilhar" component={PublicCatalog} />
      <Route path="/tabela/:slug/:responsible" component={PublicCatalog} />
      <Route path="/tabela/:slug" component={PublicTableEntry} />
      <Route path="/painelgestao" component={ProtectedApp} />
      <Route path="/painelgestao/imoveis" component={ProtectedProperties} />
      <Route path="/painelgestao/empreendimentos" component={ProtectedDevelopments} />
      <Route path="/painelgestao/equipe" component={ProtectedTeam} />
      <Route path="/painelgestao/auditoria" component={ProtectedAuditLog} />
      <Route path="/painelgestao/construtoras" component={ProtectedOrganizations} />
      <Route path="/painelgestao/construtoras/:id" component={() => <DashboardLayout><Lazy><OrganizationDetail /></Lazy></DashboardLayout>} />
      <Route path="/painelgestao/usuarios" component={ProtectedAdminUsers} />
      <Route path="/app" component={ProtectedApp} />
      <Route path="/app/imoveis" component={ProtectedProperties} />
      <Route path="/app/empreendimentos" component={ProtectedDevelopments} />
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
