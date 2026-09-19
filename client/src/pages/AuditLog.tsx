import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ShieldCheck } from "lucide-react";

type AuditItem = { id: number; action: string; entityType: string; entityId: number | null; metadata: string | null; createdAt: Date; actorName: string | null; actorEmail: string | null };
const actionLabels: Record<string, string> = { "organization.created": "Construtora cadastrada", "organization.selected": "Construtora selecionada", "property.created": "Imóvel cadastrado", "property.bulk_created": "Imóveis importados", "property.updated": "Imóvel atualizado", "property.archived": "Imóvel arquivado", "share_link.created": "Link público criado", "team.invite_created": "Convite criado", "team.invite_revoked": "Convite revogado", "team.invite_accepted": "Convite aceito", "team.role_updated": "Permissão alterada", "team.member_removed": "Membro removido" };
const entityLabels: Record<string, string> = { organization: "Construtora", property: "Imóvel", share_link: "Link", invite: "Convite", member: "Membro" };

function detail(item: AuditItem) {
  if (!item.metadata) return "";
  try {
    const data = JSON.parse(item.metadata) as Record<string, unknown>;
    if (typeof data.title === "string") return data.title;
    if (typeof data.email === "string") return data.email;
    if (typeof data.brokerName === "string") return `Corretor: ${data.brokerName}`;
    if (typeof data.from === "string" && typeof data.to === "string") return `${data.from} → ${data.to}`;
    return "Dados da ação registrados";
  } catch { return "Dados da ação registrados"; }
}

export default function AuditLog() {
  const audit = trpc.audit.list.useQuery();
  const items = (audit.data || []) as AuditItem[];
  return <div className="min-h-screen bg-[#f7f8fa]"><header className="mb-6 rounded-3xl bg-[#102c3d] px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><ShieldCheck className="h-5 w-5 text-[#d7b874]" /></div><div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b874]">MeuLink · segurança</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Histórico de ações</h1><p className="mt-2 text-sm text-white/70">Rastreabilidade das alterações feitas na organização.</p></div></div></header><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#102c3d]"><ClipboardList className="h-4 w-4" /> Eventos administrativos</CardTitle><p className="text-xs text-slate-500">Somente administradores podem consultar estes registros. Os dados são ordenados do mais recente para o mais antigo.</p></CardHeader><CardContent>{audit.isLoading && <div className="p-8 text-center text-sm text-slate-500">Carregando histórico...</div>}{audit.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{audit.error.message}</div>}{!audit.isLoading && !audit.error && items.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Ainda não há ações registradas.</div>}<div className="divide-y">{items.map(item => <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#20bd63]" /><div><p className="text-sm font-semibold text-[#102c3d]">{actionLabels[item.action] || item.action}</p><p className="text-xs text-slate-500">{item.actorName || item.actorEmail || "Usuário"}{detail(item) ? ` · ${detail(item)}` : ""}</p></div></div><div className="flex items-center gap-2 text-xs text-slate-500"><Badge variant="outline">{entityLabels[item.entityType] || item.entityType}{item.entityId ? ` #${item.entityId}` : ""}</Badge><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></div></div>)}</div></CardContent></Card></div>;
}
