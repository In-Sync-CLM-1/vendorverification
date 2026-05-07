import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Globe,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Check,
  Activity,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const WEBHOOK_EVENTS = [
  { value: "vendor.submitted", label: "Vendor Submitted" },
  { value: "vendor.reviewed", label: "Vendor Reviewed" },
  { value: "vendor.approved", label: "Vendor Approved" },
  { value: "vendor.rejected", label: "Vendor Rejected" },
  { value: "vendor.returned_to_maker", label: "Vendor Returned to Maker" },
];

function generateSecret(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function WebhooksPanel() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });
  // newSecret is set after creation and shown once in the dialog
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["webhook-endpoints", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("id, name, url, events, is_active, created_at")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
    queryKey: ["webhook-deliveries", expandedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id, event, status, response_status, attempts, created_at, vendor_id, payload")
        .eq("endpoint_id", expandedId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!expandedId,
  });

  const createEndpoint = useMutation({
    mutationFn: async () => {
      const secret = generateSecret();
      const { error } = await supabase.from("webhook_endpoints").insert({
        tenant_id: tenant!.id,
        name: form.name.trim(),
        url: form.url.trim(),
        events: form.events,
        secret,
      });
      if (error) throw error;
      return secret;
    },
    onSuccess: (secret) => {
      queryClient.invalidateQueries({ queryKey: ["webhook-endpoints"] });
      setNewSecret(secret);
      setForm({ name: "", url: "", events: [] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("webhook_endpoints")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-endpoints"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEndpoint = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-endpoints"] });
      toast.success("Endpoint deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryDelivery = async (delivery: any) => {
    if (!tenant?.id || retryingId === delivery.id) return;
    setRetryingId(delivery.id);
    try {
      await supabase.functions.invoke("send-webhook", {
        body: {
          tenant_id: tenant.id,
          event: delivery.event,
          vendor_id: delivery.vendor_id,
          payload: delivery.payload?.data ?? {},
        },
      });
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", expandedId] });
      toast.success("Retry sent");
    } catch {
      toast.error("Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  const toggleEvent = (value: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(value)
        ? prev.events.filter((e) => e !== value)
        : [...prev.events, value],
    }));
  };

  const closeDialog = () => {
    setShowDialog(false);
    setNewSecret(null);
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Receive signed HTTP POST callbacks when vendor status changes.
        </p>
        <Button onClick={() => { setNewSecret(null); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Endpoint
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : endpoints?.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Globe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No webhook endpoints yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add an endpoint to receive event notifications in your ERP or automation system.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {endpoints?.map((ep) => (
            <Card key={ep.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{ep.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ep.is_active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ep.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{ep.url}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(ep.events as string[]).map((evt) => (
                        <span
                          key={evt}
                          className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={ep.is_active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: ep.id, is_active: v })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteEndpoint.mutate(ep.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
                    >
                      {expandedId === ep.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Delivery log */}
                {expandedId === ep.id && (
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Last 20 Deliveries
                    </p>
                    {deliveriesLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !deliveries?.length ? (
                      <p className="text-sm text-muted-foreground text-center py-3">
                        No deliveries yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {deliveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-3 text-xs p-2 rounded bg-muted/40"
                          >
                            {d.status === "delivered" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            )}
                            <span className="font-mono flex-1">{d.event}</span>
                            <span
                              className={`font-medium ${
                                d.status === "delivered" ? "text-green-600" : "text-destructive"
                              }`}
                            >
                              {d.response_status ?? d.status}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(d.created_at).toLocaleString("en-IN", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                            {d.status !== "delivered" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                disabled={retryingId === d.id}
                                onClick={() => retryDelivery(d)}
                              >
                                {retryingId === d.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Show-secret dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newSecret ? "Save Your Signing Secret" : "Add Webhook Endpoint"}
            </DialogTitle>
          </DialogHeader>

          {newSecret ? (
            <div className="space-y-4">
              <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  This secret is shown only once
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  Use it to verify the <code className="font-mono">X-Insync-Signature</code> header
                  on each incoming webhook.
                </p>
              </div>
              <div>
                <Label>Signing Secret</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all font-mono">
                    {newSecret}
                  </code>
                  <CopyButton text={newSecret} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>I've saved it — Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="wh-name">Name *</Label>
                <Input
                  id="wh-name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., SAP ERP Production"
                />
              </div>
              <div>
                <Label htmlFor="wh-url">Endpoint URL *</Label>
                <Input
                  id="wh-url"
                  value={form.url}
                  onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="https://your-erp.com/webhooks/insync"
                />
              </div>
              <div>
                <Label className="mb-2 block">Events *</Label>
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((evt) => (
                    <div key={evt.value} className="flex items-center gap-2">
                      <Checkbox
                        id={evt.value}
                        checked={form.events.includes(evt.value)}
                        onCheckedChange={() => toggleEvent(evt.value)}
                      />
                      <label htmlFor={evt.value} className="text-sm cursor-pointer">
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {evt.value}
                        </span>
                        {evt.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createEndpoint.mutate()}
                  disabled={
                    !form.name.trim() ||
                    !form.url.trim() ||
                    form.events.length === 0 ||
                    createEndpoint.isPending
                  }
                >
                  {createEndpoint.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create Endpoint"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
