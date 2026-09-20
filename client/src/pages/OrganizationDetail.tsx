import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ManageProperties from "./ManageProperties";
import { ArrowLeft, Building2, ExternalLink, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";

type EntityType = "construtora" | "imobiliaria" | "corretor";
type Organization = { id: number; entityType?: EntityType; slug: string; name: string; publicName: string | null; logoUrl: string | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null; contactAddress: string | null; websiteUrl: string | null; tableType: string; developmentName: string | null; availablePropertyCount?: number };

const entityLabels: Record<EntityType, string> = { construtora: "Construtora", imobiliaria: "Imobiliária", corretor: "Corretor" };

export default function OrganizationDetail() {
  const [, params] = useRoute("/painelgestao/construtoras/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id || 0);
  const organizations = trpc.organizations.list.useQuery();
  const select = trpc.organizations.select.useMutation();
  const selected = useRef(false);
  const organization = (organizations.data as Organization[] | undefined)?.find(item => item.id === id);

  useEffect(() => {
    if (id > 0 && organization && !selected.current) {
      selected.current = true;
      select.mutate({ organizationId: id });
    }
  }, [id, Boolean(organization)]);

  if (organizations.isLoading || select.isPending) return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Abrindo tabela...</div>;
  if (!organization) return <Card><CardContent className="p-8 text-center"><p className="font-semibold text-[#102c3d]">Tabela não encontrada</p><Button className="mt-4" onClick={() => setLocation("/painelgestao/construtoras")}>Voltar às tabelas</Button></CardContent></Card>;

  const entity = organization.entityType || "construtora";
  return <div className="min-h-screen bg-[#f7f8fa]">
    <header className="mb-6 overflow-hidden rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg">{organization.logoUrl ? <img src={organization.logoUrl} alt={`Logo ${organization.name}`} className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8 text-[#102c3d]" />}</div><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]">{entityLabels[entity]} · tabela própria</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{organization.publicName || organization.name}</h1><p className="mt-2 text-sm text-white/70">Gerencie os dados da tabela e o estoque de imóveis desta operação.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setLocation("/painelgestao/construtoras")} className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4" /> Tabelas</Button><Button variant="outline" onClick={() => setLocation(`/painelgestao/construtoras?editar=${organization.id}`)} className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Pencil className="h-4 w-4" /> Editar dados</Button><a href={`/${organization.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#d7b874] px-4 text-sm font-semibold text-[#102c3d] hover:bg-[#e6cc94]"><ExternalLink className="h-4 w-4" /> Página pública</a></div>
      </div>
    </header>
    <Card className="mb-6 border-0 shadow-sm"><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Tipo</p><p className="mt-1 font-semibold text-[#102c3d]">{entityLabels[entity]}</p></div><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Imóveis disponíveis</p><p className="mt-1 font-semibold text-[#102c3d]">{organization.availablePropertyCount ?? 0}</p></div><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Responsável</p><p className="mt-1 font-semibold text-[#102c3d]">{organization.contactName || "Não informado"}</p><p className="text-xs text-slate-500">{organization.contactPhone || ""}</p></div><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Link público</p><p className="mt-1 truncate text-sm font-semibold text-[#b38b3d]">/{organization.slug}</p></div></CardContent></Card>
    <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#b38b3d]" /><div><h2 className="text-xl font-semibold text-[#102c3d]">Imóveis desta tabela</h2><p className="text-sm text-slate-500">Inclua novos imóveis, edite informações, fotos, status e arquive os que não estão mais disponíveis.</p></div></div>
    <ManageProperties />
  </div>;
}
