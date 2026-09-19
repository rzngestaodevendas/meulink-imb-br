import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Check, ExternalLink, Plus, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TableType = "third_party" | "own_development";
type Organization = { id: number; slug: string; name: string; publicName: string | null; logoUrl: string | null; contactName: string | null; contactPhone: string | null; tableType: TableType; developmentName: string | null; createdAt: Date };

const empty = { name: "", publicName: "", logoUrl: "", contactName: "", contactPhone: "", tableType: "third_party" as TableType, developmentName: "", developmentDescription: "" };

export default function Organizations() {
  const [form, setForm] = useState(empty);
  const organizations = trpc.organizations.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.organizations.create.useMutation({
    onSuccess: () => { toast.success("Tabela cadastrada e selecionada"); setForm(empty); utils.organizations.list.invalidate(); window.location.href = "/painelgestao"; },
    onError: error => toast.error(error.message),
  });
  const select = trpc.organizations.select.useMutation({ onSuccess: () => { toast.success("Tabela selecionada"); window.location.href = "/painelgestao"; }, onError: error => toast.error(error.message) });
  const set = (field: keyof typeof empty, value: string) => setForm(current => ({ ...current, [field]: value }));

  return <div className="min-h-screen bg-[#f7f8fa]">
    <header className="mb-6 rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><Building2 className="h-5 w-5 text-[#d7b874]" /></div><div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]">MeuLink · operação</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Construtoras e tabelas</h1><p className="mt-2 text-sm text-white/70">Cadastre a empresa antes de incluir imóveis. Cada tabela tem identidade, contato e estoque próprios.</p></div></div></header>
    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#102c3d]"><Plus className="h-4 w-4" /> Nova construtora ou tabela</CardTitle><p className="text-xs leading-relaxed text-slate-500">Depois de salvar, ela será selecionada automaticamente e você poderá cadastrar ou importar os imóveis dentro dela.</p></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); create.mutate(form); }} className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">Nome da empresa/construtora<Input required value={form.name} onChange={event => set("name", event.target.value)} placeholder="Atlântida Negócios Imobiliários" /></label>
        <label className="grid gap-2 text-sm font-medium">Nome exibido na tabela<Input value={form.publicName} onChange={event => set("publicName", event.target.value)} placeholder="Atlântida Negócios" /></label>
        <label className="grid gap-2 text-sm font-medium">Logo da construtora <span className="text-xs font-normal text-slate-500">URL pública ou caminho /media/</span><Input value={form.logoUrl} onChange={event => set("logoUrl", event.target.value)} placeholder="https://.../logo.png" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Responsável<Input value={form.contactName} onChange={event => set("contactName", event.target.value)} placeholder="Nome do responsável" /></label><label className="grid gap-2 text-sm font-medium">Telefone/WhatsApp<Input value={form.contactPhone} onChange={event => set("contactPhone", event.target.value)} placeholder="5551999999999" /></label></div>
        <label className="grid gap-2 text-sm font-medium">Tipo da tabela<select value={form.tableType} onChange={event => set("tableType", event.target.value as TableType)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="third_party">Imóveis de terceiros</option><option value="own_development">Empreendimento próprio</option></select></label>
        {form.tableType === "own_development" && <><label className="grid gap-2 text-sm font-medium">Nome do empreendimento<Input required value={form.developmentName} onChange={event => set("developmentName", event.target.value)} placeholder="Residencial Atlântida" /></label><label className="grid gap-2 text-sm font-medium">Descrição do empreendimento<textarea value={form.developmentDescription} onChange={event => set("developmentDescription", event.target.value)} className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Informações comerciais do empreendimento" /></label></>}
        <Button type="submit" disabled={create.isPending} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Plus className="h-4 w-4" /> {create.isPending ? "Cadastrando..." : "Cadastrar e começar estoque"}</Button>
      </form></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base text-[#102c3d]">Tabelas cadastradas</CardTitle><p className="text-xs text-slate-500">Selecione uma tabela antes de cadastrar imóveis ou abrir o portal do corretor.</p></CardHeader><CardContent className="grid gap-3">{organizations.isLoading && <p className="py-6 text-center text-sm text-slate-500">Carregando tabelas...</p>}{organizations.error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{organizations.error.message}</p>}{(organizations.data as Organization[] | undefined)?.map(organization => <div key={organization.id} className="rounded-xl border border-slate-200 p-4"><div className="flex gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#102c3d]">{organization.logoUrl ? <img src={organization.logoUrl} alt="" className="h-full w-full object-contain bg-white" /> : <ImageIcon className="h-5 w-5 text-[#d7b874]" />}</div><div className="min-w-0 flex-1"><p className="font-semibold text-[#102c3d]">{organization.publicName || organization.name}</p><p className="text-xs text-slate-500">{organization.name}</p><p className="mt-1 text-[11px] font-medium text-[#b38b3d]">{organization.tableType === "own_development" ? `Empreendimento próprio${organization.developmentName ? ` · ${organization.developmentName}` : ""}` : "Imóveis de terceiros"}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => select.mutate({ organizationId: organization.id })} className="gap-2"><Check className="h-4 w-4" /> Selecionar</Button><a href={`/tabela/${organization.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-[#102c3d] hover:bg-slate-50"><ExternalLink className="h-4 w-4" /> Portal da tabela</a></div><p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{window.location.origin}/tabela/{organization.slug}</p></div>)}{!organizations.isLoading && !organizations.error && organizations.data?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma tabela cadastrada. Cadastre a primeira para liberar o estoque.</p>}</CardContent></Card>
    </div>
  </div>;
}
