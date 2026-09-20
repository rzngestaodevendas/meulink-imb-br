import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Edit3, Plus, Save, Archive, UploadCloud, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "available" | "reserved" | "sold" | "unavailable" | "updating" | "hidden";
type Property = { id: number; slug: string; title: string; address: string | null; responsibleName?: string | null; responsiblePhone?: string | null; details: string[]; price: string | null; notes: string | null; photos: string[]; status: Status; publicEnabled: boolean; sourceDriveUrl?: string | null };
type FormState = { title: string; address: string; responsibleName: string; responsiblePhone: string; details: string; price: string; notes: string; photos: string; status: Status; publicEnabled: boolean };

const statusLabels: Record<Status, string> = { available: "Disponível", reserved: "Reservado", sold: "Vendido", unavailable: "Indisponível", updating: "Em atualização", hidden: "Arquivado" };
const blankForm: FormState = { title: "", address: "", responsibleName: "", responsiblePhone: "", details: "", price: "", notes: "", photos: "", status: "available", publicEnabled: true };

function toForm(property?: Property): FormState {
  if (!property) return blankForm;
  return { title: property.title, address: property.address || "", responsibleName: property.responsibleName || "", responsiblePhone: property.responsiblePhone || "", details: property.details.join("\n"), price: property.price || "", notes: property.notes || "", photos: property.photos.join("\n"), status: property.status, publicEnabled: property.publicEnabled };
}

function parseTable(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Cole o cabeçalho e pelo menos uma linha da tabela.");
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(value => value.trim().toLowerCase());
  const index = (names: string[]) => headers.findIndex(header => names.includes(header));
  const get = (parts: string[], names: string[]) => { const position = index(names); return position >= 0 ? (parts[position] || "").trim() : ""; };
  return lines.slice(1).map(line => {
    const parts = line.split(separator);
    const publicValue = get(parts, ["publico", "público", "publicenabled"]).toLowerCase();
    const status = (get(parts, ["status"]) || "available") as Status;
    return { title: get(parts, ["titulo", "título", "nome"]), address: get(parts, ["endereco", "endereço", "localizacao", "localização"]), responsibleName: get(parts, ["responsavel", "responsável", "responsavelnome"]), responsiblePhone: get(parts, ["whatsappresponsavel", "telefone_responsavel", "responsaveltelefone"]), details: get(parts, ["detalhes", "caracteristicas", "características"]).split("|").map(item => item.trim()).filter(Boolean), price: get(parts, ["preco", "preço", "valor"]), notes: get(parts, ["observacoes", "observações", "descricao", "descrição"]), photos: get(parts, ["fotos", "photos", "imagens"]).split("|").map(item => item.trim()).filter(Boolean), status, publicEnabled: publicValue !== "nao" && publicValue !== "não" };
  });
}

export default function ManageProperties({ compact = false, groupByResponsible = false }: { compact?: boolean; groupByResponsible?: boolean }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const catalog = trpc.catalog.list.useQuery({ search }, { staleTime: 10_000 });
  const organizations = trpc.organizations.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.properties.create.useMutation({ onSuccess: () => { toast.success("Imóvel cadastrado"); setEditing(null); setForm(blankForm); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const update = trpc.properties.update.useMutation({ onSuccess: () => { toast.success("Imóvel atualizado"); setEditing(null); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const archive = trpc.properties.archive.useMutation({ onSuccess: () => { toast.success("Imóvel arquivado"); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const bulkCreate = trpc.properties.bulkCreate.useMutation({ onSuccess: result => { toast.success(`${result.count} imóveis importados`); setImportCsv(""); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadPhoto = trpc.properties.uploadPhoto.useMutation({ onError: error => toast.error(error.message) });
  const [importCsv, setImportCsv] = useState("");
  const properties = (catalog.data || []) as Property[];
  const displayProperties = groupByResponsible ? [...properties].sort((a, b) => (a.responsibleName || "Imóveis sem responsável").localeCompare(b.responsibleName || "Imóveis sem responsável")) : properties;
  const editingProperty = useMemo(() => editing && editing !== "new" ? properties.find(property => property.id === editing) : undefined, [editing, properties]);

  const hasOrganization = Boolean(organizations.data?.length);
  function openNew() { if (!hasOrganization) { toast.error("Cadastre ou selecione uma construtora/tabela antes de incluir imóveis."); window.location.href = "/painelgestao/construtoras"; return; } setEditing("new"); setForm(blankForm); }
  function openEdit(property: Property) { setEditing(property.id); setForm(toForm(property)); }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("novo") === "1" && hasOrganization) {
      setEditing("new");
      setForm(blankForm);
      return;
    }
    const propertyId = Number(params.get("editar"));
    const property = propertyId ? properties.find(item => item.id === propertyId) : undefined;
    if (property) openEdit(property);
  }, [hasOrganization, properties]);
  async function addPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (files.length > 30) { toast.error("Selecione no máximo 30 fotos por vez."); return; }
    const accepted = files.filter(file => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) && file.size <= 8 * 1024 * 1024);
    if (accepted.length !== files.length) toast.error("Use imagens JPG, PNG, WEBP ou GIF de até 8 MB cada.");
    const uploaded: string[] = [];
    for (const file of accepted) {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await uploadPhoto.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data });
      uploaded.push(result.url);
    }
    if (uploaded.length) { setForm(current => ({ ...current, photos: [...current.photos.split("\n").filter(Boolean), ...uploaded].join("\n") })); toast.success(`${uploaded.length} foto(s) adicionada(s)`); }
    event.target.value = "";
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const data = { title: form.title, address: form.address, responsibleName: form.responsibleName, responsiblePhone: form.responsiblePhone, details: form.details.split("\n").map(item => item.trim()).filter(Boolean), price: form.price, notes: form.notes, photos: form.photos.split("\n").map(item => item.trim()).filter(Boolean), status: form.status, publicEnabled: form.publicEnabled };
    if (editing === "new") create.mutate(data); else if (typeof editing === "number") update.mutate({ id: editing, data });
  }
  const busy = create.isPending || update.isPending;
  const sampleCsv = "titulo;endereco;preco;detalhes;fotos;status;publico\nApartamento Horizonte 101;Rua Central 100;R$ 850.000;02 dormitórios|80 M²|Box;https://exemplo.com/foto.jpg;available;sim";

  return <div className="min-h-screen bg-[#f7f8fa]">
    {!compact && <header className="mb-6 rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> MeuLink · gestão</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gerenciar imóveis</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Cadastre, revise e controle o que pode aparecer nos links públicos.</p></div>
        <Button onClick={openNew} disabled={!hasOrganization} className="gap-2 bg-[#d7b874] text-[#102c3d] hover:bg-[#e6cc94]"><Plus className="h-4 w-4" /> Novo imóvel</Button>
      </div>
    </header>}

    {!hasOrganization && !organizations.isLoading && <Card className="mb-6 border-amber-200 bg-amber-50 shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-amber-950">Cadastre a construtora antes do imóvel</p><p className="mt-1 text-sm text-amber-900/80">Todo imóvel precisa pertencer a uma tabela, com logo, contato e tipo de estoque definidos.</p></div><Button onClick={() => { window.location.href = "/painelgestao/construtoras"; }} className="bg-[#102c3d] hover:bg-[#173e53]">Cadastrar construtora</Button></CardContent></Card>}

    {editing !== null && <Card className="mb-6 border-0 shadow-sm"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>{editing === "new" ? "Cadastrar imóvel" : `Editar ${editingProperty?.title || "imóvel"}`}</CardTitle><Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Fechar formulário"><X className="h-4 w-4" /></Button></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Título<Input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Apartamento Sofia Palace 1207" /></label>
      <label className="grid gap-2 text-sm font-medium">Preço<Input value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="R$ 950.000,00" /></label>
      <label className="grid gap-2 text-sm font-medium lg:col-span-2">Endereço<Input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="Rua, número, bairro e cidade" /></label>
      <label className="grid gap-2 text-sm font-medium">Responsável interno<Input value={form.responsibleName} onChange={event => setForm({ ...form, responsibleName: event.target.value })} placeholder="Nome do responsável pelo imóvel" /></label>
      <label className="grid gap-2 text-sm font-medium">WhatsApp interno<Input value={form.responsiblePhone} onChange={event => setForm({ ...form, responsiblePhone: event.target.value })} placeholder="Não aparece na landing pública" /></label>
      <label className="grid gap-2 text-sm font-medium">Características <span className="text-xs font-normal text-slate-500">Uma por linha</span><textarea value={form.details} onChange={event => setForm({ ...form, details: event.target.value })} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" placeholder={'03 dormitórios\n101,25 M²\nBox'} /></label>
      <label className="grid gap-2 text-sm font-medium">Fotos <span className="text-xs font-normal text-slate-500">Adicione arquivos ou cole URLs, uma por linha</span><textarea value={form.photos} onChange={event => setForm({ ...form, photos: event.target.value })} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" placeholder="/media/properties/foto.jpg" /><span className="mt-1 flex items-center gap-3"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={addPhotos} disabled={uploadPhoto.isPending} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#102c3d] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />{uploadPhoto.isPending && <span className="shrink-0 text-xs text-[#b38b3d]">Enviando...</span>}</span><span className="text-xs font-normal text-slate-500">Até 60 fotos por imóvel · JPG, PNG ou WEBP · 8 MB por foto</span></label>
      <label className="grid gap-2 text-sm font-medium">Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Status })} className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium">Observações<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Informações internas ou comerciais" /></label>
      <label className="flex items-center gap-3 text-sm font-medium lg:col-span-2"><input type="checkbox" checked={form.publicEnabled} onChange={event => setForm({ ...form, publicEnabled: event.target.checked })} className="h-4 w-4 accent-[#20bd63]" /> Permitir divulgação em links públicos</label>
      <div className="flex flex-wrap justify-end gap-2 lg:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={busy} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar imóvel"}</Button></div>
    </form></CardContent></Card>}

    {!compact && <Card className="mb-6 border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#102c3d]"><UploadCloud className="h-4 w-4" /> Importar imóveis da tabela</CardTitle><p className="text-xs text-slate-500">Cole CSV separado por ponto e vírgula. A importação será vinculada à tabela selecionada.</p></CardHeader><CardContent><textarea disabled={!hasOrganization} value={importCsv} onChange={event => setImportCsv(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:bg-slate-100" placeholder={hasOrganization ? sampleCsv : "Cadastre uma construtora para liberar a importação."} /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Até 200 imóveis por importação. Fotos podem ser URLs públicas ou do storage do MeuLink.</p><Button disabled={!hasOrganization || bulkCreate.isPending || !importCsv.trim()} onClick={() => { try { bulkCreate.mutate({ rows: parseTable(importCsv) }); } catch (error) { toast.error(error instanceof Error ? error.message : "Tabela inválida"); } }} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><UploadCloud className="h-4 w-4" /> {bulkCreate.isPending ? "Importando..." : "Importar tabela"}</Button></div></CardContent></Card>}

    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis encontrados</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque da empresa</h2></div><div className="flex flex-col gap-2 sm:flex-row"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por título, endereço ou preço" className="h-10 bg-white sm:w-72" />{compact && <Button onClick={openNew} disabled={!hasOrganization} className="h-10 gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Plus className="h-4 w-4" /> Novo imóvel</Button>}</div></div>
    {catalog.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando imóveis...</div>}
    {catalog.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{catalog.error.message}</div>}
    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">{displayProperties.map((property, index) => <Fragment key={property.id}>{groupByResponsible && (index === 0 || (displayProperties[index - 1]?.responsibleName || "Imóveis sem responsável") !== (property.responsibleName || "Imóveis sem responsável")) && <div className="col-span-full mt-3 flex items-center justify-between rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-4 py-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Imóveis do corretor</p><h3 className="mt-1 text-lg font-semibold text-[#102c3d]">{property.responsibleName || "Imóveis sem responsável"}</h3></div><span className="text-xs text-slate-500">{displayProperties.filter(item => (item.responsibleName || "Imóveis sem responsável") === (property.responsibleName || "Imóveis sem responsável")).length} imóveis</span></div>}<Card key={property.id} className="flex h-full min-h-[410px] flex-col overflow-hidden border-0 shadow-sm"><div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={`Foto de ${property.title}`} className="block h-full w-full object-cover object-center" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d]">{statusLabels[property.status]}</Badge><span className="absolute bottom-3 right-3 rounded-full bg-[#102c3d]/80 px-2.5 py-1 text-[10px] font-semibold text-white">{property.photos.length} {property.photos.length === 1 ? "foto" : "fotos"}</span></div><CardHeader className="min-h-[92px] pb-2"><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-3 min-h-7 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><p className="mb-4 min-h-8 line-clamp-2 text-xs text-slate-500">{property.details.join(" · ") || "Sem características cadastradas"}</p><div className="mt-auto flex gap-2"><Button variant="outline" onClick={() => openEdit(property)} className="flex-1 gap-2"><Edit3 className="h-4 w-4" /> Editar</Button>{property.status !== "hidden" && <Button variant="outline" onClick={() => { if (window.confirm("Arquivar este imóvel e desativar seus links públicos?")) archive.mutate({ id: property.id }); }} className="gap-2 text-red-700 hover:bg-red-50"><Archive className="h-4 w-4" /> Arquivar</Button>}</div>{property.publicEnabled && property.status === "available" && <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3 w-3" /> Disponível para links públicos</p>}</CardContent></Card></Fragment>)}</div>
    {!catalog.isLoading && properties.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
  </div>;
}
