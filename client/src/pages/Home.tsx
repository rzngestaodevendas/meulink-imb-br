import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Copy, ExternalLink, FolderOpen, Link2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Home() {
  const [search, setSearch] = useState("");
  const [brokerName, setBrokerName] = useState(() => localStorage.getItem("meulink-broker-name") || "");
  const [brokerPhone, setBrokerPhone] = useState(() => localStorage.getItem("meulink-broker-phone") || "");
  const [links, setLinks] = useState<Record<number, string>>({});
  const catalog = trpc.catalog.list.useQuery({ search }, { staleTime: 15_000 });
  const createLink = trpc.catalog.createLink.useMutation({
    onSuccess: result => {
      const url = `${window.location.origin}/?link=${result.token}`;
      setLinks(current => ({ ...current, [result.property.id]: url }));
      toast.success("Link exclusivo criado");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => { localStorage.setItem("meulink-broker-name", brokerName); }, [brokerName]);
  useEffect(() => { localStorage.setItem("meulink-broker-phone", brokerPhone); }, [brokerPhone]);

  function generate(propertyId: number) {
    const phone = brokerPhone.replace(/\D/g, "");
    if (brokerName.trim().length < 3 || phone.length < 12) {
      toast.error("Informe seu nome e WhatsApp com DDI e DDD.");
      return;
    }
    createLink.mutate({ propertyId, brokerName: brokerName.trim(), brokerPhone: phone });
  }
  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="mb-6 overflow-hidden rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> MeuLink · operação segura</div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Catálogo de imóveis</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">Pesquise o estoque autorizado e gere um link neutro para cada atendimento.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs text-white/80"><ShieldCheck className="h-4 w-4 text-[#d7b874]" /> Dados da operação protegidos</div>
        </div>
      </header>

      <Card className="mb-5 border-0 shadow-sm">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.2fr] lg:items-end">
          <label className="grid gap-2 text-sm font-medium text-slate-700">Seu nome
            <Input value={brokerName} onChange={event => setBrokerName(event.target.value)} placeholder="Felipe Ransolin Fachinello" className="h-11" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">WhatsApp com DDI e DDD
            <Input value={brokerPhone} onChange={event => setBrokerPhone(event.target.value)} placeholder="5551999442252" inputMode="numeric" className="h-11" />
          </label>
          <div className="rounded-xl bg-[#f6f1e7] p-3 text-xs leading-relaxed text-slate-600">O cliente verá somente a página do imóvel e os seus dados. A origem do catálogo não é enviada ao link público.</div>
        </CardContent>
      </Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm text-slate-500">{catalog.data?.length ?? 0} imóveis disponíveis</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque autorizado</h2></div>
        <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome, endereço ou valor" className="h-10 bg-white pl-9" /></div>
      </div>

      {catalog.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando catálogo autorizado...</div>}
      {catalog.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{catalog.error.message}</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.data?.map(property => {
          const url = links[property.id];
          return <Card key={property.id} className="flex flex-col overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-lg">
            <div className="relative aspect-[16/9] bg-slate-100">{property.photos[0] ? <img loading="lazy" decoding="async" src={property.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d] hover:bg-white">{property.status === "available" ? "Disponível" : property.status}</Badge></div>
            <CardHeader className="pb-2"><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader>
            <CardContent className="flex flex-1 flex-col"><p className="mb-4 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mb-4 flex flex-wrap gap-1.5">{property.details.slice(0, 3).map(detail => <span key={detail} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div><div className="mt-auto grid gap-2 sm:grid-cols-2">{property.sourceDriveUrl && <a href={property.sourceDriveUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"><FolderOpen className="h-4 w-4" /> Fotos internas</a>}<Button onClick={() => generate(property.id)} disabled={createLink.isPending} className="h-10 gap-2 bg-[#20bd63] text-xs font-bold hover:bg-[#12934a]"><Link2 className="h-4 w-4" /> Gerar meu link</Button></div>{url && <div className="mt-3 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-[11px] text-emerald-900">{url}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(url)} className="h-8 flex-1 gap-1 text-xs"><Copy className="h-3 w-3" /> Copiar</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[#102c3d] text-xs font-semibold text-white"><ExternalLink className="h-3 w-3" /> Abrir</a></div></div>}</CardContent>
          </Card>;
        })}
      </div>
      {!catalog.isLoading && catalog.data?.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado para essa busca.</div>}
    </div>
  );
}
