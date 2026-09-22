import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle2, Link2, LogIn, MapPin, MessageCircle, Share2, UserPlus } from "lucide-react";
import { useRoute } from "wouter";
import { toast } from "sonner";

type Property = { id: number; code: string; title: string; address: string | null; price: string | null; photos: string[]; details: string[]; responsibleName?: string | null; responsiblePhone?: string | null };
type Profile = { name: string; phone: string | null; email: string | null; creci: string | null; photoUrl: string | null; bio: string | null };
type Organization = { slug: string; name: string; publicName: string | null; catalogPeriod: string | null; logoUrl: string | null; contactPhone?: string | null };

const profileSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const initials = (name: string) => name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();

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
  const catalog = trpc.portal.publicCatalog.useQuery({ slug, responsible }, { enabled: Boolean(slug) });
  const currentCatalog = catalog.data?.organization.slug === slug ? catalog.data : undefined;

  if (catalog.error) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] p-5 text-sm text-red-700">Esta apresentação não está disponível.</div>;
  if (catalog.isLoading || !currentCatalog) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] text-sm text-slate-500">Preparando sua apresentação...</div>;

  const { organization, profiles, properties } = currentCatalog as { organization: Organization; profiles: Profile[]; properties: Property[] };
  const profile = responsible ? profiles.find(item => profileSlug(item.name) === responsible || item.name === responsible) : undefined;
  const visibleProfiles = profile ? [profile] : profiles;
  const primaryPhone = (profile?.phone || properties[0]?.responsiblePhone || organization.contactPhone || "").replace(/\D/g, "");
  const organizationName = organization.publicName || organization.name;
  const catalogPeriod = organization.catalogPeriod || "Setembro de 2026";
  const isMasterplan = slug === "masterplan-business" || organizationName.toLowerCase().includes("masterplan");
  const publicBase = `${window.location.origin}/tabela/${slug}`;
  const unsignedPropertyUrl = (code: string) => `${window.location.origin}/imovel/${code}`;
  const signedPortalUrl = (id: number) => `${publicBase}?compartilhar=${id}`;
  async function sharePublicLink(url: string, title: string) { if (navigator.share) { try { await navigator.share({ title, text: `Confira este imóvel: ${title}`, url }); return; } catch (error) { if ((error as DOMException).name === "AbortError") return; } } await navigator.clipboard.writeText(url); toast.success("Link público sem seus dados copiado"); }

  return <div className="min-h-screen bg-[#f5f7f8] text-[#102c3d]">
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className={`relative mb-8 overflow-hidden rounded-2xl border shadow-[0_18px_50px_rgba(16,44,61,0.08)] sm:rounded-[2rem] ${isMasterplan ? "border-black bg-black" : "border-slate-200 bg-white"}`}>
        <div className={`relative flex min-h-56 items-center justify-center overflow-hidden px-3 py-5 sm:min-h-72 sm:px-8 sm:py-8 lg:min-h-80 ${isMasterplan ? "bg-black" : "bg-white"}`}>
          <div className="relative flex h-full w-full items-center justify-center">
            {organization.logoUrl ? <img src={organization.logoUrl} alt={`Logo ${organizationName}`} className="max-h-56 w-full max-w-5xl object-contain sm:max-h-72 lg:max-h-80" /> : <Building2 className="h-16 w-16 text-slate-400" />}
          </div>
        </div>
      </header>

      <div className="mb-8 flex flex-col items-center gap-4 px-2 text-center sm:mb-10"><div><h1 className="text-2xl font-semibold tracking-tight text-[#102c3d] sm:text-3xl">Tabela de Imóveis</h1><p className="mt-1 text-sm font-normal text-slate-500 sm:text-base">{catalogPeriod}</p></div>{primaryPhone && !profile && <a href={`https://wa.me/${primaryPhone}?text=${encodeURIComponent("Olá, gostaria de informações sobre os imóveis.")}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> Falar no WhatsApp</a>}</div>

      {profile && <section className="mb-8 rounded-3xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#102c3d] text-xl font-bold text-white">{profile.photoUrl ? <img src={profile.photoUrl} alt={profile.name} className="h-full w-full object-cover" /> : initials(profile.name)}</div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b38b3d]">Responsável</p><h2 className="mt-1 text-2xl font-semibold text-[#102c3d]">{profile.name}</h2>{profile.creci && <p className="mt-1 text-sm text-slate-500">{profile.creci}</p>}</div></div>{primaryPhone && <a href={`https://wa.me/${primaryPhone}?text=${encodeURIComponent(`Olá ${profile.name}, gostaria de informações sobre os imóveis.`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> WhatsApp de {profile.name.split(" ")[0]}</a>}</div></section>}

      {!profile && <section className="mb-9">
        <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Responsáveis</h2></div><span className="hidden text-sm text-slate-500 sm:block">{visibleProfiles.length} {visibleProfiles.length === 1 ? "perfil disponível" : "perfis disponíveis"}</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProfiles.map(item => { const phone = (item.phone || properties.find(property => property.responsibleName === item.name)?.responsiblePhone || "").replace(/\D/g, ""); const profileUrl = `${publicBase}/${profileSlug(item.name)}`; return <Card key={item.name} className="group overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(16,44,61,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(16,44,61,0.14)]"><CardContent className="p-5"><div className="flex items-start gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#102c3d] text-xl font-bold text-white shadow-inner">{item.photoUrl ? <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" /> : initials(item.name)}</div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Responsável</p><h3 className="mt-1 truncate text-lg font-semibold text-[#102c3d]">{item.name}</h3>{item.creci && <p className="mt-1 text-xs text-slate-500">{item.creci}</p>}</div></div>{item.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600">{item.bio}</p>}<div className="mt-5 flex flex-wrap gap-2">{phone && <a href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá ${item.name}, gostaria de informações sobre os imóveis.`)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#20bd63] px-3 text-xs font-bold text-white transition hover:bg-[#12934a]"> <MessageCircle className="h-4 w-4" /> WhatsApp</a>}<a href={profileUrl} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#102c3d] transition hover:border-[#d7b874] hover:bg-[#fdfaf4]">Ver imóveis</a></div></CardContent></Card>; })}</div>
      </section>}

      <section className="mb-10 rounded-3xl border border-[#dce8df] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#102c3d] text-white"><Link2 className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b38b3d]">Compartilhe seus imóveis</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#102c3d] sm:text-3xl">Criamos uma landpage com sua assinatura em cada imóvel da nossa tabela!</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Sua marca, seu atendimento. Compartilhe imóveis com seu nome, foto, Creci e WhatsApp.</p><a href={`${publicBase}?acesso=login`} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12934a]"><LogIn className="h-4 w-4" /> Entrar na área do corretor</a></div></div></section>

      <section>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#b38b3d]">Seleção disponível</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{profile ? `Imóveis de ${profile.name}` : "Todos os imóveis disponíveis"}</h2></div><div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#102c3d] shadow-sm"><span className="text-[#b38b3d]">{properties.length}</span> imóveis</div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{properties.map(property => <Card key={property.id} className="group flex h-full flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_24px_rgba(16,44,61,0.07)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,44,61,0.13)]"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={property.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-sm text-slate-400">Sem foto</div>}<div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" /><Badge className="absolute left-3 top-3 border-0 bg-white/95 text-[#102c3d] shadow-sm">{property.code}</Badge><span className="absolute bottom-3 left-3 flex items-center gap-1 text-[11px] font-medium text-white"><CheckCircle2 className="h-3.5 w-3.5 text-[#7ee2a4]" /> Disponível</span></div><CardHeader className="pb-2"><CardTitle className="line-clamp-2 text-base leading-snug text-[#102c3d]">{property.title}</CardTitle><p className="mt-1 flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b38b3d]" /> <span className="line-clamp-2">{property.address || "Endereço sob consulta"}</span></p></CardHeader><CardContent className="mt-auto"><p className="text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mt-3 flex flex-wrap gap-1.5">{property.details.slice(0, 4).map(detail => <span key={detail} className="rounded-full bg-[#f1f4f5] px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div><div className="mt-5 grid gap-2"><a href={signedPortalUrl(property.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#102c3d] px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-[#173e53]"><LogIn className="h-4 w-4" /> Entrar e compartilhar com seus dados</a><button type="button" onClick={() => sharePublicLink(unsignedPropertyUrl(property.code), property.title)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-[#102c3d] hover:border-[#d7b874]"><Share2 className="h-4 w-4" /> Compartilhar sem seus dados</button></div></CardContent></Card>)}</div>
        {properties.length === 0 && <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Nenhum imóvel disponível nesta apresentação.</div>}
      </section>
    </main>
  </div>;
}
