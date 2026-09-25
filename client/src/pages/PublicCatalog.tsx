import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle2, Download, Link2, LogIn, MapPin, MessageCircle, Share2 } from "lucide-react";
import { useRoute } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

type Property = {
  id: number;
  code: string;
  title: string;
  address: string | null;
  developmentName?: string | null;
  price: string | null;
  propertyType?: string | null;
  unitNumber?: string | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  privateArea?: string | null;
  garageSpaces?: number | null;
  keys?: string | null;
  commission?: string | null;
  mapDriveUrl?: string | null;
  photosDriveUrl?: string | null;
  videosDriveUrl?: string | null;
  photos: string[];
  details: string[];
  responsibleName?: string | null;
  responsiblePhone?: string | null;
};

type Profile = { name: string; phone: string | null; email: string | null; creci: string | null; photoUrl: string | null; bio: string | null };
type Organization = { slug: string; name: string; publicName: string | null; catalogPeriod: string | null; logoUrl: string | null; coverPhotoUrl?: string | null; contactPhone?: string | null };
type ResponsibleGroup = { name: string; profile?: Profile; properties: Property[] };

const profileSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isBedroomSummary = (title: string) => /^\s*\d+\s*(dorm|quarto)/i.test(title.trim());

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "RE";
const digits = (value: string | null | undefined) => (value || "").replace(/\D/g, "");

function OptionalDetails({ property }: { property: Property }) {
  const values = [
    ["Código", property.code],
    property.privateArea && ["Área privativa", property.privateArea],
    property.garageSpaces !== null && property.garageSpaces !== undefined && ["Vagas de garagem", String(property.garageSpaces)],
    property.keys && ["Chaves", property.keys],
    property.commission && ["Comissão", property.commission],
  ].filter(Boolean) as string[][];
  if (!values.length) return null;
  return <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">{values.map(([label, value]) => <div key={label} className={label === "Comissão" ? "col-span-2" : ""}><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span><strong className="line-clamp-2 text-[#102c3d]">{value}</strong></div>)}</div>;
}

export default function PublicCatalog() {
  const [, baseParams] = useRoute("/tabela/:slug");
  const [, pluralBaseParams] = useRoute("/tabelas/:slug");
  const [, params] = useRoute("/tabela/:slug/:responsible");
  const [, pluralParams] = useRoute("/tabelas/:slug/:responsible");
  const [, allParams] = useRoute("/tabela/:slug/compartilhar");
  const [, pluralAllParams] = useRoute("/tabelas/:slug/compartilhar");
  const search = new URLSearchParams(window.location.search);
  const slug = baseParams?.slug || pluralBaseParams?.slug || params?.slug || pluralParams?.slug || allParams?.slug || pluralAllParams?.slug || "";
  const routeResponsible = params?.responsible || pluralParams?.responsible;
  const responsible = routeResponsible && routeResponsible !== "compartilhar" && routeResponsible !== "todos" ? routeResponsible : (search.get("responsavel") || undefined);
  const catalog = trpc.portal.publicCatalog.useQuery({ slug, responsible }, { enabled: Boolean(slug), staleTime: 60_000, gcTime: 300_000, refetchOnWindowFocus: false });
  const currentCatalog = catalog.data?.organization.slug === slug ? catalog.data : undefined;
  const [visibleCount, setVisibleCount] = useState(24);

  if (catalog.error) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] p-5 text-sm text-red-700">Esta apresentação não está disponível.</div>;
  if (catalog.isLoading || !currentCatalog) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] text-sm text-slate-500">Preparando sua apresentação...</div>;

  const { organization, profiles, properties } = currentCatalog as { organization: Organization; profiles: Profile[]; properties: Property[] };
  const profile = responsible ? profiles.find(item => profileSlug(item.name) === responsible || item.name === responsible) : undefined;
  const organizationName = organization.publicName || organization.name;
  const catalogPeriod = organization.catalogPeriod || "Setembro de 2026";
  const isMasterplan = slug === "masterplan-business" || organizationName.toLowerCase().includes("masterplan");
  const catalogTitle = isMasterplan ? "Tabela de Imóveis Masterplan" : "Tabela de Imóveis";
  const publicBase = `${window.location.origin}/tabela/${slug}`;
  const primaryPhone = digits(profile?.phone || properties[0]?.responsiblePhone || organization.contactPhone);
  const responsibleForProperty = (property: Property) => profiles.find(item => item.name.trim().toLowerCase() === (property.responsibleName || "").trim().toLowerCase());
  const phoneForProperty = (property: Property) => digits(responsibleForProperty(property)?.phone || property.responsiblePhone || organization.contactPhone);
  const nameForProperty = (property: Property) => responsibleForProperty(property)?.name || property.responsibleName || "responsável";
  const groups = new Map<string, ResponsibleGroup>();
  const visibleProperties = properties.slice(0, visibleCount);
  visibleProperties.forEach(property => {
    const name = property.responsibleName?.trim() || profile?.name || "Responsável não informado";
    const matchingProfile = profiles.find(item => item.name.trim().toLowerCase() === name.toLowerCase()) || (profile?.name === name ? profile : undefined);
    const group = groups.get(name) || { name, profile: matchingProfile, properties: [] };
    group.properties.push(property);
    groups.set(name, group);
  });
  if (profile && !groups.has(profile.name)) groups.set(profile.name, { name: profile.name, profile, properties: [] });

  async function sharePublicLink(url: string) {
    if (navigator.share) {
      try { await navigator.share({ url }); return; } catch (error) { if ((error as DOMException).name === "AbortError") return; }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link público sem seus dados copiado");
  }

  return <div className="min-h-screen bg-[#f5f7f8] text-[#102c3d]">
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className={`relative mb-8 overflow-hidden rounded-2xl border shadow-[0_18px_50px_rgba(16,44,61,0.08)] sm:rounded-[2rem] ${isMasterplan ? "border-black bg-black" : "border-slate-200 bg-white"}`}>
        <div className={`relative flex min-h-56 items-center justify-center overflow-hidden px-3 py-5 sm:min-h-72 sm:px-8 sm:py-8 lg:min-h-80 ${isMasterplan ? "bg-black" : "bg-white"}`}>{organization.coverPhotoUrl ? <img loading="eager" fetchPriority="high" decoding="async" src={organization.coverPhotoUrl} alt={`Capa de ${organizationName}`} className="absolute inset-0 h-full w-full object-cover" /> : null}<div className={`absolute inset-0 ${isMasterplan ? "bg-gradient-to-t from-black/45 via-black/10 to-transparent" : "bg-transparent"}`} />{organization.logoUrl ? <div className={`relative z-10 flex w-full max-w-4xl items-center justify-center ${isMasterplan ? "bg-transparent" : "bg-white px-4 py-3 sm:px-6 sm:py-4"}`}><img loading="eager" fetchPriority="high" decoding="async" src={organization.logoUrl} alt={`Logo ${organizationName}`} className="max-h-40 w-full object-contain sm:max-h-52 lg:max-h-60" /></div> : <Building2 className="relative z-10 h-16 w-16 text-slate-400" />}</div>
      </header>
      <div className="mb-8 flex flex-col items-center gap-4 px-2 text-center sm:mb-10"><div><h1 className="text-2xl font-semibold tracking-tight text-[#102c3d] sm:text-3xl">{catalogTitle}</h1><p className="mt-1 text-sm font-normal text-slate-500 sm:text-base">{catalogPeriod}</p></div>{primaryPhone && !profile && <a href={`https://wa.me/${primaryPhone}?text=${encodeURIComponent("Olá, gostaria de informações sobre os imóveis.")}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> Falar no WhatsApp</a>}</div>
      <section className="space-y-10">
        {Array.from(groups.values()).map(group => {
          const groupPhone = digits(group.profile?.phone || group.properties[0]?.responsiblePhone);
          const profileUrl = `${publicBase}/${profileSlug(group.name)}`;
          return <section key={group.name} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(16,44,61,0.08)]"><div className="flex flex-col gap-4 border-b border-slate-100 bg-[#fffdf8] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div className="flex items-center gap-4"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#102c3d] text-2xl font-bold text-white shadow-md sm:h-28 sm:w-28">{group.profile?.photoUrl ? <img loading="lazy" decoding="async" src={group.profile.photoUrl} alt={group.name} className="h-full w-full object-cover" /> : initials(group.name)}</div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b38b3d]">Responsável</p><h2 className="mt-1 text-2xl font-semibold text-[#102c3d]">{group.name}</h2>{group.profile?.creci && <p className="mt-1 text-sm text-slate-500">{group.profile.creci}</p>}</div></div><div className="flex flex-wrap gap-2">{groupPhone && <a href={`https://wa.me/${groupPhone}?text=${encodeURIComponent(`Olá ${group.name}, gostaria de informações sobre os imóveis.`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> WhatsApp</a>}<button type="button" onClick={() => sharePublicLink(profileUrl)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-[#102c3d] hover:border-[#d7b874]"><Share2 className="h-4 w-4" /> Compartilhar</button></div></div>{group.properties.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">{group.properties.map(property => { const phone = phoneForProperty(property); const unsignedUrl = `${window.location.origin}/imovel/${property.code}`; const signedUrl = responsible ? `${publicBase}/${responsible}?acesso=login` : `${publicBase}?acesso=login`; return <Card key={property.id} className="group flex h-full flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_24px_rgba(16,44,61,0.07)]"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100">{property.photos[0] ? <img loading="lazy" decoding="async" src={property.photos[0]} alt={property.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-sm text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 border-0 bg-white/95 text-[#102c3d]">{property.unitNumber ? `Unidade ${property.unitNumber}` : property.code}</Badge></div><CardHeader className="pb-2"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">{property.developmentName || "Nome do empreendimento não informado"}</div>{property.unitNumber && <p className="mb-1 text-xs font-semibold text-slate-500">Unidade {property.unitNumber}</p>}{!isBedroomSummary(property.title) && <CardTitle className="line-clamp-2 text-base leading-snug text-[#102c3d]">{property.title}</CardTitle>}{(property.bedrooms !== null && property.bedrooms !== undefined) && <p className="mt-1 text-xs font-semibold text-[#8e6d31]">{property.bedrooms} dormitórios{property.suites !== null && property.suites !== undefined ? ` sendo ${String(property.suites).padStart(2, "0")} ${property.suites === 1 ? "suíte" : "suítes"}` : ""}</p>}<p className="mt-1 flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b38b3d]" /><span className="line-clamp-2">{property.address || "Endereço sob consulta"}</span></p></CardHeader><CardContent className="mt-auto"><p className="text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><OptionalDetails property={property} />{phone && <a href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá, gostaria de saber mais informações sobre o imóvel${property.developmentName ? ` empreendimento ${property.developmentName}` : ""}${property.unitNumber ? `, unidade ${property.unitNumber}` : ""}${property.price ? `, valor ${property.price}` : ""}.`)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#bde8cc] bg-[#f0fff5] px-3 py-1.5 text-[10px] font-bold text-[#168044] transition hover:bg-[#dcf9e6]"><MessageCircle className="h-3.5 w-3.5" /> Mais informações</a>}{(property.mapDriveUrl || property.photosDriveUrl || property.videosDriveUrl) && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">{property.mapDriveUrl && <a href={property.mapDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar mapa</a>}{property.photosDriveUrl && <a href={property.photosDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar fotos</a>}{property.videosDriveUrl && <a href={property.videosDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar vídeos</a>}</div>}<div className="mt-5 grid gap-2"><a href={signedUrl} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#102c3d] px-3 py-2 text-center text-xs font-bold text-white hover:bg-[#173e53]"><LogIn className="h-4 w-4" /> Entrar e compartilhar com seus dados</a><button type="button" onClick={() => sharePublicLink(unsignedUrl)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-[#102c3d] hover:border-[#d7b874]"><Share2 className="h-4 w-4" /> Compartilhar sem seus dados</button></div></CardContent></Card>; })}</div> : <div className="p-8 text-sm text-slate-500">Nenhum imóvel disponível para este responsável.</div>}</section>;
        })}
        {properties.length > visibleCount && <div className="flex justify-center"><button type="button" onClick={() => setVisibleCount(count => Math.min(properties.length, count + 24))} className="rounded-xl bg-[#102c3d] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#173e53]">Carregar mais imóveis ({properties.length - visibleCount} restantes)</button></div>}
        {groups.size === 0 && <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Nenhum imóvel disponível nesta apresentação.</div>}
      </section>
    </main>
  </div>;
}
