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
  title: string;
  address: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  details: string[];
  price: string | null;
  photos: string[];
  status: string;
};
type PortalOrganization = { name: string; publicName: string | null; logoUrl: string | null; contactName: string | null; contactPhone: string | null; tableType: string; developmentName: string | null; developmentDescription: string | null };

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
      const url = `${window.location.origin}/?link=${result.token}`;
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

  const organization = portal.data?.organization as PortalOrganization | undefined;
  const properties = (portal.data?.properties || []) as PortalProperty[];
  const filtered = properties.filter(property => `${property.title} ${property.address || ""} ${property.price || ""}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="min-h-screen bg-[#f7f8fa]">
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 overflow-hidden rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">{organization?.logoUrl ? <img src={organization.logoUrl} alt="Logo da construtora" className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-[#102c3d]" />}</div><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> {organization?.tableType === "own_development" ? "Empreendimento próprio" : "Imóveis de terceiros"}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{organization?.publicName || organization?.name || "Tabela de imóveis"}</h1><p className="mt-2 max-w-2xl text-sm text-white/70">{organization?.developmentName ? `${organization.developmentName} · ` : ""}Consulte o estoque autorizado e compartilhe uma apresentação personalizada com seu cliente.</p></div></div><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs text-white/80"><ShieldCheck className="h-4 w-4 text-[#d7b874]" /> Acesso autenticado</div>
        </div>
      </header>

      <Card className="mb-6 border-0 shadow-sm"><CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.1fr] lg:items-end"><label className="grid gap-2 text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#b38b3d]" /> Seu nome</span><Input value={brokerName} onChange={event => setBrokerName(event.target.value)} placeholder="Nome do corretor" className="h-11" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Seu WhatsApp<Input value={brokerPhone} onChange={event => setBrokerPhone(event.target.value)} placeholder="5551999999999" inputMode="numeric" className="h-11" /></label><div className="rounded-xl bg-[#f6f1e7] p-3 text-xs leading-relaxed text-slate-600">{organization?.contactName ? `Responsável pela tabela: ${organization.contactName}${organization.contactPhone ? ` · ${organization.contactPhone}` : ""}. ` : ""}Os seus dados serão exibidos somente na landing que você gerar. Os dados do responsável pelo imóvel permanecem internos.</div></CardContent></Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis disponíveis</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque autorizado</h2></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar imóvel ou valor" className="h-10 bg-white pl-9" /></div></div>
      {portal.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando tabela...</div>}
      <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map(property => { const url = links[property.id]; return <Card key={property.id} className="flex h-full min-h-[610px] flex-col overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={`Foto de ${property.title}`} className="block h-full w-full object-cover object-center" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d] hover:bg-white">Disponível</Badge><span className="absolute bottom-3 right-3 rounded-full bg-[#102c3d]/80 px-2.5 py-1 text-[10px] font-semibold text-white">{property.photos.length} {property.photos.length === 1 ? "foto" : "fotos"}</span></div><CardHeader className="min-h-[92px] pb-2"><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-3 min-h-7 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mb-3 min-h-8 flex flex-wrap content-start gap-1.5">{property.details.slice(0, 3).map(detail => <span key={detail} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div><div className="mb-4 min-h-[78px] rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-slate-700"><p className="font-semibold text-[#102c3d]">Responsável interno</p><p>{property.responsibleName || "Não informado"}</p>{property.responsiblePhone && <p className="text-slate-500">{property.responsiblePhone}</p>}</div><div className="mt-auto grid gap-2"><Button onClick={() => generate(property.id)} disabled={createLink.isPending} className="h-10 gap-2 bg-[#20bd63] text-xs font-bold hover:bg-[#12934a]"><Link2 className="h-4 w-4" /> Gerar landing com meus dados</Button>{url && <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-[11px] text-emerald-900">{url}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(url)} className="h-8 flex-1 gap-1 text-xs"><Copy className="h-3 w-3" /> Copiar</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[#102c3d] text-xs font-semibold text-white"><ExternalLink className="h-3 w-3" /> Abrir</a></div></div>}</div></CardContent></Card>; })}</div>
      {!portal.isLoading && filtered.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
    </main>
  </div>;
}
