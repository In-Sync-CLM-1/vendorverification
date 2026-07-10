import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Ban,
  Code2,
} from "lucide-react";

function generateApiKey(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return (
    "isk_live_" +
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
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

export function ApiKeysPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Resolve the admin's actual tenant (id + slug) — used for both the API-keys
  // table and the curl example URL. Hostname-based tenant from useTenant() is
  // not used here because it's always "in-sync" (the canonical hostname).
  const { data: orgTenant } = useQuery({
    queryKey: ["admin-org-tenant", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.tenant_id) return null;
      const { data: t } = await supabase
        .from("tenants").select("id, slug").eq("id", profile.tenant_id).maybeSingle();
      return t;
    },
    enabled: !!user,
  });

  const [showDialog, setShowDialog] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys", orgTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, is_active, created_at, last_used_at")
        .eq("tenant_id", orgTenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgTenant?.id,
  });

  const createKey = useMutation({
    mutationFn: async () => {
      if (!orgTenant) throw new Error("Could not resolve your organization");
      const fullKey = generateApiKey();
      const keyHash = await sha256Hex(fullKey);
      const keyPrefix = fullKey.substring(0, 12);

      const { error } = await supabase.from("api_keys").insert({
        tenant_id: orgTenant.id,
        name: keyName.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        created_by: user!.id,
        is_active: true,
      });
      if (error) throw error;
      return fullKey;
    },
    onSuccess: (fullKey) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKey(fullKey);
      setKeyName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => {
    setShowDialog(false);
    setNewKey(null);
    setKeyName("");
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Generate API keys to run verifications programmatically from your ERP or custom systems.
        </p>
        <Button onClick={() => { setNewKey(null); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Usage example */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Quick Start
          </p>
          <pre className="text-xs bg-background/70 rounded p-3 overflow-x-auto font-mono text-muted-foreground">
{`curl -X POST https://vendorverification.in-sync.co.in/api/${orgTenant?.slug ?? "<your-org>"}/verify_gst \\
  -H "Authorization: Bearer isk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"gstin":"27AAHCA3239L1ZH"}'`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            Supported actions (replace <code className="font-mono">verify_gst</code> in the URL):{" "}
            <code className="font-mono">verify_gst</code>,{" "}
            <code className="font-mono">verify_pan</code>,{" "}
            <code className="font-mono">verify_bank_account</code>,{" "}
            <code className="font-mono">get_vendor</code>,{" "}
            <code className="font-mono">submit_vendor</code>,{" "}
            <code className="font-mono">list_approved_vendors</code>
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : keys?.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Key className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No API keys yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a key to start integrating with your systems.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys?.map((k) => (
            <Card key={k.id} className={k.is_active ? "" : "opacity-60"}>
              <CardContent className="p-4 flex items-center gap-3">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{k.name}</span>
                    {!k.is_active && (
                      <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                        Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-mono text-muted-foreground mt-0.5">
                    {k.key_prefix}••••••••••••••••••••
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {new Date(k.created_at).toLocaleDateString("en-IN")}
                    {k.last_used_at &&
                      ` · Last used ${new Date(k.last_used_at).toLocaleDateString("en-IN")}`}
                  </p>
                </div>
                {k.is_active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive shrink-0"
                    onClick={() => revokeKey.mutate(k.id)}
                    disabled={revokeKey.isPending}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Revoke
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Show-key dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newKey ? "Your New API Key" : "Create API Key"}</DialogTitle>
          </DialogHeader>

          {newKey ? (
            <div className="space-y-4">
              <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This key is shown only once
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  Copy and store it securely. You won't be able to see it again.
                </p>
              </div>
              <div>
                <Label>API Key</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all font-mono">
                    {newKey}
                  </code>
                  <CopyButton text={newKey} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>I've saved it — Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="key-name">Key Name *</Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., SAP Integration, CI/CD Pipeline"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A label to identify where this key is used.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createKey.mutate()}
                  disabled={!keyName.trim() || createKey.isPending}
                >
                  {createKey.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Generate Key"
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
