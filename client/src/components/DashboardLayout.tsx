import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import AdminLogin from "@/pages/AdminLogin";
import { Button } from "./ui/button";
import { Building2, ClipboardList, Factory, LogOut, PanelTop, Plus, UserCog, Users } from "lucide-react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: Factory, label: "Tabelas", path: "/painelgestao/construtoras" },
  { icon: Users, label: "Equipe", path: "/painelgestao/equipe" },
  { icon: ClipboardList, label: "Auditoria", path: "/painelgestao/auditoria" },
  { icon: UserCog, label: "Usuários", path: "/painelgestao/usuarios", adminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <AdminLogin />;
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const visibleItems = menuItems.filter(item => !item.adminOnly || user?.role === "admin");
  const activeItem = visibleItems.find(item => location === item.path);

  return <div className="min-h-screen bg-[#f7f8fa] pb-20 md:pb-0">
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex min-h-[3.75rem] max-w-[1600px] items-center gap-2 px-3 sm:min-h-[4.5rem] sm:gap-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => setLocation("/painelgestao/construtoras")} className="flex shrink-0 items-center gap-3 rounded-xl px-1 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b874]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#102c3d] text-[#d7b874] shadow-sm sm:h-10 sm:w-10"><Building2 className="h-4 w-4 sm:h-5 sm:w-5" /></span>
          <span className="block"><span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-[#b38b3d] sm:text-[10px] sm:tracking-[0.2em]">MeuLink</span><span className="block text-xs font-semibold text-[#102c3d] sm:text-sm">Painel de gestão</span></span>
        </button>
        <span className="hidden h-8 w-px bg-slate-200 lg:block" />
        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 md:flex" aria-label="Navegação principal">
          {visibleItems.map(item => {
            const active = location === item.path || (item.path === "/painelgestao/construtoras" && location.startsWith("/painelgestao/construtoras/"));
            return <Button key={item.path} type="button" variant="ghost" onClick={() => setLocation(item.path)} className={`h-10 shrink-0 gap-2 rounded-lg px-3 text-sm font-medium ${active ? "bg-[#eef3f5] text-[#102c3d]" : "text-slate-600 hover:bg-slate-100 hover:text-[#102c3d]"}`}><item.icon className={`h-4 w-4 ${active ? "text-[#b38b3d]" : "text-slate-400"}`} />{item.label}</Button>;
          })}
        </nav>
        <Button type="button" onClick={() => setLocation("/painelgestao/construtoras?novo=1")} className="hidden h-10 shrink-0 gap-2 bg-[#20bd63] px-3 text-sm font-semibold text-white hover:bg-[#12934a] lg:flex"><Plus className="h-4 w-4" /> Criar tabela</Button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full bg-[#f6f1e7] px-3 py-2 text-xs font-medium text-[#8a6b32] xl:flex"><PanelTop className="h-3.5 w-3.5" /> Operação segura</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="flex items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b874]"><Avatar className="h-9 w-9 border border-slate-200"><AvatarFallback className="bg-[#102c3d] text-xs font-semibold text-white">{user?.name?.charAt(0).toUpperCase() || "M"}</AvatarFallback></Avatar><span className="hidden max-w-32 lg:block"><span className="block truncate text-xs font-semibold text-[#102c3d]">{user?.name || "Administrador"}</span><span className="block truncate text-[11px] text-slate-500">{user?.email || ""}</span></span></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={logout} className="cursor-pointer text-red-700 focus:text-red-700"><LogOut className="mr-2 h-4 w-4" /> Sair do painel</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(16,44,61,0.12)] backdrop-blur md:hidden" aria-label="Navegação móvel">
      {visibleItems.slice(0, 3).map(item => { const active = location === item.path || (item.path === "/painelgestao/construtoras" && location.startsWith("/painelgestao/construtoras/")); return <button key={item.path} type="button" onClick={() => setLocation(item.path)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${active ? "bg-[#eef3f5] text-[#102c3d]" : "text-slate-500"}`}><item.icon className={`h-5 w-5 ${active ? "text-[#b38b3d]" : "text-slate-400"}`} />{item.label}</button>; })}
      <button type="button" onClick={() => setLocation("/painelgestao/construtoras?novo=1")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-[#12934a]"><Plus className="h-5 w-5" />Nova tabela</button>
    </nav>
  </div>;
}
