import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Camera, Copy, ExternalLink, Eye, EyeOff, Link2, LogIn, LogOut, LockKeyhole, Save, Search, ShieldCheck, UserPlus, UserRound, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type PortalProperty = {
  id: number;
  code: string;
  title: string;
  address: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  details: string[];
  price: string | null;
  photos: string[];
  status: string;
};
type PortalOrganization = { name: string; publicName: string | null; logoUrl: string | null; contactName: string | null; contactPhone: string | null; tableType: string; developmentName: string | null; developmentDescription: string | null };

export default function BrokerPortal() {
  const [, params] = useRoute("/tabela/:slug");
  const [, friendlyParams] = useRoute("/:slug");
  const slug = params?.slug || friendlyParams?.slug || "";
  const { user, loading, isAuthenticated, logout } = useAuth();
  const info = trpc.portal.info.useQuery({ slug }, { enabled: Boolean(slug), staleTime: 60_000 });
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [creci, setCreci] = useState("");
  const [profileType, setProfileType] = useState<"corretor" | "corretora">("corretor");
  const [whatsapp, setWhatsapp] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [brokerName, setBrokerName] = useState(() => localStorage.getItem("meulink-broker-name") || user?.name || "");
  const [brokerPhone, setBrokerPhone] = useState(() => localStorage.getItem("meulink-broker-phone") || user?.whatsapp || "");
  const [search, setSearch] = useState("");
  const [links, setLinks] = useState<Record<number, string>>({});
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileWhatsapp, setProfileWhatsapp] = useState("");
  const [profileCreci, setProfileCreci] = useState("");
  const [profileTypeEdit, setProfileTypeEdit] = useState<"corretor" | "corretora">("corretor");
  const [profilePhoto, setProfilePhoto] = useState("");
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: () => utils.auth.me.invalidate(), onError: error => toast.error(error.message) });
  const register = trpc.auth.register.useMutation({ onSuccess: () => utils.auth.me.invalidate(), onError: error => toast.error(error.message) });
  const forgot = trpc.auth.forgotPassword.useMutation({ onSuccess: result => toast.success(result.message), onError: error => toast.error(error.message) });
  const profileUpload = trpc.auth.uploadProfilePhoto.useMutation({ onError: error => toast.error(error.message) });
  const updateProfile = trpc.auth.updateProfile.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setEditingProfile(false); toast.success("Perfil atualizado"); }, onError: error => toast.error(error.message) });
  const portal = trpc.portal.catalog.useQuery({ slug }, { enabled: Boolean(slug && isAuthenticated), staleTime: 15_000 });
  const createLink = trpc.catalog.createLink.useMutation({
    onSuccess: result => {
      const url = `${window.location.origin}/${result.profileType}/${result.brokerSlug}/imovel/${result.property.code}?link=${result.token}`;
      setLinks(current => ({ ...current, [result.property.id]: url }));
      toast.success("Landing criada com os seus dados");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => { if (user) { const type = user.profileType === "corretora" ? "corretora" : "corretor"; setProfileName(user.name || ""); setProfileType(type); setProfileTypeEdit(type); setProfileWhatsapp(user.whatsapp || ""); setProfileCreci(user.creci || ""); setProfilePhoto(user.profilePhotoUrl || ""); setBrokerName(user.name || ""); setBrokerPhone(user.whatsapp || ""); } }, [user]);

  function generate(propertyId: number) {
    const phone = brokerPhone.replace(/\D/g, "");
    if (brokerName.trim().length < 3 || phone.length < 12) {
      toast.error("Informe seu nome e WhatsApp com DDI e DDD.");
      return;
    }
    localStorage.setItem("meulink-broker-name", brokerName.trim());
    localStorage.setItem("meulink-broker-phone", phone);
    createLink.mutate({ propertyId, organizationId: portal.data?.organization.id, brokerName: brokerName.trim(), brokerPhone: phone, brokerPhotoUrl: user?.profilePhotoUrl || "" });
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] text-sm text-slate-500">Validando acesso...</div>;
  if (!isAuthenticated) return <BrokerAuthCard info={info.data} mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} fullName={fullName} setFullName={setFullName} profileType={profileType} setProfileType={setProfileType} creci={creci} setCreci={setCreci} whatsapp={whatsapp} setWhatsapp={setWhatsapp} profilePhotoUrl={profilePhotoUrl} setProfilePhotoUrl={setProfilePhotoUrl} onPhotoUpload={async file => { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); const result = await profileUpload.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", data }); setProfilePhotoUrl(result.url); }} onLogin={() => login.mutate({ email, password })} onRegister={() => { const phone = whatsapp.replace(/\D/g, ""); if (!info.data) return; register.mutate({ organizationId: info.data.id, name: fullName, email, password, profileType, whatsapp: phone, creci, profilePhotoUrl }); }} onForgot={() => forgot.mutate({ email })} busy={login.isPending || register.isPending || forgot.isPending} />;
  if (portal.error) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5"><Card className="w-full max-w-md border-0 shadow-xl"><CardContent className="p-8 text-center"><p className="font-semibold text-[#102c3d]">Não foi possível abrir esta tabela</p><p className="mt-2 text-sm text-slate-500">{portal.error.message}</p></CardContent></Card></div>;

  const organization = portal.data?.organization as PortalOrganization | undefined;
  const properties = (portal.data?.properties || []) as PortalProperty[];
  const filtered = properties.filter(property => `${property.title} ${property.address || ""} ${property.price || ""} ${property.responsibleName || ""}`.toLowerCase().includes(search.toLowerCase()));
  const groupedByResponsible = Array.from(filtered.reduce((groups, property) => { const key = property.responsibleName?.trim() || "Imóveis sem responsável definido"; const list = groups.get(key) || []; list.push(property); groups.set(key, list); return groups; }, new Map<string, PortalProperty[]>()).entries());

  return <div className="min-h-screen bg-[#f7f8fa]">
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 overflow-hidden rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">{organization?.logoUrl ? <img src={organization.logoUrl} alt="Logo da construtora" className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-[#102c3d]" />}</div><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><Building2 className="h-4 w-4" /> {organization?.tableType === "own_development" ? "Empreendimento próprio" : "Imóveis de terceiros"}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{organization?.publicName || organization?.name || "Tabela de imóveis"}</h1><p className="mt-2 max-w-2xl text-sm text-white/70">{organization?.developmentName ? `${organization.developmentName} · ` : ""}Consulte o estoque autorizado e compartilhe uma apresentação personalizada com seu cliente.</p></div></div><div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs text-white/80"><ShieldCheck className="h-4 w-4 text-[#d7b874]" /> Acesso autenticado</div><Button type="button" variant="outline" onClick={() => void logout()} className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><LogOut className="h-4 w-4" /> Sair</Button></div>
        </div>
      </header>

      <Card className="mb-6 border-0 shadow-sm"><CardContent className="p-5"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[#d7b874] bg-[#102c3d] text-xl font-bold text-white">{(user?.profilePhotoUrl || profilePhoto) ? <img src={user?.profilePhotoUrl || profilePhoto} alt={`Foto de ${user?.name || "corretor"}`} className="h-full w-full object-cover" /> : (user?.name || "C").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b38b3d]">Seu perfil profissional</p><h2 className="mt-1 text-xl font-semibold text-[#102c3d]">{user?.name || "Corretor"}</h2><p className="text-sm text-slate-500">{user?.email || "E-mail não informado"}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1">WhatsApp: {user?.whatsapp || "Não informado"}</span><span className="rounded-full bg-slate-100 px-3 py-1">CRECI: {user?.creci || "Não informado"}</span></div></div></div><Button variant="outline" onClick={() => { setProfileName(user?.name || ""); setProfileTypeEdit(user?.profileType === "corretora" ? "corretora" : "corretor"); setProfileWhatsapp(user?.whatsapp || ""); setProfileCreci(user?.creci || ""); setProfilePhoto(user?.profilePhotoUrl || ""); setEditingProfile(current => !current); }} className="gap-2"><UserRound className="h-4 w-4" /> {editingProfile ? "Fechar edição" : "Editar meu perfil"}</Button></div>{editingProfile && <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5"><div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-700">Nome completo<Input value={profileName} onChange={event => setProfileName(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Tratamento no link<select value={profileTypeEdit} onChange={event => setProfileTypeEdit(event.target.value as "corretor" | "corretora")} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="corretor">Corretor</option><option value="corretora">Corretora</option></select></label><label className="grid gap-2 text-sm font-medium text-slate-700">WhatsApp<Input value={profileWhatsapp} onChange={event => setProfileWhatsapp(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5551999999999" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">CRECI<Input value={profileCreci} onChange={event => setProfileCreci(event.target.value)} placeholder="CRECI 00000-F" /></label></div><label className="grid gap-2 text-sm font-medium text-slate-700">Alterar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); const result = await profileUpload.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", data }); setProfilePhoto(result.url); }} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#102c3d] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" /></label><div className="flex justify-end"><Button onClick={() => updateProfile.mutate({ name: profileName.trim(), profileType: profileTypeEdit, whatsapp: profileWhatsapp.replace(/\D/g, ""), creci: profileCreci.trim(), profilePhotoUrl: profilePhoto })} disabled={updateProfile.isPending || profileUpload.isPending} className="gap-2 bg-[#102c3d] hover:bg-[#173e53]"><Save className="h-4 w-4" /> {updateProfile.isPending ? "Salvando..." : "Salvar meu perfil"}</Button></div></div>}<div className="mt-5 rounded-xl bg-[#f6f1e7] p-3 text-xs leading-relaxed text-slate-600">{organization?.contactName ? `Responsável pela tabela: ${organization.contactName}${organization.contactPhone ? ` · ${organization.contactPhone}` : ""}. ` : ""}Seus dados aparecem na assinatura das landings que você compartilhar. Os dados internos dos imóveis permanecem protegidos.</div></CardContent></Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis disponíveis</p><h2 className="text-xl font-semibold text-[#102c3d]">Estoque autorizado</h2><a href={`/tabela/${slug}/compartilhar`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-[#b38b3d] hover:underline">Compartilhar página completa dos imóveis</a></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar imóvel ou valor" className="h-10 bg-white pl-9" /></div></div>
      {portal.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando tabela...</div>}
      {groupedByResponsible.map(([responsibleName, responsibleProperties]) => { const responsiblePhone = (responsibleProperties[0]?.responsiblePhone || "").replace(/\D/g, ""); const responsibleWhatsApp = responsiblePhone ? `https://wa.me/${responsiblePhone}?text=${encodeURIComponent(`Olá, gostaria de informações sobre os imóveis exclusivos de ${responsibleName}.`)}` : ""; return <section key={responsibleName} className="mb-10"><div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#eadfc8] bg-[#fdfaf4] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-bold uppercase tracking-[0.08em] text-[#102c3d]">EXCLUSIVIDADES ({responsibleName})</h3><p className="mt-1 text-sm text-slate-500">{responsibleProperties.length} {responsibleProperties.length === 1 ? "imóvel disponível" : "imóveis disponíveis"}</p><a href={`/tabela/${slug}/compartilhar?responsavel=${encodeURIComponent(responsibleName)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-[#b38b3d] hover:underline">Compartilhar somente os imóveis de {responsibleName.split(" ")[0]}</a></div>{responsibleWhatsApp ? <a href={responsibleWhatsApp} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#20bd63] px-4 text-sm font-bold text-white hover:bg-[#12934a]"><MessageCircle className="h-4 w-4" /> WhatsApp de {responsibleName.split(" ")[0]}</a> : <span className="text-xs text-slate-400">WhatsApp não informado</span>}</div><div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">{responsibleProperties.map(property => { const url = links[property.id]; const responsiblePhone = (property.responsiblePhone || "").replace(/\D/g, ""); const responsibleWhatsApp = responsiblePhone ? `https://wa.me/${responsiblePhone}?text=${encodeURIComponent(`Olá, preciso de informações sobre o imóvel ${property.code} - ${property.title}.`)}` : ""; return <Card key={property.id} className="flex h-full min-h-[500px] flex-col overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={`Foto de ${property.title}`} className="block h-full w-full object-cover object-center" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d] hover:bg-white">Disponível</Badge><span className="absolute bottom-3 right-3 rounded-full bg-[#102c3d]/80 px-2.5 py-1 text-[10px] font-semibold text-white">{property.photos.length} {property.photos.length === 1 ? "foto" : "fotos"}</span></div><CardHeader className="min-h-[92px] pb-2"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">{property.code}</span></div><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle><p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-3 min-h-7 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mb-3 min-h-8 flex flex-wrap content-start gap-1.5">{property.details.slice(0, 3).map(detail => <span key={detail} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{detail}</span>)}</div><div className="mb-4 min-h-[78px] rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-slate-700"><p className="font-semibold text-[#102c3d]">Responsável interno</p><p>{property.responsibleName || "Não informado"}</p>{property.responsiblePhone && <p className="text-slate-500">{property.responsiblePhone}</p>}</div><div className="mt-auto grid gap-2"><a href={responsibleWhatsApp || undefined} target="_blank" rel="noreferrer" aria-disabled={!responsibleWhatsApp} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold ${responsibleWhatsApp ? "bg-[#20bd63] text-white hover:bg-[#12934a]" : "pointer-events-none bg-slate-100 text-slate-400"}`}><MessageCircle className="h-4 w-4" /> {responsibleWhatsApp ? "WhatsApp do responsável" : "WhatsApp não informado"}</a><Button onClick={() => generate(property.id)} disabled={createLink.isPending} className="h-10 gap-2 bg-[#102c3d] text-xs font-bold hover:bg-[#173e53]"><Link2 className="h-4 w-4" /> Gerar landing com meus dados</Button>{url && <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-[11px] text-emerald-900">{url}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(url)} className="h-8 flex-1 gap-1 text-xs"><Copy className="h-3 w-3" /> Copiar</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[#102c3d] text-xs font-semibold text-white"><ExternalLink className="h-3 w-3" /> Abrir</a></div></div>}</div></CardContent></Card>; })}</div></section>; })}
      {!portal.isLoading && filtered.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
    </main>
  </div>;
}


type BrokerAuthCardProps = {
  info?: { id: number; name: string; publicName: string | null; logoUrl: string | null; tableType: string; developmentName: string | null };
  mode: "login" | "register" | "forgot";
  setMode: (mode: "login" | "register" | "forgot") => void;
  email: string; setEmail: (value: string) => void;
  password: string; setPassword: (value: string) => void;
  showPassword: boolean; setShowPassword: (value: boolean) => void;
  fullName: string; setFullName: (value: string) => void;
  profileType: "corretor" | "corretora"; setProfileType: (value: "corretor" | "corretora") => void;
  creci: string; setCreci: (value: string) => void;
  whatsapp: string; setWhatsapp: (value: string) => void;
  profilePhotoUrl: string; setProfilePhotoUrl: (value: string) => void;
  onPhotoUpload: (file: File) => Promise<void>;
  onLogin: () => void; onRegister: () => void; onForgot: () => void; busy: boolean;
};

function BrokerAuthCard(props: BrokerAuthCardProps) {
  const { info, mode, setMode, email, setEmail, password, setPassword, showPassword, setShowPassword, fullName, setFullName, profileType, setProfileType, creci, setCreci, whatsapp, setWhatsapp, profilePhotoUrl, setProfilePhotoUrl, onPhotoUpload, onLogin, onRegister, onForgot, busy } = props;
  const title = mode === "register" ? "Criar acesso de corretor" : mode === "forgot" ? "Recuperar acesso" : "Entrar na tabela";
  return <div className="min-h-screen bg-[#eef2f4] p-0 sm:p-6 lg:p-10"><div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_80px_rgba(16,44,61,0.16)] lg:grid-cols-[1fr_1fr]">
    <div className="relative hidden overflow-hidden bg-[#102c3d] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="mb-10 grid h-36 w-36 place-items-center overflow-hidden rounded-[2rem] bg-white p-4 shadow-2xl ring-8 ring-[#d7b874]/20">{info?.logoUrl ? <img src={info.logoUrl} alt={`Logo ${info.name}`} className="h-full w-full object-contain" /> : <Building2 className="h-12 w-12 text-[#102c3d]" />}</div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7b874]">Portal exclusivo</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">{info?.publicName || info?.name || "Tabela de imóveis"}</h1><p className="mt-4 text-2xl font-semibold leading-tight text-white">Acesse e compartilhe os imóveis com sua assinatura.</p><p className="mt-5 max-w-md text-base leading-7 text-white/70">Consulte o estoque disponível, cadastre seus dados profissionais e compartilhe landings com seu nome, foto, CRECI e WhatsApp.</p><div className="mt-10 flex items-center gap-3 text-sm text-white/80"><ShieldCheck className="h-5 w-5 text-[#d7b874]" /> Ambiente profissional para corretores</div></div>
    <Card className="border-0 bg-white shadow-none lg:shadow-none"><CardHeader className="space-y-5 px-2 pt-2 sm:px-4 lg:px-8 lg:pt-8"><div className="flex items-center gap-3"><div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[#102c3d] shadow-lg">{info?.logoUrl ? <img src={info.logoUrl} alt="Logo" className="h-full w-full bg-white object-contain" /> : <Building2 className="h-6 w-6 text-[#d7b874]" />}</div><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#b38b3d]">{info?.publicName || info?.name || "MeuLink"}</p><p className="mt-1 text-xs text-slate-500">{info?.developmentName || "Portal do corretor"}</p></div></div><div><CardTitle className="text-3xl font-semibold tracking-tight text-[#102c3d]">{title}</CardTitle><p className="mt-2 text-sm leading-relaxed text-slate-500">{mode === "register" ? "Informe seus dados completos. Eles serão usados para assinar as landings compartilhadas." : mode === "forgot" ? "Digite seu e-mail. O responsável pela tabela poderá orientar a recuperação do acesso." : "Entre para visualizar somente os imóveis disponíveis desta tabela."}</p></div></CardHeader><CardContent>
      {mode === "register" && <div className="mb-4 grid gap-4"><label className="grid gap-2 text-sm font-medium">Nome completo<Input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Nome e sobrenome" /></label><label className="grid gap-2 text-sm font-medium">Como deseja aparecer no link<select value={profileType} onChange={event => setProfileType(event.target.value as "corretor" | "corretora")} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="corretor">Corretor</option><option value="corretora">Corretora</option></select></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">WhatsApp com DDI<Input value={whatsapp} onChange={event => setWhatsapp(event.target.value.replace(/\D/g, ""))} placeholder="5551999999999" inputMode="numeric" /></label><label className="grid gap-2 text-sm font-medium">Número CRECI<Input value={creci} onChange={event => setCreci(event.target.value)} placeholder="CRECI 00000-F" /></label></div><label className="grid gap-2 text-sm font-medium">Foto de perfil <span className="text-xs font-normal text-slate-500">JPG, PNG ou WEBP</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (file) await onPhotoUpload(file); }} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#102c3d] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />{profilePhotoUrl && <span className="text-xs text-emerald-700">Foto carregada com sucesso.</span>}</label></div>}
      {mode !== "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">E-mail<Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="corretor@email.com" /></label>}
      {mode !== "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">Senha<div className="relative"><Input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" className="pr-11" /> <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>}
      {mode === "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">E-mail cadastrado<Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="corretor@email.com" /></label>}
      <Button onClick={mode === "register" ? onRegister : mode === "forgot" ? onForgot : onLogin} disabled={busy} className="h-11 w-full gap-2 bg-[#102c3d] hover:bg-[#173e53]">{mode === "register" ? <UserPlus className="h-4 w-4" /> : mode === "forgot" ? <LockKeyhole className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{busy ? "Aguarde..." : mode === "register" ? "Criar conta e entrar" : mode === "forgot" ? "Solicitar recuperação" : "Entrar"}</Button>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-[#102c3d]">{mode !== "login" && <button type="button" onClick={() => setMode("login")} className="hover:underline">Já tenho cadastro</button>}{mode !== "register" && <button type="button" onClick={() => setMode("register")} className="hover:underline">Criar conta</button>}{mode !== "forgot" && <button type="button" onClick={() => setMode("forgot")} className="text-slate-500 hover:underline">Esqueci minha senha</button>}</div>
    </CardContent></Card>
  </div></div>;
}
