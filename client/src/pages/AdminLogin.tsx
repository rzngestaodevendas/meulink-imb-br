import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">MeuLink Gestão</p>
          <CardTitle className="text-2xl text-slate-900">Acessar painel</CardTitle>
          <CardDescription>Entre com seu e-mail e senha para gerenciar construtoras, imóveis e links.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="admin-email">E-mail</Label>
              <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="seu@email.com" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Senha</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required />
            </div>
            <Button type="submit" disabled={login.isPending} className="h-11 w-full">
              {login.isPending ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
