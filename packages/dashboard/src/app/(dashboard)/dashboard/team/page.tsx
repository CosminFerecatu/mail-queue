'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSession } from 'next-auth/react';
import {
  Users,
  UserPlus,
  Mail,
  MoreHorizontal,
  Trash2,
  Shield,
  Loader2,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/use-toast';

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'admin' | 'editor' | 'viewer';
  invitedAt: string;
  acceptedAt: string | null;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invitedBy: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function getAuthToken(): Promise<string | null> {
  const session = await getSession();
  if (session?.accessToken) {
    return session.accessToken;
  }
  // Fallback to legacy token for admin users
  return localStorage.getItem('mq_token');
}

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch team');
  return data.data;
}

async function fetchInvitations(): Promise<TeamInvitation[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team/invitations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch invitations');
  return data.data;
}

async function createInvitation(input: { email: string; role: string }) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to send invitation');
  return data.data;
}

async function updateMemberRole(membershipId: string, role: string) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team/${membershipId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to update role');
  return data.data;
}

async function removeMember(membershipId: string) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team/${membershipId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to remove member');
  return data.data;
}

async function cancelInvitation(invitationId: string) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/v1/team/invite/${invitationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to cancel invitation');
  return data.data;
}

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  editor: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800',
};

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: fetchTeamMembers,
  });

  const { data: invitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ['team-invitations'],
    queryFn: fetchInvitations,
  });

  const inviteMutation = useMutation({
    mutationFn: createInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      toast({
        title: 'Invitation sent',
        description: 'The invitation has been sent successfully.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateMemberRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Role updated', description: 'The team member role has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Member removed', description: 'The team member has been removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: cancelInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
      toast({ title: 'Invitation cancelled', description: 'The invitation has been cancelled.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const isLoading = membersLoading || invitationsLoading;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">
            Manage your team members and their access permissions.
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to add a new member to your team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex flex-col">
                          <span>Admin</span>
                          <span className="text-xs text-muted-foreground">
                            Full access to all features
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="editor">
                        <div className="flex flex-col">
                          <span>Editor</span>
                          <span className="text-xs text-muted-foreground">
                            Can manage emails and queues
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex flex-col">
                          <span>Viewer</span>
                          <span className="text-xs text-muted-foreground">Read-only access</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Invitation'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Members Table */}
      <div className="border rounded-lg mb-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No team members yet. Invite someone to get started.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                        <AvatarFallback>
                          {member.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={roleColors[member.role]} variant="secondary">
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.acceptedAt
                      ? format(new Date(member.acceptedAt), 'MMM d, yyyy')
                      : 'Pending'}
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
                          onClick={() =>
                            updateRoleMutation.mutate({ id: member.id, role: 'admin' })
                          }
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateRoleMutation.mutate({ id: member.id, role: 'editor' })
                          }
                        >
                          Make Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateRoleMutation.mutate({ id: member.id, role: 'viewer' })
                          }
                        >
                          Make Viewer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => removeMemberMutation.mutate(member.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
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

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Pending Invitations</h2>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {invitation.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={roleColors[invitation.role]} variant="secondary">
                        {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(invitation.createdAt), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(invitation.expiresAt), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
