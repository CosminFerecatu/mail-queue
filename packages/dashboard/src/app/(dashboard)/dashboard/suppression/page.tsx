'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldBan, Plus, Trash2, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSuppressions, addSuppression, deleteSuppression } from '@/lib/api';

const reasonLabels: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'warning' }
> = {
  hard_bounce: { label: 'Hard Bounce', variant: 'destructive' },
  soft_bounce: { label: 'Soft Bounce', variant: 'warning' },
  complaint: { label: 'Complaint', variant: 'destructive' },
  unsubscribe: { label: 'Unsubscribe', variant: 'secondary' },
  manual: { label: 'Manual', variant: 'default' },
};

export default function SuppressionPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    reason: 'manual' as const,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['suppression'],
    queryFn: () => getSuppressions({ limit: 100 }),
  });

  const handleAdd = async () => {
    await addSuppression({
      emailAddress: formData.email,
      reason: formData.reason,
    });
    setIsAddOpen(false);
    setFormData({ email: '', reason: 'manual' });
    refetch();
  };

  const handleRemove = async (email: string) => {
    await deleteSuppression(email);
    refetch();
  };

  const filteredData = data?.data.filter((entry) =>
    entry.emailAddress.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Header title="Suppression List" description="Manage blocked email addresses" />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="relative w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search email addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add to Suppression List
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={`skeleton-${i}`} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData?.map((entry) => {
                    const reasonConfig = reasonLabels[entry.reason] || reasonLabels.manual;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ShieldBan className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{entry.emailAddress}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={reasonConfig.variant}>{reasonConfig.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.appId ? 'App-specific' : 'Global'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.expiresAt
                            ? formatDistanceToNow(new Date(entry.expiresAt), { addSuffix: true })
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(entry.emailAddress)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredData?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No suppressed emails found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Suppression List</DialogTitle>
            <DialogDescription>
              Add an email address to prevent sending emails to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                value={formData.reason}
                onValueChange={(value) =>
                  setFormData({ ...formData, reason: value as typeof formData.reason })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="hard_bounce">Hard Bounce</SelectItem>
                  <SelectItem value="soft_bounce">Soft Bounce</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!formData.email}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
