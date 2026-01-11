'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Trash2, Pause, Play, Layers } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  pauseQueue,
  resumeQueue,
  type Queue,
} from '@/lib/api';
import { useAppContext } from '@/contexts/app-context';

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const { apps } = useAppContext();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [deletingQueue, setDeletingQueue] = useState<Queue | null>(null);
  const [formData, setFormData] = useState({
    appId: '',
    name: '',
    priority: 5,
    rateLimit: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['queues'],
    queryFn: () => getQueues({ limit: 50 }),
  });

  const createMutation = useMutation({
    mutationFn: createQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      setIsCreateOpen(false);
      setFormData({ appId: '', name: '', priority: 5, rateLimit: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Queue> }) => updateQueue(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      setEditingQueue(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      setDeletingQueue(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: pauseQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      appId: formData.appId,
      name: formData.name,
      priority: formData.priority,
      rateLimit: formData.rateLimit ? Number.parseInt(formData.rateLimit) : undefined,
    });
  };

  const handleUpdate = () => {
    if (editingQueue) {
      updateMutation.mutate({
        id: editingQueue.id,
        data: {
          name: formData.name,
          priority: formData.priority,
          rateLimit: formData.rateLimit ? Number.parseInt(formData.rateLimit) : null,
        },
      });
    }
  };

  const getAppName = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    return app?.name || 'Unknown';
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 8) return <Badge variant="destructive">High ({priority})</Badge>;
    if (priority >= 5) return <Badge variant="warning">Medium ({priority})</Badge>;
    return <Badge variant="secondary">Low ({priority})</Badge>;
  };

  return (
    <>
      <Header title="Queues" description="Manage email queues and their configurations" />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">All Queues</h2>
            <p className="text-sm text-muted-foreground">{data?.data.length ?? 0} queues</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Queue
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={`skeleton-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Rate Limit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((queue) => (
                    <TableRow key={queue.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{queue.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getAppName(queue.appId)}
                      </TableCell>
                      <TableCell>{getPriorityBadge(queue.priority)}</TableCell>
                      <TableCell>
                        {queue.rateLimit ? `${queue.rateLimit}/min` : 'Unlimited'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={queue.isPaused ? 'secondary' : 'success'}>
                          {queue.isPaused ? 'Paused' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(queue.createdAt), { addSuffix: true })}
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
                              onClick={() => {
                                setEditingQueue(queue);
                                setFormData({
                                  appId: queue.appId,
                                  name: queue.name,
                                  priority: queue.priority,
                                  rateLimit: queue.rateLimit?.toString() || '',
                                });
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {queue.isPaused ? (
                              <DropdownMenuItem onClick={() => resumeMutation.mutate(queue.id)}>
                                <Play className="h-4 w-4 mr-2" />
                                Resume
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => pauseMutation.mutate(queue.id)}>
                                <Pause className="h-4 w-4 mr-2" />
                                Pause
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingQueue(queue)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No queues found. Create your first queue to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Queue</DialogTitle>
            <DialogDescription>Create a new email queue for an application.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="app">Application</Label>
              <Select
                value={formData.appId}
                onValueChange={(value) => setFormData({ ...formData, appId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Queue Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="transactional"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority (1-10)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 5 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (per min)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.appId || !formData.name || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingQueue} onOpenChange={() => setEditingQueue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Queue</DialogTitle>
            <DialogDescription>Update the queue configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Queue Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority (1-10)</Label>
                <Input
                  id="edit-priority"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 5 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rateLimit">Rate Limit (per min)</Label>
                <Input
                  id="edit-rateLimit"
                  type="number"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQueue(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.name || updateMutation.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingQueue} onOpenChange={() => setDeletingQueue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Queue</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the queue &quot;{deletingQueue?.name}&quot;? This will
              also delete all emails in this queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingQueue(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingQueue && deleteMutation.mutate(deletingQueue.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
