import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Copy, ExternalLink, Link2, LogIn, Search, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type PortalProperty = {
  id: number;
  slug?: string;
  title: string;
  address: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  details: string[];
  price: string | null;
  photos: string[];
  status: string;
  crm?: { code?: string; propertyType?: string; purpose?: string; bedrooms?: string; suites?: string; bathrooms?: string; parkingSpaces?: string; privateArea?: string; totalArea?: string; condoFee?: string; propertyTax?: string; quadraLote?: string; developmentName?: string; developmentType?: string };
};

export default function BrokerPortal() {
  const [, params] = useRoute("/tabela/:slug");
  const slug = params?.slug || "";
  const { user, loading, isAuthenticated } = useAuth();
  const [brokerName, setBrokerName] = useState(() => localStorage.getItem("meulink-broker-name") || user?.name || "");
  const [brokerPhone, setBrokerPhone] = useState(() => localStorage.getItem("meulink-broker-phone") || "");
  const [search, setSearch] = useState("");
  const [links, setLinks] = useState<Record<number, string>>({});
  const portal = trpc.portal.catalog.useQuery({ slug }, { enabled: Boolean(slug && isAuthenticated), staleTime: 15_000 });
  const createLink = trpc.catalog.createLink.useMutation({
    onSuccess: result => {
      const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const crm = (result.property as PortalProperty).crm || {};
      const code = crm.code || result.property.slug || `ML-${String(result.property.id).padStart(6, "0")}`;
      const url = `${window.location.origin}/corretor/${normalize(brokerName)}/imovel/${normalize(code)}`;
      setLinks(current => ({ ...current, [result.property.id]: url }));
      toast.success("Landing criada com os seus dados");
    },
    onError: error => toast.error(error.message),
  });

  function generate(propertyId: number) {
    const phone = brokerPhone.replace(/\D/g, "");
    if (brokerName.trim().length < 3 || phone.length < 12) {
      toast.error("Informe seu nome e WhatsApp com DDI e DDD.");
      return;
    }
    localStorage.setItem("meulink-broker-name", brokerName.trim());
    localStorage.setItem("meulink-broker-phone", phone);
    createLink.mutate({ propertyId, organizationId: portal.data?.organization.id, brokerName: brokerName.trim(), brokerPhone: phone });
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] text-sm text-slate-500">Validando acesso...</div>;
  if (!isAuthenticated) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5"><Card className="w-full max-w-md border-0 shadow-xl"><CardHeader className="space-y-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#102c3d]"><LogIn className="h-5 w-5 text-[#d7b874]" /></div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b38b3d]">MeuLink · portal do corretor</p><CardTitle className="mt-2 text-2xl text-[#102c3d]">Acesse sua tabela</CardTitle><p className="mt-2 text-sm leading-relaxed text-slate-500">Faça login para consultar os imóveis autorizados e gerar landings com o seu nome e WhatsApp.</p></div></CardHeader><CardContent><Button onClick={() => startLogin()} className="h-11 w-full gap-2 bg-[#102c3d] hover:bg-[#173e53]"><LogIn className="h-4 w-4" /> Entrar para continuar</Button></CardContent></Card></div>;
  if (portal.error) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5"><Card className="w-full max-w-md border-0 shadow-xl"><CardContent className="p-8 text-center"><p className="font-semibold text-[#102c3d]">Não foi possível abrir esta tabela</p><p className="mt-2 text-sm text-slate-500">{portal.error.message}</p></CardContent></Card></div>;

  const organization = portal.data?.organization;
  const properties = (portal.data?.properties || []) as PortalProperty[];
  const filtered = properties.filter(property => `${property.title} ${property.address || ""} ${property.price || ""}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="min-h-screen bg-[#f7f8fa]">
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 overflow-hidden rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> Portal exclusivo da tabela</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{organization?.publicName || organization?.name || "Tabela de imóveis"}</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Consulte o estoque autorizado, veja os responsáveis internos e compartilhe uma apresentação personalizada com seu cliente.</p></div><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs text-white/80"><ShieldCheck className="h-4 w-4 text-[#d7b874]" /> Acesso autenticado</div>
        </div>
      </header>

      <Card className="mb-6 border-0 shadow-sm"><CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.1fr] lg:items-end"><label className="grid gap-2 text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#b38b3d]" /> Seu nome</span><Input value={brokerName} onChange={event => setBrokerName(event.target.value)} placeholder="Nome do corretor" className="h-11" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Seu WhatsApp<Input value={brokerPhone} onChange={event => setBrokerPhone(event.target.value)} placeholder="5551999999999" inputMode="numeric" className="h-11" /></label><div className="rounded-xl bg-[#f6f1e7] p-3 text-xs leading-relaxed text-slate-600">Esses dados serão exibidos somente na landing que você gerar. Os dados do responsável permanecem internos.</div></CardContent></Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis disponíveis</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque autorizado</h2></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar imóvel ou valor" className="h-10 bg-white pl-9" /></div></div>
      {portal.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando tabela...</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(property => { const url = links[property.id]; const crm = property.crm || {}; return <Card key={property.id} className="flex flex-col overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[16/9] bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d] hover:bg-white">Disponível</Badge></div><CardHeader className="pb-2"><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p><p className="mt-1 text-[11px] text-slate-400">{crm.code && `Código ${crm.code} · `}{crm.propertyType || "Imóvel"} · {crm.purpose || "Venda"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-3 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mb-3 flex flex-wrap gap-1.5">{[[crm.bedrooms, "dorm."], [crm.suites, "suíte(s)"], [crm.bathrooms, "banh."], [crm.parkingSpaces, "vaga(s)"], [crm.privateArea && `${crm.privateArea}m²`, "priv."], [crm.condoFee, "cond."]].filter(item => item[0]).map(([value, label]) => <span key={`${label}-${value}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{value} {label}</span>)}{property.details.slice(0, 2).map(detail => <span key={detail} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div>{crm.developmentName && <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-slate-700"><p className="font-semibold text-[#102c3d]">{crm.developmentName}</p><p>{crm.developmentType || "Empreendimento"}</p></div>}<div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-slate-700"><p className="font-semibold text-[#102c3d]">Responsável interno</p><p>{property.responsibleName || "Não informado"}</p>{property.responsiblePhone && <p className="text-slate-500">{property.responsiblePhone}</p>}</div><div className="mt-auto grid gap-2"><Button onClick={() => generate(property.id)} disabled={createLink.isPending} className="h-10 gap-2 bg-[#20bd63] text-xs font-bold hover:bg-[#12934a]"><Link2 className="h-4 w-4" /> Gerar landing com meus dados</Button>{url && <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-[11px] text-emerald-900">{url}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(url)} className="h-8 flex-1 gap-1 text-xs"><Copy className="h-3 w-3" /> Copiar</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[#102c3d] text-xs font-semibold text-white"><ExternalLink className="h-3 w-3" /> Abrir</a></div></div>}</div></CardContent></Card>; })}</div>
      {!portal.isLoading && filtered.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
    </main>
  </div>;
}
