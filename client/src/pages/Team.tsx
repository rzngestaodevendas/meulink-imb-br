import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Clock3, Copy, Link2, Mail, Save, Search, ShieldCheck, UserRound, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TeamRole = "company_admin" | "broker";
type Member = { memberId: number; userId: number; name: string | null; email: string | null; role: TeamRole; createdAt: Date };
type Invite = { id: number; email: string; role: TeamRole; token: string; expiresAt: Date; createdAt: Date };

const roleLabels: Record<TeamRole, string> = { company_admin: "Administrador", broker: "Corretor" };

export default function Team() {
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("broker");
  const [roles, setRoles] = useState<Record<number, TeamRole>>({});
  const [createdInviteUrl, setCreatedInviteUrl] = useState("");
  const inviteToken = new URLSearchParams(window.location.search).get("invite") || "";
  const team = trpc.team.list.useQuery();
  const invites = trpc.team.listInvites.useQuery();
  const utils = trpc.useUtils();
  const updateRole = trpc.team.updateRole.useMutation({ onSuccess: () => { toast.success("Permissão atualizada"); utils.team.list.invalidate(); }, onError: error => toast.error(error.message) });
  const remove = trpc.team.remove.useMutation({ onSuccess: () => { toast.success("Acesso removido"); utils.team.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createInvite = trpc.team.createInvite.useMutation({ onSuccess: result => { const url = `${window.location.origin}/painelgestao/equipe?invite=${result.token}`; setCreatedInviteUrl(url); setInviteEmail(""); toast.success("Convite criado"); utils.team.listInvites.invalidate(); }, onError: error => toast.error(error.message) });
  const revokeInvite = trpc.team.revokeInvite.useMutation({ onSuccess: () => { toast.success("Convite revogado"); utils.team.listInvites.invalidate(); }, onError: error => toast.error(error.message) });
  const acceptInvite = trpc.team.acceptInvite.useMutation({ onSuccess: () => { toast.success("Convite aceito"); window.location.href = "/painelgestao"; }, onError: error => toast.error(error.message) });
  const members = ((team.data || []) as Member[]).filter(member => `${member.name || ""} ${member.email || ""}`.toLowerCase().includes(search.toLowerCase()));
  const pendingInvites = (invites.data || []) as Invite[];

  async function copy(text: string) { await navigator.clipboard.writeText(text); toast.success("Link copiado"); }
  function submitInvite(event: React.FormEvent) { event.preventDefault(); createInvite.mutate({ email: inviteEmail.trim(), role: inviteRole }); }
  function formatExpiry(date: Date) { return new Date(date).toLocaleDateString("pt-BR"); }

  return <div className="min-h-screen bg-[#f7f8fa]">
    <header className="mb-6 rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]"><ShieldCheck className="h-4 w-4" /> MeuLink · operação segura</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Equipe e permissões</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Controle quem pode acessar o catálogo e quais usuários podem administrar a operação.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs text-white/80">{team.data?.length || 0} membros ativos</div></div></header>

    {inviteToken && <Card className="mb-5 border-emerald-200 bg-emerald-50 shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-950">Você recebeu um convite para o MeuLink</p><p className="text-sm text-emerald-800">Aceite para entrar na organização com a permissão definida pelo administrador.</p></div><Button onClick={() => acceptInvite.mutate({ token: inviteToken })} disabled={acceptInvite.isPending} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Link2 className="h-4 w-4" /> {acceptInvite.isPending ? "Aceitando..." : "Aceitar convite"}</Button></CardContent></Card>}

    <Card className="mb-5 border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#102c3d]"><Mail className="h-4 w-4" /> Convidar novo membro</CardTitle><p className="text-xs text-slate-500">O convite vale por 7 dias e só pode ser aceito pela conta autenticada com o e-mail informado.</p></CardHeader><CardContent><form onSubmit={submitInvite} className="grid gap-3 md:grid-cols-[1fr_180px_auto]"><Input required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="corretor@empresa.com" /><select value={inviteRole} onChange={event => setInviteRole(event.target.value as TeamRole)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="broker">Corretor</option><option value="company_admin">Administrador</option></select><Button type="submit" disabled={createInvite.isPending} className="gap-2 bg-[#20bd63] hover:bg-[#12934a]"><Mail className="h-4 w-4" /> {createInvite.isPending ? "Criando..." : "Criar convite"}</Button></form>{createdInviteUrl && <div className="mt-4 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-950">Envie este link ao convidado:</p><p className="break-all text-xs text-emerald-900">{createdInviteUrl}</p><Button variant="outline" size="sm" onClick={() => copy(createdInviteUrl)} className="w-fit gap-2"><Copy className="h-3 w-3" /> Copiar link</Button></div>}</CardContent></Card>

    <Card className="mb-5 border-0 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#102c3d]">Membros da organização</p><p className="text-xs text-slate-500">Administradores gerenciam imóveis e permissões; corretores acessam o catálogo.</p></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome ou e-mail" className="h-10 bg-white pl-9" /></div></CardContent></Card>

    {pendingInvites.length > 0 && <Card className="mb-5 border-0 shadow-sm"><CardHeader><CardTitle className="text-base text-[#102c3d]">Convites pendentes</CardTitle></CardHeader><CardContent className="grid gap-3">{pendingInvites.map(invite => <div key={invite.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-800">{invite.email}</p><p className="flex items-center gap-1 text-xs text-slate-500"><Badge variant="outline" className="mr-1">{roleLabels[invite.role]}</Badge><Clock3 className="h-3 w-3" /> Expira em {formatExpiry(invite.expiresAt)}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copy(`${window.location.origin}/painelgestao/equipe?invite=${invite.token}`)} className="gap-2"><Copy className="h-3 w-3" /> Copiar</Button><Button variant="outline" size="sm" onClick={() => revokeInvite.mutate({ inviteId: invite.id })} className="text-red-700 hover:bg-red-50">Revogar</Button></div></div>)}</CardContent></Card>}

    {team.isLoading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Carregando equipe...</div>}
    {team.error && !inviteToken && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{team.error.message}</div>}
    <div className="grid gap-4 lg:grid-cols-2">{members.map(member => { const role = roles[member.memberId] || member.role; const changed = role !== member.role; return <Card key={member.memberId} className="border-0 shadow-sm"><CardHeader className="flex flex-row items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f0f3] text-[#102c3d]"><UserRound className="h-5 w-5" /></div><div><CardTitle className="text-base text-[#102c3d]">{member.name || "Usuário sem nome"}</CardTitle><p className="text-xs text-slate-500">{member.email || "E-mail não informado"}</p></div></div><Badge className={member.role === "company_admin" ? "bg-[#f6f1e7] text-[#7b5c18]" : "bg-slate-100 text-slate-600"}>{roleLabels[member.role]}</Badge></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="grid gap-2 text-xs font-semibold text-slate-600">Permissão<select value={role} onChange={event => setRoles(current => ({ ...current, [member.memberId]: event.target.value as TeamRole }))} className="h-10 rounded-md border bg-background px-3 text-sm font-normal text-slate-800"><option value="company_admin">Administrador</option><option value="broker">Corretor</option></select></label><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!changed || updateRole.isPending} onClick={() => updateRole.mutate({ memberId: member.memberId, role })} className="gap-2"><Save className="h-4 w-4" /> Salvar</Button><Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remover o acesso de ${member.name || member.email || "este usuário"}?`)) remove.mutate({ memberId: member.memberId }); }} className="gap-2 text-red-700 hover:bg-red-50"><UserX className="h-4 w-4" /> Remover</Button></div></div></CardContent></Card>; })}</div>
    {!team.isLoading && !team.error && members.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Nenhum membro encontrado.</div>}
  </div>;
}
