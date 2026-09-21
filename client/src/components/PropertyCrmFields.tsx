import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ImagePlus, MapPinned } from "lucide-react";
import { useState } from "react";

export type PropertyCrmData = {
  propertyType: string;
  purpose: string;
  code: string;
  bedrooms: string;
  suites: string;
  bathrooms: string;
  parkingSpaces: string;
  privateArea: string;
  totalArea: string;
  floor: string;
  yearBuilt: string;
  furnished: boolean;
  financing: boolean;
  tradeIn: boolean;
  salePrice: string;
  rentPrice: string;
  condoFee: string;
  propertyTax: string;
  commission: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  quadraLote: string;
  reference: string;
  latitude: string;
  longitude: string;
  mapUrl: string;
  developmentName: string;
  developmentType: string;
  developmentDescription: string;
  developmentPhotos: string[];
  visibility: {
    address: boolean;
    quadraLote: boolean;
    condoFee: boolean;
    propertyTax: boolean;
    development: boolean;
    map: boolean;
  };
};

export const blankCrm: PropertyCrmData = {
  propertyType: "", purpose: "Venda", code: "", bedrooms: "", suites: "", bathrooms: "", parkingSpaces: "", privateArea: "", totalArea: "", floor: "", yearBuilt: "", furnished: false, financing: false, tradeIn: false, salePrice: "", rentPrice: "", condoFee: "", propertyTax: "", commission: "", zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", quadraLote: "", reference: "", latitude: "", longitude: "", mapUrl: "", developmentName: "", developmentType: "", developmentDescription: "", developmentPhotos: [], visibility: { address: false, quadraLote: false, condoFee: false, propertyTax: false, development: false, map: false },
};

export function normalizeCrm(value?: Partial<PropertyCrmData> | null): PropertyCrmData {
  return { ...blankCrm, ...value, visibility: { ...blankCrm.visibility, ...(value?.visibility || {}) }, developmentPhotos: value?.developmentPhotos || [] };
}

type UploadInput = { fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif"; base64: string };
type Props = { value: PropertyCrmData; onChange: (value: PropertyCrmData) => void; uploadImage?: (input: UploadInput) => Promise<{ url: string }> };

export function PropertyCrmFields({ value, onChange, uploadImage }: Props) {
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof PropertyCrmData>(key: K, next: PropertyCrmData[K]) => onChange({ ...value, [key]: next });
  const setVisibility = (key: keyof PropertyCrmData["visibility"]) => onChange({ ...value, visibility: { ...value.visibility, [key]: !value.visibility[key] } });
  const field = (label: string, key: keyof PropertyCrmData, placeholder = "") => <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span><Input value={String(value[key] ?? "")} onChange={event => set(key, event.target.value as never)} placeholder={placeholder} /></label>;
  const toggle = (label: string, key: "furnished" | "financing" | "tradeIn") => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value[key]} onChange={event => set(key, event.target.checked)} className="h-4 w-4 accent-[#20bd63]" /> {label}</label>;
  const visibility = (key: keyof PropertyCrmData["visibility"], label: string) => <button type="button" onClick={() => setVisibility(key)} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${value.visibility[key] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"}`}><span className="flex items-center gap-2">{value.visibility[key] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{label}</span><Badge variant="outline" className="text-[10px]">{value.visibility[key] ? "Visível" : "Oculto"}</Badge></button>;
  async function handleDevelopmentFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.currentTarget.value = "";
    if (!uploadImage || !files.length) return;
    if (value.developmentPhotos.length + files.length > 20) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024 || !file.type.startsWith("image/")) continue;
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        const result = await uploadImage({ fileName: `empreendimento-${file.name}`, contentType: file.type as UploadInput["contentType"], base64 }); urls.push(result.url);
      }
      onChange({ ...value, developmentPhotos: [...value.developmentPhotos, ...urls] });
    } finally { setUploading(false); }
  }

  return <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2 sm:p-5">
    <div><h3 className="text-base font-semibold text-[#102c3d]">Ficha completa do CRM</h3><p className="mt-1 text-xs text-slate-500">O corretor autenticado poderá consultar estes dados. Defina abaixo o que poderá aparecer para o cliente na landing.</p></div>
    <section className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Identificação comercial</p></div>{field("Tipo do imóvel", "propertyType", "Apartamento, casa, terreno...")}<label className="grid gap-1.5 text-sm font-medium"><span>Finalidade</span><select value={value.purpose} onChange={event => set("purpose", event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option>Venda</option><option>Aluguel</option><option>Venda e aluguel</option><option>Temporada</option></select></label>{field("Código interno", "code", "Ex.: ATL-302-2")}</section>
    <section className="grid gap-3 sm:grid-cols-4"><div className="sm:col-span-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Características técnicas</p></div>{field("Dormitórios", "bedrooms", "0")}{field("Suítes", "suites", "0")}{field("Banheiros", "bathrooms", "0")}{field("Vagas", "parkingSpaces", "0")}{field("Área privativa", "privateArea", "m²")}{field("Área total", "totalArea", "m²")}{field("Andar", "floor", "Ex.: 12º")}{field("Ano de construção", "yearBuilt", "2026")}<div className="flex flex-wrap items-center gap-4 sm:col-span-4">{toggle("Mobiliado", "furnished")}{toggle("Aceita financiamento", "financing")}{toggle("Aceita permuta", "tradeIn")}</div></section>
    <section className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Valores e custos</p></div>{field("Valor de venda", "salePrice", "R$ 0,00")}{field("Valor de aluguel", "rentPrice", "R$ 0,00")}{field("Comissão", "commission", "5% ou R$ 0,00")}{field("Condomínio", "condoFee", "R$ 0,00")}{field("IPTU", "propertyTax", "R$ 0,00")}</section>
    <section className="grid gap-3 sm:grid-cols-4"><div className="sm:col-span-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Localização</p></div>{field("CEP", "zipCode", "00000-000")}{field("Rua", "street", "Rua ou avenida")}{field("Número", "number", "0")}{field("Complemento", "complement", "Apto, bloco...")}{field("Bairro", "neighborhood", "Bairro")}{field("Cidade", "city", "Cidade")}{field("Estado", "state", "UF")}{field("Quadra e lote", "quadraLote", "Ex.: Quadra N, lote 14")}{field("Ponto de referência", "reference", "Próximo a...")}</section>
    <section className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3 flex items-center gap-2"><MapPinned className="h-4 w-4 text-[#b38b3d]" /><p className="text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Mapa e localização exata</p></div>{field("Latitude", "latitude", "-29.000000")}{field("Longitude", "longitude", "-50.000000")}{field("Link do Maps", "mapUrl", "https://maps.google.com/...")}<p className="text-xs text-slate-500 sm:col-span-3">Preencha latitude e longitude para mostrar o mapa diretamente na landing. O link do Maps também ficará disponível quando informado.</p></section>
    <section className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Empreendimento ou condomínio</p></div>{field("Nome do empreendimento", "developmentName", "Nome do condomínio")}{field("Tipo", "developmentType", "Horizontal, vertical, loteamento...")}<label className="grid gap-1.5 text-sm font-medium sm:col-span-2"><span>Descrição do empreendimento</span><textarea value={value.developmentDescription} onChange={event => set("developmentDescription", event.target.value)} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Infraestrutura, lazer, segurança, localização e diferenciais..." /></label><label className="grid gap-1.5 text-sm font-medium sm:col-span-2"><span>Fotos do empreendimento</span><textarea value={value.developmentPhotos.join("\n")} onChange={event => set("developmentPhotos", event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Cole URLs, uma por linha" />{uploadImage && <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#168447]"><ImagePlus className="h-4 w-4" />{uploading ? "Enviando..." : "Ou enviar fotos do dispositivo"}<input type="file" multiple accept="image/*" disabled={uploading} onChange={handleDevelopmentFiles} className="sr-only" /></label>}</label></section>
    <section><div className="mb-2 flex items-center gap-2"><Eye className="h-4 w-4 text-[#b38b3d]" /><p className="text-xs font-bold uppercase tracking-wide text-[#b38b3d]">Controle de publicação na landing</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibility("address", "Endereço completo")}{visibility("quadraLote", "Quadra e lote")}{visibility("condoFee", "Valor do condomínio")}{visibility("propertyTax", "Valor do IPTU")}{visibility("development", "Dados do empreendimento")}{visibility("map", "Mapa com localização exata")}</div></section>
  </div>;
}
