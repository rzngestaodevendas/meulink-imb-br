import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Camera, Copy, Download, ExternalLink, Eye, EyeOff, Link2, LogIn, LogOut, LockKeyhole, Save, Search, ShieldCheck, UserPlus, UserRound, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type PortalProperty = {
  id: number;
  code: string;
  title: string;
  address: string | null;
  developmentName?: string | null;
  propertyType?: string | null;
  unitNumber?: string | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  privateArea?: string | null;
  garageSpaces?: number | null;
  keys?: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  developmentInfo?: string | null;
  notes?: string | null;
  details: string[];
  price: string | null;
  commission?: string | null;
  mapDriveUrl?: string | null;
  photosDriveUrl?: string | null;
  videosDriveUrl?: string | null;
  photos: string[];
  status: string;
};
type PortalOrganization = { id: number; slug: string; name: string; publicName: string | null; logoUrl: string | null; contactName: string | null; contactPhone: string | null; tableType: string; developmentName: string | null; developmentDescription: string | null };
type PortalProfile = { name: string; phone: string | null; creci: string | null; photoUrl: string | null; bio: string | null };

export default function BrokerPortal() {
  const [, params] = useRoute("/tabela/:slug");
  const [, pluralParams] = useRoute("/tabelas/:slug");
  const [, friendlyParams] = useRoute("/:slug");
  const slug = params?.slug || pluralParams?.slug || friendlyParams?.slug || "";
  const { user, loading, isAuthenticated, logout } = useAuth();
  const info = trpc.portal.info.useQuery({ slug }, { enabled: Boolean(slug), staleTime: 60_000 });
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">(() => {
    const access = new URLSearchParams(window.location.search).get("acesso");
    return access === "cadastro" ? "register" : access === "recuperar" ? "forgot" : "login";
  });
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
  const requestedShareId = Number(new URLSearchParams(window.location.search).get("compartilhar") || 0);
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
  const registrationPhotoUpload = trpc.auth.uploadRegistrationPhoto.useMutation({ onError: error => toast.error(error.message) });
  const updateProfile = trpc.auth.updateProfile.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setEditingProfile(false); toast.success("Perfil atualizado"); }, onError: error => toast.error(error.message) });
  const portal = trpc.portal.catalog.useQuery({ slug }, { enabled: Boolean(slug && isAuthenticated), staleTime: 15_000 });
  const currentInfo = info.data?.slug === slug ? info.data : undefined;
  const currentPortal = portal.data?.organization.slug === slug ? portal.data : undefined;
  const createLink = trpc.catalog.createLink.useMutation({
    onSuccess: result => {
      const url = `${window.location.origin}/${result.profileType}/${result.brokerSlug}/imovel/${result.property.code}`;
      setLinks(current => ({ ...current, [result.property.id]: url }));
      toast.success("Landing criada com os seus dados");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => { if (user) { const type = user.profileType === "corretora" ? "corretora" : "corretor"; setProfileName(user.name || ""); setProfileType(type); setProfileTypeEdit(type); setProfileWhatsapp(user.whatsapp || ""); setProfileCreci(user.creci || ""); setProfilePhoto(user.profilePhotoUrl || ""); setBrokerName(user.name || ""); setBrokerPhone(user.whatsapp || ""); } }, [user]);

  function validateAccessCredentials() {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Informe um e-mail válido, por exemplo: nome@exemplo.com.");
      return false;
    }
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return false;
    }
    return true;
  }

  function validateRecoveryEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Informe o e-mail usado no cadastro.");
      return false;
    }
    return true;
  }

  function normalizeBrokerWhatsapp() {
    const digits = whatsapp.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if (digits.length >= 12 && digits.length <= 15) return digits;
    toast.error("Informe um WhatsApp válido com DDD. Você pode usar com ou sem o código 55.");
    return null;
  }

  function pointToRegistrationField(id: string, message: string) {
    toast.error(message);
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
    return false;
  }

  function validateRegistration() {
    if (fullName.trim().length < 5) return pointToRegistrationField("registration-full-name", "Informe seu nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return pointToRegistrationField("registration-email", "Informe um e-mail válido.");
    if (password.length < 8) return pointToRegistrationField("registration-password", "A senha precisa ter pelo menos 8 caracteres.");
    const phoneDigits = whatsapp.replace(/\D/g, "");
    if (![10, 11].includes(phoneDigits.length) && (phoneDigits.length < 12 || phoneDigits.length > 15)) return pointToRegistrationField("registration-whatsapp", "Informe um WhatsApp válido com DDD.");
    if (creci.trim().length < 2) return pointToRegistrationField("registration-creci", "Informe seu número de CRECI.");
    if (!profilePhotoUrl) return pointToRegistrationField("registration-photo", "Inclua uma foto de perfil para concluir o cadastro.");
    return true;
  }

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
  if (!isAuthenticated) return <BrokerAuthCard info={currentInfo} mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} fullName={fullName} setFullName={setFullName} profileType={profileType} setProfileType={setProfileType} creci={creci} setCreci={setCreci} whatsapp={whatsapp} setWhatsapp={setWhatsapp} profilePhotoUrl={profilePhotoUrl} setProfilePhotoUrl={setProfilePhotoUrl} onPhotoUpload={async file => { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); const result = await registrationPhotoUpload.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", data }); setProfilePhotoUrl(result.url); }} onLogin={() => { if (validateAccessCredentials()) login.mutate({ email: email.trim(), password }); }} onRegister={() => { const phone = normalizeBrokerWhatsapp(); if (!currentInfo || !phone || !validateRegistration()) return; register.mutate({ organizationId: currentInfo.id, name: fullName.trim(), email: email.trim(), password, profileType, whatsapp: phone, creci: creci.trim(), profilePhotoUrl }); }} onForgot={() => { if (validateRecoveryEmail()) forgot.mutate({ email: email.trim() }); }} busy={login.isPending || register.isPending || forgot.isPending || registrationPhotoUpload.isPending} />;
  if (portal.error) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5"><Card className="w-full max-w-md border-0 shadow-xl"><CardContent className="p-8 text-center"><p className="font-semibold text-[#102c3d]">Não foi possível abrir esta tabela</p><p className="mt-2 text-sm text-slate-500">{portal.error.message}</p></CardContent></Card></div>;
  if (portal.isLoading || !currentPortal) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] text-sm text-slate-500">Carregando tabela...</div>;

  const organization = currentPortal.organization as PortalOrganization;
  const properties = (currentPortal.properties || []) as PortalProperty[];
  const profiles = (currentPortal.profiles || []) as PortalProfile[];
  const filtered = properties.filter(property => `${property.title} ${property.address || ""} ${property.price || ""} ${property.responsibleName || ""}`.toLowerCase().includes(search.toLowerCase()));
  const groupedByResponsible = Array.from(filtered.reduce((groups, property) => { const key = property.responsibleName?.trim() || "Imóveis sem responsável definido"; const list = groups.get(key) || []; list.push(property); groups.set(key, list); return groups; }, new Map<string, PortalProperty[]>()).entries());

  return <div className="min-h-screen bg-[#f7f8fa]">
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-5 text-[#102c3d] shadow-sm sm:mb-6 sm:rounded-3xl sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 sm:h-28 sm:w-28 place-items-center overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-sm sm:h-28 sm:w-28">{organization?.logoUrl ? <img src={organization.logoUrl} alt="Logo da construtora" className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-slate-400" />}</div><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500"><Building2 className="h-4 w-4" /> {organization?.tableType === "own_development" ? "Empreendimento próprio" : "Imóveis de terceiros"}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{organization?.publicName || organization?.name || "Tabela de imóveis"}</h1><p className="mt-2 max-w-2xl text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Tabela de imóveis</p></div></div><div className="flex flex-wrap items-center justify-end gap-2"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-slate-200 bg-white text-xs font-bold text-[#102c3d]">{user?.profilePhotoUrl ? <img src={user.profilePhotoUrl} alt={`Foto de ${user.name || "meu perfil"}`} className="h-full w-full object-cover" /> : (user?.name || "C").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div className="min-w-0"><p className="max-w-[145px] truncate text-sm font-semibold text-[#102c3d]">{user?.name || "Meu perfil"}</p><button type="button" onClick={() => { setProfileName(user?.name || ""); setProfileTypeEdit(user?.profileType === "corretora" ? "corretora" : "corretor"); setProfileWhatsapp(user?.whatsapp || ""); setProfileCreci(user?.creci || ""); setProfilePhoto(user?.profilePhotoUrl || ""); setEditingProfile(true); }} className="text-[11px] font-semibold text-[#8e6d31] hover:underline">Ver meu perfil</button></div></div><div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 md:flex"><ShieldCheck className="h-4 w-4 text-[#b38b3d]" /> Acesso autenticado</div><Button type="button" variant="outline" onClick={() => void logout()} className="gap-2 border-slate-200 bg-white text-[#102c3d] hover:bg-slate-50 hover:text-[#102c3d]"><LogOut className="h-4 w-4" /> Sair</Button></div>
        </div>
      </header>

      {editingProfile && <Card className="mb-5 border-0 shadow-sm"><CardContent className="p-4"><div className="mt-5 grid gap-4 border-t border-slate-100 pt-5"><div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-700">Nome completo<Input value={profileName} onChange={event => setProfileName(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Tratamento no link<select value={profileTypeEdit} onChange={event => setProfileTypeEdit(event.target.value as "corretor" | "corretora")} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="corretor">Corretor</option><option value="corretora">Corretora</option></select></label><label className="grid gap-2 text-sm font-medium text-slate-700">WhatsApp<Input value={profileWhatsapp} onChange={event => setProfileWhatsapp(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5551999999999" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">CRECI<Input value={profileCreci} onChange={event => setProfileCreci(event.target.value)} placeholder="CRECI 00000-F" /></label></div><label className="grid gap-2 text-sm font-medium text-slate-700">Alterar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); const result = await profileUpload.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", data }); setProfilePhoto(result.url); }} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#102c3d] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" /></label><div className="flex justify-end"><Button onClick={() => updateProfile.mutate({ name: profileName.trim(), profileType: profileTypeEdit, whatsapp: profileWhatsapp.replace(/\D/g, ""), creci: profileCreci.trim(), profilePhotoUrl: profilePhoto })} disabled={updateProfile.isPending || profileUpload.isPending} className="gap-2 bg-[#102c3d] hover:bg-[#173e53]"><Save className="h-4 w-4" /> {updateProfile.isPending ? "Salvando..." : "Salvar meu perfil"}</Button></div></div></CardContent></Card>}

      {organization?.developmentDescription && <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-semibold text-[#102c3d]">Sobre o empreendimento</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{organization.developmentDescription}</p></section>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate-500">{properties.length} imóveis disponíveis</p><h2 className="text-xl font-semibold text-[#102c3d]">Imóveis disponíveis</h2></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar imóvel ou valor" className="h-10 bg-white pl-9" /></div></div>
      {requestedShareId > 0 && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#d7b874]/50 bg-[#fffaf0] p-4 text-sm text-[#102c3d]"><Link2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b38b3d]" /><div><p className="font-bold">Você escolheu compartilhar um imóvel com sua assinatura</p><p className="mt-1 text-slate-600">Depois de entrar, localize o imóvel indicado e clique em <strong>Gerar landing com meus dados</strong>. O link terá seu nome, foto, CRECI e WhatsApp.</p></div></div>}
      {portal.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando tabela...</div>}
      {groupedByResponsible.map(([responsibleName, responsibleProperties]) => { const profile = profiles.find(item => item.name.trim().toLowerCase() === responsibleName.trim().toLowerCase()); const responsiblePhone = (profile?.phone || responsibleProperties[0]?.responsiblePhone || "").replace(/\D/g, ""); const responsibleWhatsApp = responsiblePhone ? `https://wa.me/${responsiblePhone}?text=${encodeURIComponent(`Olá, gostaria de informações sobre os imóveis exclusivos de ${responsibleName}.`)}` : ""; return <section key={responsibleName} className="mb-10"><div className="mb-4 flex flex-col gap-4 rounded-2xl border border-[#eadfc8] bg-[#fdfaf4] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#d7b874] bg-[#102c3d] text-sm font-bold text-white">{profile?.photoUrl ? <img src={profile.photoUrl} alt={`Foto de ${responsibleName}`} className="h-full w-full object-cover" /> : responsibleName.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div><h3 className="text-xl font-bold uppercase tracking-[0.08em] text-[#102c3d]">{responsibleName}</h3><p className="mt-1 text-sm text-slate-500">{profile?.creci ? `${profile.creci} · ` : ""}{responsibleProperties.length} {responsibleProperties.length === 1 ? "imóvel disponível" : "imóveis disponíveis"}</p></div></div>{responsibleWhatsApp ? <a href={responsibleWhatsApp} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#20bd63] px-4 text-sm font-bold text-white hover:bg-[#12934a]"><MessageCircle className="h-4 w-4" /> Mais informações {responsibleName.split(" ")[0]}</a> : <span className="text-xs text-slate-400">WhatsApp não informado</span>}</div><div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">{responsibleProperties.map(property => { const url = links[property.id]; const responsiblePhone = (profile?.phone || property.responsiblePhone || "").replace(/\D/g, ""); const responsibleWhatsApp = responsiblePhone ? `https://wa.me/${responsiblePhone}?text=${encodeURIComponent(`Olá, preciso de informações sobre o imóvel ${property.code} - ${property.title}.`)}` : ""; return <Card key={property.id} className="flex h-full flex-col overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">{property.photos[0] ? <img src={property.photos[0]} alt={`Foto de ${property.title}`} className="block h-full w-full object-cover object-center" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-400">Sem foto</div>}<Badge className="absolute left-3 top-3 bg-white/90 text-[#102c3d] hover:bg-white">Disponível</Badge></div><CardHeader className="pb-2"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b38b3d]">{property.code}</span></div><CardTitle className="line-clamp-2 text-base text-[#102c3d]">{property.title}</CardTitle>{property.developmentName && <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#b38b3d]">{property.developmentName}</p>}<p className="line-clamp-2 text-xs text-slate-500">{property.address || "Endereço sob consulta"}</p></CardHeader><CardContent className="flex flex-1 flex-col"><p className="mb-4 text-lg font-bold text-[#102c3d]">{property.price || "Valor sob consulta"}</p><div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">{property.propertyType && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tipo</span><strong className="text-[#102c3d]">{property.propertyType}</strong></div>}{property.bedrooms !== null && property.bedrooms !== undefined && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dormitórios</span><strong className="text-[#102c3d]">{property.bedrooms}</strong></div>}{property.suites !== null && property.suites !== undefined && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suítes</span><strong className="text-[#102c3d]">{property.suites}</strong></div>}{property.bathrooms !== null && property.bathrooms !== undefined && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Banheiros</span><strong className="text-[#102c3d]">{property.bathrooms}</strong></div>}{property.unitNumber && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Unidade</span><strong className="text-[#102c3d]">{property.unitNumber}</strong></div>}{property.privateArea && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Área privativa</span><strong className="text-[#102c3d]">{property.privateArea}</strong></div>}{property.garageSpaces !== null && property.garageSpaces !== undefined && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vagas</span><strong className="text-[#102c3d]">{property.garageSpaces}</strong></div>}{property.keys && <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Chaves</span><strong className="line-clamp-2 text-[#102c3d]">{property.keys}</strong></div>}{property.commission && <div className="col-span-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Comissão</span><strong className="text-[#102c3d]">{property.commission}</strong></div>}</div>{(property.mapDriveUrl || property.photosDriveUrl || property.videosDriveUrl) && <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{property.mapDriveUrl && <a href={property.mapDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar mapa</a>}{property.photosDriveUrl && <a href={property.photosDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar fotos</a>}{property.videosDriveUrl && <a href={property.videosDriveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#eadfc8] bg-[#fdfaf4] px-2 py-2 text-center text-[11px] font-bold text-[#8e6d31] transition hover:border-[#d7b874] hover:bg-[#fffaf0]"><Download className="h-3.5 w-3.5" /> Baixar vídeos</a>}</div>}{responsibleWhatsApp && <a href={responsibleWhatsApp} target="_blank" rel="noreferrer" className="mb-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#20bd63] px-3 text-xs font-bold text-white hover:bg-[#12934a]"><MessageCircle className="h-4 w-4" /> Mais informações</a>}<div className="mt-auto grid gap-2 sm:grid-cols-2"><a href={`/imovel/${property.code}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-[#102c3d] transition hover:border-[#d7b874] hover:bg-[#fdfaf4]"><Eye className="h-4 w-4" /> Pré-visualizar</a><Button onClick={() => generate(property.id)} disabled={createLink.isPending} className="h-10 gap-2 bg-[#102c3d] text-xs font-bold hover:bg-[#173e53]"><Link2 className="h-4 w-4" /> Compartilhar</Button></div>{url && <div className="mt-3 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-[11px] text-emerald-900">{url}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(url)} className="h-8 flex-1 gap-1 text-xs"><Copy className="h-3 w-3" /> Copiar</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[#102c3d] text-xs font-semibold text-white"><ExternalLink className="h-3 w-3" /> Abrir</a></div></div>}</CardContent></Card>; })}</div></section>; })}
      {!portal.isLoading && filtered.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum imóvel encontrado.</div>}
    </main>
  </div>;
}


type BrokerAuthCardProps = {
  info?: { id: number; name: string; publicName: string | null; logoUrl: string | null; tableType: string; developmentName: string | null; profiles?: PortalProfile[] };
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
  const title = mode === "register" ? "Criar meu acesso" : mode === "forgot" ? "Recuperar acesso" : "Entrar na tabela";
  return <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-[#f8fafb] to-[#edf2f3] p-0 sm:p-5 lg:p-8"><div className="mx-auto grid min-h-screen max-w-7xl overflow-hidden rounded-none bg-white shadow-[0_24px_80px_rgba(16,44,61,0.16)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[2rem] lg:grid-cols-[1fr_1fr]">
    <div className="relative hidden overflow-hidden bg-[#102c3d] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="mb-10 grid h-36 w-36 place-items-center overflow-hidden rounded-[2rem] bg-white p-4 shadow-2xl ring-8 ring-[#d7b874]/20">{info?.logoUrl ? <img src={info.logoUrl} alt={`Logo ${info.name}`} className="h-full w-full object-contain" /> : <Building2 className="h-12 w-12 text-[#102c3d]" />}</div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7b874]">Acesso profissional</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">{info?.publicName || info?.name || "Tabela de imóveis"}</h1><p className="mt-4 text-2xl font-semibold leading-tight text-white">Compartilhe com seus clientes.</p><p className="mt-5 max-w-md text-base leading-7 text-white/70">Acesse a tabela, escolha um imóvel e gere uma página personalizada com seu nome, foto, CRECI e WhatsApp.</p><div className="mt-10 flex items-center gap-3 text-sm text-white/80"><ShieldCheck className="h-5 w-5 text-[#d7b874]" /> Seus dados aparecem apenas nas landings compartilhadas</div></div>
    <Card className="min-h-screen rounded-none border-0 bg-white shadow-none sm:min-h-0"><CardHeader className="min-w-0 space-y-7 overflow-hidden px-5 pt-8 sm:px-10 sm:pt-10 lg:px-14 lg:pt-14"><div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"><div className="grid h-32 w-32 place-items-center overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-3 shadow-[0_16px_36px_rgba(16,44,61,0.18)] ring-4 ring-[#d7b874]/25 sm:h-36 sm:w-36">{info?.logoUrl ? <img src={info.logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <Building2 className="h-6 w-6 text-[#d7b874]" />}</div><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#b38b3d]">{info?.publicName || info?.name || "MeuLink"}</p><p className="mt-1 text-xs text-slate-500">{info?.developmentName || "Acesso à tabela"}</p></div></div><div><CardTitle className="break-words text-3xl font-semibold tracking-tight text-[#102c3d]">{title}</CardTitle><p className="mt-2 text-sm leading-relaxed text-slate-500">{mode === "register" ? "Informe seus dados completos. Eles serão usados para assinar as landings compartilhadas." : mode === "forgot" ? "Digite seu e-mail. O responsável pela tabela poderá orientar a recuperação do acesso." : "Faça seu cadastro para compartilhar nossos imóveis através de landing pages com o seu perfil profissional."}</p></div></CardHeader><CardContent>
      {mode === "register" && <div className="mb-4 grid gap-4"><label className="grid gap-2 text-sm font-medium">Nome completo<Input id="registration-full-name" required value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Nome e sobrenome" /></label><label className="grid gap-2 text-sm font-medium">Tipo de perfil profissional<select value={profileType} onChange={event => setProfileType(event.target.value as "corretor" | "corretora")} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="corretor">Corretor</option><option value="corretora">Corretora</option></select></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">WhatsApp <span className="text-xs font-normal text-slate-500">Com ou sem o código 55</span><Input id="registration-whatsapp" required value={whatsapp} onChange={event => setWhatsapp(event.target.value.replace(/\D/g, ""))} placeholder="(51) 99999-9999" inputMode="numeric" /></label><label className="grid gap-2 text-sm font-medium">Número CRECI<Input id="registration-creci" required value={creci} onChange={event => setCreci(event.target.value)} placeholder="CRECI 00000-F" /></label></div><label className="grid gap-2 text-sm font-medium">Foto de perfil <span className="text-xs font-normal text-slate-500">JPG, PNG ou WEBP</span><input id="registration-photo" required type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (file) await onPhotoUpload(file); }} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#102c3d] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />{profilePhotoUrl && <span className="text-xs text-emerald-700">Foto carregada com sucesso.</span>}</label></div>}
      {mode !== "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">E-mail<Input id={mode === "register" ? "registration-email" : undefined} required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="corretor@email.com" /></label>}
      {mode !== "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">Senha<div className="relative"><Input id={mode === "register" ? "registration-password" : undefined} type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" minLength={8} required className="pr-11" /> <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>}
      {mode === "forgot" && <label className="mb-4 grid gap-2 text-sm font-medium">E-mail cadastrado<Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="corretor@email.com" /></label>}
      <Button onClick={mode === "register" ? onRegister : mode === "forgot" ? onForgot : onLogin} disabled={busy} className="h-11 w-full gap-2 bg-[#102c3d] hover:bg-[#173e53]">{mode === "register" ? <UserPlus className="h-4 w-4" /> : mode === "forgot" ? <LockKeyhole className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{busy ? "Aguarde..." : mode === "register" ? "Criar conta e entrar" : mode === "forgot" ? "Solicitar recuperação" : "Entrar e ver imóveis"}</Button>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-[#102c3d]">{mode !== "login" && <button type="button" onClick={() => setMode("login")} className="hover:underline">Já tenho cadastro</button>}{mode !== "register" && <button type="button" onClick={() => setMode("register")} className="hover:underline">Criar conta</button>}{mode !== "forgot" && <button type="button" onClick={() => setMode("forgot")} className="text-slate-500 hover:underline">Esqueci minha senha</button>}</div>
    </CardContent></Card>
  </div></div>;
}
