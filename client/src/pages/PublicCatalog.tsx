import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle2, Copy, ExternalLink, Link2, LogIn, MapPin, MessageCircle, Sparkles } from "lucide-react";
import { useRoute } from "wouter";
import { toast } from "sonner";

type Property = { id: number; code: string; title: string; address: string | null; price: string | null; photos: string[]; details: string[]; responsibleName?: string | null; responsiblePhone?: string | null };
type Profile = { name: string; phone: string | null; email: string | null; creci: string | null; photoUrl: string | null; bio: string | null };
type Organization = { slug: string; name: string; publicName: string | null; logoUrl: string | null };

const profileSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const initials = (name: string) => name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();

export default function PublicCatalog() {
  const [, params] = useRoute("/tabela/:slug/:responsible");
  const [, allParams] = useRoute("/tabela/:slug/compartilhar");
  const search = new URLSearchParams(window.location.search);
  const slug = params?.slug || allParams?.slug || "";
  const responsible = params?.responsible && params.responsible !== "compartilhar" && params.responsible !== "todos" ? params.responsible : (search.get("responsavel") || undefined);
  const catalog = trpc.portal.publicCatalog.useQuery({ slug, responsible }, { enabled: Boolean(slug) });
  const currentCatalog = catalog.data?.organization.slug === slug ? catalog.data : undefined;

  if (catalog.error) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] p-5 text-sm text-red-700">Esta apresentação não está disponível.</div>;
  if (catalog.isLoading || !currentCatalog) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] text-sm text-slate-500">Preparando sua apresentação...</div>;

  const { organization, profiles, properties } = currentCatalog as { organization: Organization; profiles: Profile[]; properties: Property[] };
  const profile = responsible ? profiles.find(item => profileSlug(item.name) === responsible || item.name === responsible) : undefined;
  const visibleProfiles = profile ? [profile] : profiles;
  const primaryPhone = (profile?.phone || properties[0]?.responsiblePhone || "").replace(/\D/g, "");
  const organizationName = organization.publicName || organization.name;
  const publicBase = `${window.location.origin}/tabela/${slug}`;
  const unsignedPropertyUrl = (code: string) => `${window.location.origin}/imovel/${code}`;
  const signedPortalUrl = (id: number) => `${publicBase}?compartilhar=${id}`;
  async function copyPublicLink(url: string) { await navigator.clipboard.writeText(url); toast.success("Link público sem assinatura copiado"); }

  return <div className="min-h-screen bg-[#f5f7f8] text-[#102c3d]">
    <div className="h-1.5 bg-gradient-to-r from-[#102c3d] via-[#d7b874] to-[#20bd63]" />
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="relative mb-8 overflow-hidden rounded-2xl bg-[#102c3d] px-4 py-5 text-white sm:rounded-[2rem] sm:px-10 sm:py-10 shadow-[0_24px_70px_rgba(16,44,61,0.22)] sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-[#d7b874]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[#20bd63]/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid h-20 w-20 shrink-0 sm:h-36 sm:w-36 place-items-center overflow-hidden rounded-[1.6rem] border border-white/60 bg-white p-3 shadow-[0_14px_35px_rgba(0,0,0,0.2)] sm:rounded-[1.9rem] sm:p-4">
              {organization.logoUrl ? <img src={organization.logoUrl} alt={`Logo ${organizationName}`} className="h-full w-full object-contain" /> : <Building2 className="h-12 w-12 text-[#102c3d]" />}
            </div>
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d7b874]/35 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f0d99e]"><Sparkles className="h-3.5 w-3.5" /> Catálogo exclusivo</div>
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{organizationName}</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">Encontre seu próximo imóvel com atendimento especializado, informações confiáveis e uma seleção feita para você.</p>
              {profile && <p className="mt-4 text-sm font-semibold text-[#d7b874]">Exclusividades de {profile.name}</p>}
            </div>
          </div>
          {primaryPhone && <a href={`https://wa.me/${primaryPhone}?text=${encodeURIComponent(`Olá, gostaria de informações sobre os imóveis${profile ? ` de ${profile.name}` : ""}.`)}`} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#20bd63] px-5 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-[#12934a]"><MessageCircle className="h-5 w-5" /> Falar no WhatsApp</a>}
        </div>
      </header>

      <section className="mb-9">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#b38b3d]">Atendimento personalizado</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{profile ? "Seu corretor" : "Nossos corretores"}</h2></div><span className="hidden text-sm text-slate-500 sm:block">{visibleProfiles.length} {visibleProfiles.length === 1 ? "perfil disponível" : "perfis disponíveis"}</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProfiles.map(item => { const phone = (item.phone || "").replace(/\D/g, ""); const profileUrl = `${publicBase}/${profileSlug(item.name)}`; return <Card key={item.name} className="group overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(16,44,61,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(16,44,61,0.14)]"><CardContent className="p-5"><div className="flex items-start gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#102c3d] text-xl font-bold text-white shadow-inner">{item.photoUrl ? <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" /> : initials(item.name)}</div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">Corretor responsável</p><h3 className="mt-1 truncate text-lg font-semibold text-[#102c3d]">{item.name}</h3><p className="mt-1 text-xs text-slate-500">{item.creci || "Atendimento especializado"}</p></div></div>{item.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600">{item.bio}</p>}<div className="mt-5 flex flex-wrap gap-2">{phone && <a href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá ${item.name}, gostaria de informações sobre os imóveis.`)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#20bd63] px-3 text-xs font-bold text-white transition hover:bg-[#12934a]"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}<a href={profileUrl} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#102c3d] transition hover:border-[#d7b874] hover:bg-[#fdfaf4]">Ver imóveis</a></div></CardContent></Card>; })}</div>
      </section>

      <section className="mb-8 rounded-3xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#102c3d] text-white"><Link2 className="h-5 w-5" /></div><div><h2 className="text-base font-bold text-[#102c3d]">Como compartilhar estes imóveis</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">O link desta página é público. Para enviar um imóvel com a sua foto, nome, CRECI e WhatsApp, entre no portal da tabela e gere a assinatura. Se preferir, copie o link sem assinatura: ele exibirá somente os dados públicos autorizados do imóvel.</p></div></div>
      </section>

      <section>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#b38b3d]">Seleção disponível</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{profile ? `Imóveis de ${profile.name}` : "Todos os imóveis disponíveis"}</h2></div><div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#102c3d] shadow-sm"><span className="text-[#b38b3d]">{properties.length}</span> imóveis</div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{properties.map(property => <Card key={property.id} className="group flex h-full flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_24px_rgba(16,44,61,0.07)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,44,61,0.13)]"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={property.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-sm text-slate-400">Sem foto</div>}<div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" /><Badge className="absolute left-3 top-3 border-0 bg-white/95 text-[#102c3d] shadow-sm">{property.code}</Badge><span className="absolute bottom-3 left-3 flex items-center gap-1 text-[11px] font-medium text-white"><CheckCircle2 className="h-3.5 w-3.5 text-[#7ee2a4]" /> Disponível</span></div><CardHeader className="pb-2"><CardTitle className="line-clamp-2 text-base leading-snug text-[#102c3d]">{property.title}</CardTitle><p className="mt-1 flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b38b3d]" /> <span className="line-clamp-2">{property.address || "Endereço sob consulta"}</span></p></CardHeader><CardContent className="mt-auto"><p className="text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mt-3 flex flex-wrap gap-1.5">{property.details.slice(0, 4).map(detail => <span key={detail} className="rounded-full bg-[#f1f4f5] px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div><div className="mt-5 grid gap-2"><a href={signedPortalUrl(property.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#102c3d] px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-[#173e53]"><LogIn className="h-4 w-4" /> Entrar e compartilhar com assinatura</a><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => copyPublicLink(unsignedPropertyUrl(property.code))} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-center text-[11px] font-semibold text-[#102c3d] hover:border-[#d7b874]"><Copy className="h-3.5 w-3.5" /> Copiar sem assinatura</button><a href={unsignedPropertyUrl(property.code)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-center text-[11px] font-semibold text-[#102c3d] hover:border-[#d7b874]"><ExternalLink className="h-3.5 w-3.5" /> Abrir público</a></div></div></CardContent></Card>)}</div>
        {properties.length === 0 && <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Nenhum imóvel disponível nesta apresentação.</div>}
      </section>
      <footer className="mt-12 border-t border-slate-200 pt-5 text-center text-xs text-slate-400">Informações sujeitas a alteração. Consulte o corretor responsável para confirmar disponibilidade e condições.</footer>
    </main>
  </div>;
}
