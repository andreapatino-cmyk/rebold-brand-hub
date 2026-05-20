import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Mail, Trash2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Role = "owner" | "admin" | "editor" | "viewer";

export function TeamDialog({
  workspaceId,
  currentUserId,
}: {
  workspaceId: string | null;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["ws-members", workspaceId],
    enabled: !!workspaceId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, user_id, role, created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["ws-invites", workspaceId],
    enabled: !!workspaceId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_invitations")
        .select("id, email, role, status, created_at")
        .eq("workspace_id", workspaceId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const myRole = members.find((m) => m.user_id === currentUserId)?.role as Role | undefined;
  const canInvite = myRole === "owner" || myRole === "admin";

  const invite = async () => {
    if (!workspaceId) return;
    const trimmed = email.trim();
    if (!trimmed) return toast.error("Introduce un email");
    setSending(true);
    const { data, error } = await supabase.rpc("invite_workspace_member", {
      _workspace_id: workspaceId,
      _email: trimmed,
      _role: role,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    const status = (data as any)?.status;
    toast.success(status === "added" ? "Miembro añadido al workspace" : "Invitación enviada");
    setEmail("");
    qc.invalidateQueries({ queryKey: ["ws-members", workspaceId] });
    qc.invalidateQueries({ queryKey: ["ws-invites", workspaceId] });
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("workspace_invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitación revocada");
    qc.invalidateQueries({ queryKey: ["ws-invites", workspaceId] });
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("workspace_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Miembro eliminado");
    qc.invalidateQueries({ queryKey: ["ws-members", workspaceId] });
  };

  const roleBadge = (r: string) => (
    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{r}</Badge>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" /> Equipo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Equipo del workspace</DialogTitle>
        </DialogHeader>

        {canInvite && (
          <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invitar por email</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colega@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={invite} disabled={sending} className="gradient-primary">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Si la persona ya tiene cuenta, se añade al instante. Si no, recibirá acceso cuando se registre con ese email.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Miembros ({members.length})</div>
          <div className="space-y-1.5 max-h-48 overflow-auto pr-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                    {m.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm truncate">
                    {m.user_id === currentUserId ? "Tú" : `Usuario ${m.user_id.slice(0, 8)}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {roleBadge(m.role)}
                  {canInvite && m.user_id !== currentUserId && m.role !== "owner" && (
                    <Button size="icon" variant="ghost" onClick={() => removeMember(m.id)} className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {invites.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Invitaciones pendientes ({invites.length})</div>
            <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-md border border-dashed border-border bg-card/30 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{i.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleBadge(i.role)}
                    {canInvite && (
                      <Button size="icon" variant="ghost" onClick={() => revoke(i.id)} className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
