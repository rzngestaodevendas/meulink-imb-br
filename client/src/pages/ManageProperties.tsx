import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Edit3, GripVertical, ImagePlus, Plus, Save, Archive, Star, Trash2, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { blankCrm, normalizeCrm, PropertyCrmFields, type PropertyCrmData } from "@/components/PropertyCrmFields";

type Status = "available" | "reserved" | "sold" | "unavailable" | "updating" | "hidden";
type Property = { id: number; slug: string; title: string; address: string | null; responsibleName?: string | null; responsiblePhone?: string | null; details: string[]; price: string | null; notes: string | null; photos: string[]; crm?: Partial<PropertyCrmData>; status: Status; publicEnabled: boolean; sourceDriveUrl?: string | null };
type FormState = { title: string; address: string; responsibleName: string; responsiblePhone: string; details: string; price: string; notes: string; photos: string[]; crmData: PropertyCrmData; status: Status; publicEnabled: boolean };

const statusLabels: Record<Status, string> = { available: "Disponível", reserved: "Reservado", sold: "Vendido", unavailable: "Indisponível", updating: "Em atualização", hidden: "Arquivado" };
const blankForm: FormState = { title: "", address: "", responsibleName: "", responsiblePhone: "", details: "", price: "", notes: "", photos: [], crmData: blankCrm, status: "available", publicEnabled: true };
const MAX_PHOTOS = 30;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function toForm(property?: Property): FormState {
  if (!property) return blankForm;
  return { title: property.title, address: property.address || "", responsibleName: property.responsibleName || "", responsiblePhone: property.responsiblePhone || "", details: property.details.join("\n"), price: property.price || "", notes: property.notes || "", photos: property.photos, crmData: normalizeCrm(property.crm), status: property.status, publicEnabled: property.publicEnabled };
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function PhotoGalleryEditor({ photos, onChange, uploadImage, uploading }: { photos: string[]; onChange: (photos: string[]) => void; uploadImage: (input: { fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif"; base64: string }) => Promise<{ url: string }>; uploading: boolean }) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function finishDrag() {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      const next = [...photos];
      const [moved] = next.splice(draggingIndex, 1);
      next.splice(dragOverIndex, 0, moved);
      onChange(next);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;
    if (photos.length + files.length > MAX_PHOTOS) { toast.error(`Cada imóvel pode ter no máximo ${MAX_PHOTOS} fotos.`); return; }
    const invalid = files.find(file => !allowedImageTypes.has(file.type));
    if (invalid) { toast.error(`${invalid.name} não é um formato de imagem aceito.`); return; }
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} excede o limite de 8 MB.`);
        const result = await uploadImage({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif", base64: await fileToBase64(file) });
        uploaded.push(result.url);
      }
      onChange([...photos, ...uploaded]);
      toast.success(`${uploaded.length} foto${uploaded.length === 1 ? " adicionada" : "s adicionadas"}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar as fotos."); }
  }

  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 sm:p-4 lg:col-span-2">
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#102c3d]">Galeria do imóvel</p><p className="text-xs font-normal text-slate-500">Selecione várias fotos, toque/clique em uma para definir a capa e arraste para organizar a ordem.</p></div><Badge variant="secondary">{photos.length}/{MAX_PHOTOS}</Badge></div>
    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-[#d7b874]/70 bg-white px-4 py-3 text-center text-sm font-medium text-[#102c3d] transition hover:border-[#20bd63] hover:bg-emerald-50"><ImagePlus className="h-6 w-6 text-[#20bd63]" /><span>{uploading ? "Enviando fotos..." : "Escolher fotos do dispositivo"}</span><span className="text-xs font-normal text-slate-500">JPG, PNG, WEBP, GIF ou AVIF · até 8 MB por foto · seleção múltipla</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple disabled={uploading || photos.length >= MAX_PHOTOS} onChange={handleFiles} className="sr-only" /></label>
    {photos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{photos.map((photo, index) => <div key={`${photo}-${index}`} data-photo-index={index} onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); setDraggingIndex(index); setDragOverIndex(index); }} onPointerMove={event => { if (draggingIndex === null) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-photo-index]"); if (target?.dataset.photoIndex) setDragOverIndex(Number(target.dataset.photoIndex)); }} onPointerUp={finishDrag} onPointerCancel={finishDrag} className={`relative overflow-hidden rounded-lg border-2 bg-white transition ${dragOverIndex === index ? "border-[#20bd63] ring-2 ring-[#20bd63]/30" : "border-transparent"} ${draggingIndex === index ? "opacity-60" : ""}`} style={{ touchAction: "none" }}><img src={photo} alt={`Foto ${index + 1} do imóvel`} className="aspect-square w-full object-cover" /><div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-[#102c3d]/85 p-1.5 text-white"><span className="flex items-center gap-1 text-[11px]"><GripVertical className="h-3.5 w-3.5" /> {index === 0 ? "Capa" : `Foto ${index + 1}`}</span><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" title={index === 0 ? "Foto de capa" : "Definir como capa"} aria-label={index === 0 ? "Foto de capa" : "Definir como capa"} onClick={() => { if (index === 0) return; onChange([photo, ...photos.filter((_, photoIndex) => photoIndex !== index)]); }} className="h-7 w-7 text-white hover:bg-white/20">{index === 0 ? <Star className="h-3.5 w-3.5 fill-[#d7b874] text-[#d7b874]" /> : <Star className="h-3.5 w-3.5" />}</Button><Button type="button" variant="ghost" size="icon" title="Remover foto" aria-label={`Remover foto ${index + 1}`} onClick={() => onChange(photos.filter((_, photoIndex) => photoIndex !== index))} className="h-7 w-7 text-white hover:bg-red-500/70"><Trash2 className="h-3.5 w-3.5" /></Button></div></div></div>)}</div>}
    {photos.length === 0 && <p className="mt-4 text-center text-xs text-slate-500">Nenhuma foto adicionada. A primeira foto da ordem será usada como capa.</p>}
  </div>;
}

export default function ManageProperties() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [importCsv, setImportCsv] = useState("");
  const [uploading, setUploading] = useState(false);
  const catalog = trpc.catalog.list.useQuery({ search }, { staleTime: 10_000 });
  const utils = trpc.useUtils();
  const create = trpc.properties.create.useMutation({ onSuccess: () => { toast.success("Imóvel cadastrado"); setEditing(null); setForm(blankForm); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const update = trpc.properties.update.useMutation({ onSuccess: () => { toast.success("Imóvel atualizado"); setEditing(null); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const archive = trpc.properties.archive.useMutation({ onSuccess: () => { toast.success("Imóvel arquivado"); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const bulkCreate = trpc.properties.bulkCreate.useMutation({ onSuccess: result => { toast.success(`${result.count} imóveis importados`); setImportCsv(""); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadImage = trpc.media.uploadImage.useMutation();
  const properties = (catalog.data || []) as Property[];
  const editingProperty = useMemo(() => editing && editing !== "new" ? properties.find(property => property.id === editing) : undefined, [editing, properties]);

  function openNew() { setEditing("new"); setForm(blankForm); }
  function openEdit(property: Property) { setEditing(property.id); setForm(toForm(property)); }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const crmAddress = [form.crmData.street, form.crmData.number, form.crmData.complement, form.crmData.neighborhood, form.crmData.city, form.crmData.state].filter(Boolean).join(", ");
    const data = { title: form.title, address: form.address || crmAddress, responsibleName: form.responsibleName, responsiblePhone: form.responsiblePhone, details: form.details.split("\n").map(item => item.trim()).filter(Boolean), price: form.price || form.crmData.salePrice || form.crmData.rentPrice, notes: form.notes, photos: form.photos, crmData: form.crmData, status: form.status, publicEnabled: form.publicEnabled };
    if (editing === "new") create.mutate(data); else if (typeof editing === "number") update.mutate({ id: editing, data });
  }
  async function handleUpload(input: { fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif"; base64: string }) { setUploading(true); try { return await uploadImage.mutateAsync(input); } finally { setUploading(false); } }
  const busy = create.isPending || update.isPending || uploading;
  const sampleCsv = "titulo;endereco;preco;detalhes;fotos;status;publico\nApartamento Horizonte 101;Rua Central 100;R$ 850.000;02 dormitórios|80 M²|Box;https://exemplo.com/foto.jpg;available;sim";

  return <div className="min-h-screen bg-[#f7f8fa]">
    <header className="mb-6 rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> MeuLink · gestão</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gerenciar imóveis</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Cadastre, revise e controle o que pode aparecer nos links públicos.</p></div><Button onClick={openNew} className="gap-2 bg-[#d7b874] text-[#102c3d] hover:bg-[#e6cc94]"><Plus className="h-4 w-4" /> Novo imóvel</Button></div></header>
    {editing !== null && <Card className="mb-6 border-0 shadow-sm"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>{editing === "new" ? "Cadastrar imóvel" : `Editar ${editingProperty?.title || "imóvel"}`}</CardTitle><Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Fechar formulário"><X className="h-4 w-4" /></Button></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Título<Input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Apartamento Sofia Palace 1207" /></label>
      <label className="grid gap-2 text-sm font-medium">Preço<Input value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="R$ 950.000,00" /></label>
      <label className="grid gap-2 text-sm font-medium lg:col-span-2">Endereço<Input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="Rua, número, bairro e cidade" /></label>
      <label className="grid gap-2 text-sm font-medium">Responsável interno<Input value={form.responsibleName} onChange={event => setForm({ ...form, responsibleName: event.target.value })} placeholder="Nome do responsável pelo imóvel" /></label>
      <label className="grid gap-2 text-sm font-medium">WhatsApp interno<Input value={form.responsiblePhone} onChange={event => setForm({ ...form, responsiblePhone: event.target.value })} placeholder="Não aparece na landing pública" /></label>
      <label className="grid gap-2 text-sm font-medium">Características <span className="text-xs font-normal text-slate-500">Uma por linha</span><textarea value={form.details} onChange={event => setForm({ ...form, details: event.target.value })} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" placeholder={'03 dormitórios\n101,25 M²\nBox'} /></label>
      <PropertyCrmFields value={form.crmData} onChange={crmData => setForm({ ...form, crmData })} uploadImage={handleUpload} />
      <PhotoGalleryEditor photos={form.photos} onChange={photos => setForm({ ...form, photos })} uploadImage={handleUpload} uploading={uploading} />
      <label className="grid gap-2 text-sm font-medium">Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Status })} className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium">Observações<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Informações internas ou comerciais" /></label>
      <label className="flex items-center gap-3 text-sm font-medium lg:col-span-2"><input type="checkbox" checked={form.publicEnabled} onChange={event => setForm({ ...form, publicEnabled: event.target.checked })} className="h-4 w-4 accent-[#20bd63]" /> Permitir divulgação em links públicos</label>
      <div className="flex flex-wrap justify-end gap-2 lg:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={busy} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar imóvel"}</Button></div>
    </form></CardContent></Card>}
    <Card className="mb-6 border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#102c3d]"><UploadCloud className="h-4 w-4" /> Importar imóveis da tabela</CardTitle><p className="text-xs text-slate-500">Cole CSV separado por ponto e vírgula. Use <strong>detalhes</strong> e <strong>fotos</strong> separados por barra vertical (<code>|</code>).</p></CardHeader><CardContent><textarea value={importCsv} onChange={event => setImportCsv(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" placeholder={sampleCsv} /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Até 200 imóveis por importação. Fotos podem ser URLs públicas ou do storage do MeuLink.</p><Button disabled={bulkCreate.isPending || !importCsv.trim()} onClick={() => { try { bulkCreate.mutate({ rows: parseTable(importCsv) }); } catch (error) { toast.error(error instanceof Error ? error.message : "Tabela inválida"); } }} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><UploadCloud className="h-4 w-4" /> {bulkCreate.isPending ? "Importando..." : "Importar tabela"}</Button></div></CardContent></Card>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis encontrados</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque da empresa</h2></div><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por título, endereço ou preço" className="h-10 bg-white sm:max-w-sm" /></div>
    {catalog.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando imóveis...</div>}{catalog.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{catalog.error.message}</div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{properties.map(property => <Card key={property.id} className="flex flex-col overflow-hidden border-0 shadow-sm"><div className="relative aspect-[16/9] bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d]">{statusLabels[property.status]}</Badge></div><CardHeader className="pb-2"><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-3 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><p className="mb-4 line-clamp-2 text-xs text-slate-500">{property.details.join(" · ") || "Sem características cadastradas"}</p><div className="mt-auto flex gap-2"><Button variant="outline" onClick={() => openEdit(property)} className="flex-1 gap-2"><Edit3 className="h-4 w-4" /> Editar</Button>{property.status !== "hidden" && <Button variant="outline" onClick={() => { if (window.confirm("Arquivar este imóvel e desativar seus links públicos?")) archive.mutate({ id: property.id }); }} className="gap-2 text-red-700 hover:bg-red-50"><Archive className="h-4 w-4" /> Arquivar</Button>}</div>{property.publicEnabled && property.status === "available" && <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3 w-3" /> Disponível para links públicos</p>}</CardContent></Card>)}</div>
    {!catalog.isLoading && properties.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
  </div>;
}
