import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export function BreachNotificationPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    impact: "",
    remedial_steps: "",
    contact_info: "dpo@company.com",
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["breach-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breach_notifications")
        .select("*")
        .order("triggered_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const triggerBreach = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileErr } = await supabase
        .from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();
      if (profileErr || !profile?.tenant_id) throw new Error("Could not resolve your organization");
      const { error } = await supabase.from("breach_notifications").insert({
        ...form,
        triggered_by: user.id,
        affected_vendor_ids: [],
        tenant_id: profile.tenant_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["breach-notifications"] });
      toast.success("Breach notification recorded");
      setShowForm(false);
      setForm({ title: "", description: "", impact: "", remedial_steps: "", contact_info: "dpo@company.com" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {!showForm ? (
        <Button variant="destructive" onClick={() => setShowForm(true)}>
          <ShieldAlert className="h-4 w-4 mr-2" /> Report Data Breach
        </Button>
      ) : (
        <Card className="border-destructive">
          <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Report Data Breach</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">As per DPDP Act 2023, breach notifications must be in clear, plain language.</p>
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Brief title of the breach" /></div>
            <div><Label>What happened *</Label><Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the breach in plain language" /></div>
            <div><Label>Impact on data principals *</Label><Textarea value={form.impact} onChange={(e) => setForm(p => ({ ...p, impact: e.target.value }))} placeholder="What data was affected and how it may impact vendors" /></div>
            <div><Label>Remedial steps taken *</Label><Textarea value={form.remedial_steps} onChange={(e) => setForm(p => ({ ...p, remedial_steps: e.target.value }))} placeholder="Steps taken to contain and prevent recurrence" /></div>
            <div><Label>Contact for queries *</Label><Input value={form.contact_info} onChange={(e) => setForm(p => ({ ...p, contact_info: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => triggerBreach.mutate()} disabled={!form.title || !form.description || !form.impact || !form.remedial_steps || triggerBreach.isPending}>
                {triggerBreach.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Breach Report"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <h3 className="font-semibold text-sm mt-6">Past Breach Notifications</h3>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !notifications?.length ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> No breach notifications recorded</p>
      ) : (
        notifications.map((n: any) => (
          <Card key={n.id}>
            <CardContent className="p-4 space-y-1">
              <p className="font-semibold text-sm">{n.title}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(n.triggered_at), "dd MMM yyyy HH:mm")}</p>
              <p className="text-sm">{n.description}</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
