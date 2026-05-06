import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  FileText,
  Plus,
  Edit,
  Trash2,
  Loader2,
  BarChart3,
  ShieldAlert,
  Database,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Globe,
  Key,
} from "lucide-react";
import { DataRequestsPanel } from "@/components/admin/DataRequestsPanel";
import { BreachNotificationPanel } from "@/components/admin/BreachNotificationPanel";
import { WebhooksPanel } from "@/components/admin/WebhooksPanel";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";

export default function AdminSettings() {
  const { isAdmin } = useUserRoles();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Resolve the admin's tenant_id once — required for vendor_categories / document_types inserts
  const { data: adminTenantId } = useQuery({
    queryKey: ["admin-tenant-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });

  const [activeTab, setActiveTab] = useState("categories");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showDocTypeDialog, setShowDocTypeDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editingDocType, setEditingDocType] = useState<any>(null);

  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", is_active: true });
  const [docTypeForm, setDocTypeForm] = useState({ name: "", description: "", has_expiry: false, max_file_size_mb: 5 });

  // Encryption key state
  const [encryptionKey, setEncryptionKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => { const { data, error } = await supabase.from("vendor_categories").select("*").order("name"); if (error) throw error; return data; },
  });

  const { data: docTypes, isLoading: docTypesLoading } = useQuery({
    queryKey: ["admin-doc-types"],
    queryFn: async () => { const { data, error } = await supabase.from("document_types").select("*").order("name"); if (error) throw error; return data; },
  });

  // Check if encryption key is configured
  const { data: keyStatus, isLoading: keyStatusLoading } = useQuery({
    queryKey: ["encryption-key-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("set-encryption-key", {
        body: { action: "check" },
      });
      if (error) throw error;
      return data as { configured: boolean };
    },
    enabled: isAdmin,
  });

  const saveEncryptionKey = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("set-encryption-key", {
        body: { encryption_key: encryptionKey, action: "save" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encryption-key-status"] });
      toast.success("Encryption key saved successfully");
      setEncryptionKey("");
      setShowKey(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveCategory = useMutation({
    mutationFn: async () => {
      if (editingCategory) { const { error } = await supabase.from("vendor_categories").update(categoryForm).eq("id", editingCategory.id); if (error) throw error; }
      else {
        if (!adminTenantId) throw new Error("Could not resolve your organization");
        const { error } = await supabase.from("vendor_categories").insert({ ...categoryForm, tenant_id: adminTenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success(editingCategory ? "Category updated" : "Category created"); setShowCategoryDialog(false); setEditingCategory(null); setCategoryForm({ name: "", description: "", is_active: true }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("vendor_categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("Category deleted"); },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveDocType = useMutation({
    mutationFn: async () => {
      if (editingDocType) { const { error } = await supabase.from("document_types").update(docTypeForm).eq("id", editingDocType.id); if (error) throw error; }
      else {
        if (!adminTenantId) throw new Error("Could not resolve your organization");
        const { error } = await supabase.from("document_types").insert({ ...docTypeForm, tenant_id: adminTenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-doc-types"] }); toast.success(editingDocType ? "Document type updated" : "Document type created"); setShowDocTypeDialog(false); setEditingDocType(null); setDocTypeForm({ name: "", description: "", has_expiry: false, max_file_size_mb: 5 }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEditCategory = (cat: any) => { setEditingCategory(cat); setCategoryForm({ name: cat.name, description: cat.description || "", is_active: cat.is_active }); setShowCategoryDialog(true); };
  const openEditDocType = (doc: any) => { setEditingDocType(doc); setDocTypeForm({ name: doc.name, description: doc.description || "", has_expiry: doc.has_expiry, max_file_size_mb: doc.max_file_size_mb }); setShowDocTypeDialog(true); };

  if (!isAdmin) {
    return (
      <StaffLayout title="Access Denied">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="System Settings">
      <div className="flex-1 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 h-auto py-2 bg-card border-b rounded-none flex-wrap">
            <TabsTrigger value="categories" className="flex items-center gap-2"><Building2 className="h-4 w-4" />Categories</TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2"><FileText className="h-4 w-4" />Doc Types</TabsTrigger>
            <TabsTrigger value="encryption" className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Encryption</TabsTrigger>
            <TabsTrigger value="data-requests" className="flex items-center gap-2"><Database className="h-4 w-4" />Data Requests</TabsTrigger>
            <TabsTrigger value="breach" className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Breach</TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Reports</TabsTrigger>
            <TabsTrigger value="webhooks" className="flex items-center gap-2"><Globe className="h-4 w-4" />Webhooks</TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2"><Key className="h-4 w-4" />API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="flex-1 flex flex-col mt-0">
            <div className="p-4 border-b">
              <Button onClick={() => setShowCategoryDialog(true)}><Plus className="h-4 w-4 mr-2" />Add Category</Button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 max-w-2xl">
              {categoriesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : categories?.map((cat) => (
                <Card key={cat.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{cat.name}</p>
                      <p className="text-sm text-muted-foreground">{cat.description}</p>
                      {!cat.is_active && <span className="text-xs text-destructive">Inactive</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditCategory(cat)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteCategory.mutate(cat.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="documents" className="flex-1 flex flex-col mt-0">
            <div className="p-4 border-b">
              <Button onClick={() => setShowDocTypeDialog(true)}><Plus className="h-4 w-4 mr-2" />Add Document Type</Button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 max-w-2xl">
              {docTypesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : docTypes?.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">{doc.description}</p>
                      <div className="flex gap-2 mt-1">
                        {doc.has_expiry && <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded">Has Expiry</span>}
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">Max {doc.max_file_size_mb}MB</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEditDocType(doc)}><Edit className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="encryption" className="flex-1 flex flex-col mt-0">
            <div className="flex-1 overflow-auto p-4 space-y-4 max-w-2xl">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle className="text-lg">PII Encryption Key</CardTitle>
                      <CardDescription>
                        AES-256 encryption key used to protect Personally Identifiable Information (PII) as required by the DPDP Act 2023.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4">
                    {keyStatusLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : keyStatus?.configured ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-sm text-primary font-medium">Encryption key is configured</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive font-medium">No encryption key configured</span>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="encryption-key">
                      {keyStatus?.configured ? "Rotate Encryption Key" : "Set Encryption Key"}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="encryption-key"
                          type={showKey ? "text" : "password"}
                          value={encryptionKey}
                          onChange={(e) => setEncryptionKey(e.target.value)}
                          placeholder="Enter AES-256 encryption key (min 16 chars)"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </div>
                      <Button
                        onClick={() => saveEncryptionKey.mutate()}
                        disabled={!encryptionKey || encryptionKey.length < 16 || saveEncryptionKey.isPending}
                      >
                        {saveEncryptionKey.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Save Key
                          </>
                        )}
                      </Button>
                    </div>
                    {encryptionKey && encryptionKey.length < 16 && (
                      <p className="text-xs text-destructive">Key must be at least 16 characters long</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {keyStatus?.configured && (
                <Card className="border-warning/50 bg-warning/5">
                  <CardContent className="p-4 flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Key Rotation Warning</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Changing the encryption key will make previously encrypted PII data unreadable unless all existing data is re-encrypted with the new key. 
                        Ensure you have a data migration plan before rotating keys.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <p className="font-medium text-sm mb-2">How it works</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                    <li>The key is stored securely in the backend vault — it never appears in application code or logs.</li>
                    <li>Fields like PAN, GST, Bank Account, Mobile, and Email are automatically encrypted using this key via database triggers.</li>
                    <li>Decryption happens only through authorized RPCs with full audit logging (DPDP compliance).</li>
                    <li>Use a strong, random key of at least 32 characters for production environments.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="data-requests" className="flex-1 flex flex-col mt-0">
            <DataRequestsPanel />
          </TabsContent>

          <TabsContent value="breach" className="flex-1 flex flex-col mt-0">
            <BreachNotificationPanel />
          </TabsContent>

          <TabsContent value="reports" className="flex-1 flex flex-col mt-0">
            <div className="p-6 text-center">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-primary/50" />
              <p className="text-lg font-semibold mb-2">Reports & Analytics</p>
              <p className="text-muted-foreground mb-4">View vendor status reports, approval timelines, and pending case analysis.</p>
              <Button onClick={() => window.location.href = "/staff/reports"}>Go to Reports</Button>
            </div>
          </TabsContent>

          <TabsContent value="webhooks" className="flex-1 flex flex-col mt-0">
            <WebhooksPanel />
          </TabsContent>

          <TabsContent value="api-keys" className="flex-1 flex flex-col mt-0">
            <ApiKeysPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={(open) => { setShowCategoryDialog(open); if (!open) { setEditingCategory(null); setCategoryForm({ name: "", description: "", is_active: true }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="cat-name">Name *</Label><Input id="cat-name" value={categoryForm.name} onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Supplier" /></div>
            <div><Label htmlFor="cat-desc">Description</Label><Input id="cat-desc" value={categoryForm.description} onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
            <div className="flex items-center justify-between"><Label htmlFor="cat-active">Active</Label><Switch id="cat-active" checked={categoryForm.is_active} onCheckedChange={(checked) => setCategoryForm(prev => ({ ...prev, is_active: checked }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancel</Button>
            <Button onClick={() => saveCategory.mutate()} disabled={!categoryForm.name || saveCategory.isPending}>{saveCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Type Dialog */}
      <Dialog open={showDocTypeDialog} onOpenChange={(open) => { setShowDocTypeDialog(open); if (!open) { setEditingDocType(null); setDocTypeForm({ name: "", description: "", has_expiry: false, max_file_size_mb: 5 }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDocType ? "Edit Document Type" : "Add Document Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="doc-name">Name *</Label><Input id="doc-name" value={docTypeForm.name} onChange={(e) => setDocTypeForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., GST Certificate" /></div>
            <div><Label htmlFor="doc-desc">Description</Label><Input id="doc-desc" value={docTypeForm.description} onChange={(e) => setDocTypeForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
            <div><Label htmlFor="doc-size">Max File Size (MB)</Label><Input id="doc-size" type="number" value={docTypeForm.max_file_size_mb} onChange={(e) => setDocTypeForm(prev => ({ ...prev, max_file_size_mb: parseInt(e.target.value) || 5 }))} min={1} max={20} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="doc-expiry">Has Expiry Date</Label><Switch id="doc-expiry" checked={docTypeForm.has_expiry} onCheckedChange={(checked) => setDocTypeForm(prev => ({ ...prev, has_expiry: checked }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocTypeDialog(false)}>Cancel</Button>
            <Button onClick={() => saveDocType.mutate()} disabled={!docTypeForm.name || saveDocType.isPending}>{saveDocType.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StaffLayout>
  );
}
