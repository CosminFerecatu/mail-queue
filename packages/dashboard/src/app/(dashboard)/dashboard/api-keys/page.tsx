'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSession } from 'next-auth/react';
import {
  Key,
  Plus,
  Copy,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  ShieldOff,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { useAppContext } from '@/contexts/app-context';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number | null;
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

const AVAILABLE_SCOPES = [
  { id: 'email:send', label: 'Send Emails', description: 'Send emails through the API' },
  { id: 'email:read', label: 'Read Emails', description: 'View email status and details' },
  { id: 'queue:manage', label: 'Manage Queues', description: 'Create, update, and delete queues' },
  { id: 'stats:read', label: 'Read Statistics', description: 'View analytics and statistics' },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function getAuthToken(): Promise<string | null> {
  const session = await getSession();
  if (session?.accessToken) {
    return session.accessToken;
  }
  // Fallback to legacy token for admin users
  return localStorage.getItem('mq_token');
}

async function fetchApiKeys(appId: string): Promise<ApiKey[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/apps/${appId}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch API keys');
  return data.data;
}

async function createApiKey(
  appId: string,
  input: { name: string; scopes: string[]; rateLimit?: number }
): Promise<ApiKeyWithSecret> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/apps/${appId}/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to create API key');
  return data.data;
}

async function revokeApiKey(appId: string, keyId: string) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/apps/${appId}/api-keys/${keyId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to revoke API key');
  return data.data;
}

async function deleteApiKey(appId: string, keyId: string) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/apps/${appId}/api-keys/${keyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || 'Failed to delete API key');
  }
}

async function rotateApiKey(appId: string, keyId: string): Promise<ApiKeyWithSecret> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/apps/${appId}/api-keys/${keyId}/rotate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to rotate API key');
  return data.data;
}

export default function ApiKeysPage() {
  const { selectedAppId, selectedApp } = useAppContext();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['email:send', 'email:read']);
  const [rateLimit, setRateLimit] = useState('');
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

  const {
    data: apiKeys = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['api-keys', selectedAppId],
    queryFn: () => (selectedAppId ? fetchApiKeys(selectedAppId) : Promise.resolve([])),
    enabled: !!selectedAppId,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; scopes: string[]; rateLimit?: number }) => {
      if (!selectedAppId) throw new Error('App ID is required');
      return createApiKey(selectedAppId, input);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedAppId] });
      setCreateDialogOpen(false);
      setKeyName('');
      setSelectedScopes(['email:send', 'email:read']);
      setRateLimit('');
      setNewKey(data.key);
      setNewKeyDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => {
      if (!selectedAppId) throw new Error('App ID is required');
      return revokeApiKey(selectedAppId, keyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedAppId] });
      toast({ title: 'API key revoked', description: 'The API key has been revoked.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => {
      if (!selectedAppId) throw new Error('App ID is required');
      return deleteApiKey(selectedAppId, keyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedAppId] });
      setDeleteKeyId(null);
      toast({ title: 'API key deleted', description: 'The API key has been permanently deleted.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => {
      if (!selectedAppId) throw new Error('App ID is required');
      return rotateApiKey(selectedAppId, keyId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedAppId] });
      setNewKey(data.key);
      setNewKeyDialogOpen(true);
      toast({ title: 'API key rotated', description: 'A new API key has been generated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: keyName,
      scopes: selectedScopes,
      rateLimit: rateLimit ? Number.parseInt(rateLimit, 10) : undefined,
    });
  };

  const copyToClipboard = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  if (!selectedAppId) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Key className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No App Selected</h2>
          <p className="text-muted-foreground max-w-sm">
            Please select an app from the sidebar to manage its API keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Manage API keys for {selectedApp?.name || 'your app'}. Use these keys to authenticate
            with the Mail Queue API.
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key to access the Mail Queue API.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Production API Key"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    A descriptive name to identify this key.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="space-y-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <div key={scope.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={scope.id}
                          checked={selectedScopes.includes(scope.id)}
                          onCheckedChange={() => toggleScope(scope.id)}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <label
                            htmlFor={scope.id}
                            className="text-sm font-medium leading-none cursor-pointer"
                          >
                            {scope.label}
                          </label>
                          <p className="text-xs text-muted-foreground">{scope.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rateLimit">Rate Limit (optional)</Label>
                  <Input
                    id="rateLimit"
                    type="number"
                    placeholder="1000"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum requests per minute. Leave empty for default limit.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || selectedScopes.length === 0}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Key'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* New Key Dialog */}
      <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you will see this key. Copy it now and store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
              <code className="flex-1 break-all">{newKey}</code>
              <Button variant="ghost" size="icon" onClick={copyToClipboard}>
                {keyCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyDialogOpen(false)}>I have saved the key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={(open) => !open && setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The API key will be permanently deleted and any
              applications using it will no longer be able to authenticate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteMutation.mutate(deleteKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Keys Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-destructive">
                  Error loading API keys
                </TableCell>
              </TableRow>
            ) : apiKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No API keys yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {apiKey.keyPrefix}...
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {apiKey.scopes.slice(0, 2).map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                      {apiKey.scopes.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{apiKey.scopes.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {apiKey.isActive ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                        Revoked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {apiKey.lastUsedAt
                      ? format(new Date(apiKey.lastUsedAt), 'MMM d, yyyy')
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(apiKey.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => rotateMutation.mutate(apiKey.id)}
                          disabled={!apiKey.isActive}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Rotate Key
                        </DropdownMenuItem>
                        {apiKey.isActive && (
                          <DropdownMenuItem onClick={() => revokeMutation.mutate(apiKey.id)}>
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Revoke
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteKeyId(apiKey.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Using API Keys</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Include your API key in the Authorization header when making requests to the Mail Queue
          API:
        </p>
        <pre className="bg-background p-3 rounded text-sm overflow-x-auto">
          <code>{`curl -X POST ${API_URL}/v1/emails \\
  -H "Authorization: Bearer mq_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "user@example.com", "subject": "Hello", "text": "World"}'`}</code>
        </pre>
      </div>
    </div>
  );
}
