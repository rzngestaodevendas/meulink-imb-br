import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Expand, MapPin, MessageCircle, Share2, X } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";

export default function PublicProperty() {
  const token = new URLSearchParams(window.location.search).get("link") || "";
  const [, codeParams] = useRoute("/imovel/:code");
  const [, brokerParams] = useRoute("/corretor/:brokerSlug/imovel/:code");
  const [, brokerFemaleParams] = useRoute("/corretora/:brokerSlug/imovel/:code");
  const code = codeParams?.code || brokerParams?.code || brokerFemaleParams?.code || "";
  const brokerSlug = brokerParams?.brokerSlug || brokerFemaleParams?.brokerSlug || "";
  const signedFriendlyQuery = trpc.catalog.publicFriendlyLink.useQuery({ code, brokerSlug }, { enabled: !token && Boolean(code && brokerSlug), retry: false });
  const unsignedQuery = trpc.catalog.publicByCode.useQuery({ code }, { enabled: !token && Boolean(code && !brokerSlug), retry: false });
  const propertyQuery = trpc.catalog.publicLink.useQuery({ token }, { enabled: token.length > 0, retry: false });
  const activeQuery = token ? propertyQuery : (brokerSlug ? signedFriendlyQuery : unsignedQuery);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [shareCopied, setShareCopied] = useState(false);

  if (!token && !code) return <EmptyState title="Link de imóvel inválido" text="Solicite um novo link público do imóvel." />;
  if (activeQuery.isLoading) return <div className="grid min-h-screen place-items-center bg-[#f4f6f7] text-sm text-slate-500">Preparando sua visita...</div>;
  if (activeQuery.error || !activeQuery.data) return <EmptyState title="Link de imóvel indisponível" text="O imóvel pode ter sido arquivado ou o link não é mais válido." />;

  const { property, broker } = activeQuery.data;
  const photos = property.photos || [];
  const coverPhoto = property.coverPhoto || photos[0];
  const garageSpaces = property.garageSpaces != null ? String(property.garageSpaces) : "";
  const suites = property.suites != null ? String(property.suites) : "";
  const bathrooms = property.bathrooms != null ? String(property.bathrooms) : "";
  const galleryPhotos = property.propertyPhotos?.length ? property.propertyPhotos : photos.slice(1);
  const developmentPhotos = property.developmentPhotos || [];
  const currentPhoto = galleryPhotos[photoIndex];
  const whatsapp = broker?.phone ? `https://wa.me/${broker.phone}?text=${encodeURIComponent(`Olá ${broker.name.split(/\s+/)[0]}, vi a página do imóvel "${property.title}" (${property.price || "valor sob consulta"}) e gostaria de mais informações e de agendar uma visita.`)}` : "";
  const region = property.address?.match(/Capão da Canoa|Xangri-Lá|Maquiné|Parobé|Osório|Tramandaí|Torres|Carlos Barbosa|Porto Belo/i)?.[0];
  const bedrooms = property.bedrooms != null ? String(property.bedrooms) : `${property.title} ${(property.details || []).join(" ")} ${property.notes || ""}`.match(/(\d+)\s*dorm/i)?.[1];
  const area = property.privateArea || `${property.title} ${(property.details || []).join(" ")} ${property.notes || ""}`.match(/([\d.,]+)\s*m²/i)?.[1];
  const mapLink = property.mapUrl || (property.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}` : "");
  const mapEmbedUrl = property.address ? `https://www.google.com/maps?q=${encodeURIComponent(property.address)}&output=embed` : "";
  async function shareProperty() {
    const shareData = { url: window.location.href };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2200);
  }

  return <main className="min-h-screen bg-[#f4f6f7] text-[#102c3d]">
    <div className="h-1.5 bg-gradient-to-r from-[#102c3d] via-[#d7b874] to-[#20bd63]" />
    <div className="mx-auto max-w-7xl px-4 py-0 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <section className="relative -mx-4 min-h-[390px] overflow-hidden rounded-none bg-[#102c3d] shadow-[0_24px_70px_rgba(16,44,61,0.2)] sm:mx-0 sm:min-h-[520px] sm:rounded-[2rem]">
        {coverPhoto && <img src={coverPhoto} alt={`Capa de ${property.title}`} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06141d]/90 via-[#102c3d]/35 to-[#102c3d]/10" /><button type="button" onClick={() => void shareProperty()} className="absolute right-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-[#102c3d]/75 px-4 text-sm font-bold text-white shadow-lg backdrop-blur transition hover:bg-[#102c3d] sm:right-6 sm:top-6"><Share2 className="h-4 w-4" />{shareCopied ? "Link copiado" : "Compartilhar"}</button>
        <div className="relative z-10 flex min-h-[390px] flex-col justify-end p-5 text-white sm:min-h-[520px] sm:p-10 lg:p-14"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f0d99e]">{property.propertyType || "Imóvel"} disponível</p><h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{property.title}</h1></div>
      </section>

      {(bedrooms || suites || bathrooms || area || garageSpaces) && <section className="relative z-10 mt-5 px-0 sm:px-8"><div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 shadow-xl sm:grid-cols-2 sm:gap-3 sm:p-5 lg:grid-cols-5">{bedrooms && <QuickFact value={bedrooms} label="Dormitórios" />}{suites && <QuickFact value={suites} label="Suítes" />}{bathrooms && <QuickFact value={bathrooms} label="Banheiros" />}{area && <QuickFact value={area.includes("m²") ? area : `${area} m²`} label="Área privativa" />}{garageSpaces && <QuickFact value={garageSpaces} label="Vagas de garagem" />}</div></section>}

      {(property.developmentName || property.address || property.price) && <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-7"><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Empreendimento</p><p className="mt-1 text-lg font-bold text-[#102c3d]">{property.developmentName || "Não informado"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Localização</p><p className="mt-1 flex items-start gap-1 text-sm leading-6 text-slate-600"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[#b38b3d]" />{property.address || "Endereço sob consulta"}</p></div>{property.price && <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Valor de venda</p><p className="mt-1 text-xl font-extrabold text-[#102c3d]">{property.price}</p></div>}</div></section>}

      {galleryPhotos.length > 0 && <section className="mt-7 overflow-hidden rounded-[2rem] bg-white p-2 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-3 px-1"><h2 className="text-base font-semibold text-[#102c3d] sm:text-lg">Galeria de fotos</h2><span className="text-xs font-medium text-slate-500">{photoIndex + 1} de {galleryPhotos.length}</span></div><div className="relative aspect-[4/3] min-h-[340px] w-full overflow-hidden rounded-[1.4rem] bg-[#e8edef] sm:aspect-[16/10] sm:min-h-0"><img src={currentPhoto} alt={`Foto ${photoIndex + 2} de ${property.title}`} className="h-full w-full object-contain" />{galleryPhotos.length > 1 && <><button type="button" aria-label="Foto anterior" onClick={() => setPhotoIndex((photoIndex - 1 + galleryPhotos.length) % galleryPhotos.length)} className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-[#102c3d]/80 text-white shadow-lg"><ChevronLeft className="h-5 w-5" /></button><button type="button" aria-label="Próxima foto" onClick={() => setPhotoIndex((photoIndex + 1) % galleryPhotos.length)} className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-[#102c3d]/80 text-white shadow-lg"><ChevronRight className="h-5 w-5" /></button></>}<button type="button" aria-label="Ampliar foto" onClick={() => { setZoom(1); setLightbox(true); }} className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-bold text-[#102c3d] shadow-lg"><Expand className="h-3.5 w-3.5" /> Ampliar</button></div><div className="mt-3 flex gap-3 overflow-x-auto pb-1">{galleryPhotos.map((photo, index) => <button type="button" key={photo} onClick={() => setPhotoIndex(index)} className={`h-28 w-44 shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-20 sm:w-32 ${index === photoIndex ? "border-[#d7b874] ring-2 ring-[#d7b874]/40" : "border-transparent opacity-65"}`}><img src={photo} alt={`Miniatura ${index + 2}`} className="h-full w-full object-cover" /></button>)}</div></section>}

      {property.notes && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><SectionHeading title="Sobre o imóvel" /><RichText text={property.notes} /></section>}

      {property.price && <section className="mt-7 rounded-3xl border border-[#eadfc8] bg-[#fffaf0] p-5 shadow-sm sm:p-7"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Valor de venda</p><p className="mt-1 text-2xl font-extrabold text-[#102c3d]">{property.price}</p></section>}

      {property.developmentInfo && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><SectionHeading title="Sobre o empreendimento" /><RichText text={property.developmentInfo} /></section>}

      {property.details.length > 0 && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><SectionHeading title="Características" /><div className="grid gap-2 sm:grid-cols-2">{property.details.map((detail, index) => isUppercaseHeading(detail) ? <h3 key={`${detail}-${index}`} className="col-span-full border-b border-slate-100 pb-1 pt-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#102c3d]">{detail}</h3> : <div key={`${detail}-${index}`} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#20bd63]" />{detail}</div>)}</div></section>}



      {developmentPhotos.length > 0 && <section className="mt-7 overflow-hidden rounded-[2rem] bg-white p-2 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-3 px-1"><h2 className="text-base font-semibold text-[#102c3d] sm:text-lg">Fotos do empreendimento</h2><span className="text-xs font-medium text-slate-500">{developmentPhotos.length} fotos</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{developmentPhotos.map((photo, index) => <button type="button" key={photo} onClick={() => window.open(photo, "_blank", "noopener,noreferrer")} className="overflow-hidden rounded-xl bg-[#e8edef]"><img src={photo} alt={`Foto ${index + 1} do empreendimento`} className="aspect-[4/3] h-full w-full object-cover transition hover:scale-105" /></button>)}</div></section>}

      {mapEmbedUrl && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><SectionHeading title="Localização" /><div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={`Mapa de localização de ${property.title}`} src={mapEmbedUrl} className="h-72 w-full sm:h-96" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>{mapLink && <a href={mapLink} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d7b874] bg-white px-5 text-sm font-bold text-[#102c3d] shadow-sm transition hover:bg-[#fdfaf4]"><MapPin className="h-4 w-4 text-[#b38b3d]" /> Abrir localização no mapa</a>}</section>}

      {broker && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><SectionHeading title="Dados do responsável" /><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-[#d7b874] bg-[#102c3d] text-xl font-extrabold text-white">{broker.photoUrl ? <img src={broker.photoUrl} alt={`Foto de ${broker.name}`} className="h-full w-full object-cover" /> : broker.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div><p className="text-lg font-bold text-[#102c3d]">{broker.name}</p><p className="mt-1 text-xs text-slate-500">Atendimento direto pelo WhatsApp</p></div></div>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 text-sm font-extrabold text-white transition hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> WhatsApp</a>}</div><div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs leading-relaxed text-slate-600">Confirme disponibilidade, condições e agende uma visita.</div></section>}
    </div>
    {lightbox && currentPhoto && <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#06141d]/95 p-4 sm:p-8" role="dialog" aria-modal="true" onWheel={event => { event.preventDefault(); setZoom(value => Math.min(3, Math.max(1, value + (event.deltaY < 0 ? 0.25 : -0.25)))); }}><button type="button" aria-label="Fechar galeria" onClick={() => setLightbox(false)} className="absolute right-5 top-5 z-20 rounded-full border border-white/20 bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button><div className="flex min-h-0 flex-1 w-full items-center justify-center overflow-auto py-14"><img src={currentPhoto} alt={`Foto ${photoIndex + 1}`} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center object-contain transition-transform duration-200" /></div><div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-[#102c3d]/90 p-2 text-white shadow-2xl"><button type="button" aria-label="Diminuir zoom" onClick={() => setZoom(value => Math.max(1, value - 0.25))} disabled={zoom <= 1} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-xl font-bold transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">−</button><span className="min-w-16 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Aumentar zoom" onClick={() => setZoom(value => Math.min(3, value + 0.25))} disabled={zoom >= 3} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-xl font-bold transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">+</button><button type="button" aria-label="Redefinir zoom" onClick={() => setZoom(1)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/20">Redefinir</button></div>{galleryPhotos.length > 1 && <div className="absolute bottom-20 flex gap-3 sm:bottom-5 sm:left-5 sm:translate-x-0"><button type="button" aria-label="Foto anterior" onClick={() => { setPhotoIndex((photoIndex - 1 + galleryPhotos.length) % galleryPhotos.length); setZoom(1); }} className="rounded-xl bg-white/10 p-3 text-white"><ChevronLeft /></button><button type="button" aria-label="Próxima foto" onClick={() => { setPhotoIndex((photoIndex + 1) % galleryPhotos.length); setZoom(1); }} className="rounded-xl bg-white/10 p-3 text-white"><ChevronRight /></button></div>}</div>}
  </main>;
}

function isUppercaseHeading(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed === trimmed.toUpperCase() && /[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(trimmed);
}
function RichText({ text }: { text: string }) {
  return <div className="text-sm leading-7 text-slate-600 sm:text-[15px]">{text.split("\n").map((line, index) => line.trim() ? (isUppercaseHeading(line) ? <h3 key={`${line}-${index}`} className="mt-4 border-b border-slate-100 pb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#102c3d] first:mt-0">{line.trim()}</h3> : <p key={`${line}-${index}`} className="whitespace-pre-wrap">{line}</p>) : <div key={`blank-${index}`} className="h-3" aria-hidden="true" />)}</div>;
}
function SectionHeading({ title }: { title: string }) { return <h2 className="mb-5 border-l-4 border-[#d7b874] pl-3 text-xl font-semibold text-[#102c3d]">{title}</h2>; }
function QuickFact({ value, label }: { value: string; label: string }) { return <div className="rounded-xl bg-[#f8fafb] p-3 text-center"><strong className="block truncate text-sm font-bold text-[#102c3d]">{value}</strong><span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <main className="grid min-h-screen place-items-center bg-[#f4f6f7] p-6"><div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-xl"><ArrowLeft className="mx-auto mb-5 h-8 w-8 text-[#c7a15a]" /><h1 className="text-xl font-semibold text-[#102c3d]">{title}</h1><p className="mt-2 text-sm text-slate-500">{text}</p></div></main>; }
