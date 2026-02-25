import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useSettings,
  useUpdateSetting,
  useUsers,
  useUpdateUserRole,
} from '@/api/hooks';
import type { SettingResponse, UserResponse } from '@articleforge/shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import {
  Settings,
  Users,
  Pencil,
  Save,
  X,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

// --- Setting definitions ---

interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'number' | 'comma-list';
}

const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'tone_of_voice',
    label: 'Tone of Voice',
    description: 'The default writing tone applied to generated articles.',
    type: 'textarea',
  },
  {
    key: 'default_company_links',
    label: 'Default Company Links',
    description: 'Comma-separated list of company links for RAG context.',
    type: 'comma-list',
  },
  {
    key: 'rag_top_k',
    label: 'RAG Top K',
    description: 'Number of top matching chunks to retrieve from RAG.',
    type: 'number',
  },
  {
    key: 'rag_threshold',
    label: 'RAG Threshold',
    description: 'Minimum similarity score for RAG retrieval (0-1).',
    type: 'number',
  },
  {
    key: 'image_style',
    label: 'Image Style',
    description: 'Default style for generated images.',
    type: 'text',
  },
  {
    key: 'max_concurrent_generations',
    label: 'Max Concurrent Generations',
    description: 'Maximum number of generation runs that can execute simultaneously.',
    type: 'number',
  },
];

// --- Helpers ---

const settingToDisplayValue = (setting: SettingResponse | undefined, def: SettingDefinition): string => {
  if (!setting) return '';
  const val = setting.value;
  if (def.type === 'comma-list') {
    if (Array.isArray(val)) return (val as string[]).join(', ');
    if (typeof val === 'string') return val;
    return '';
  }
  if (val === null || val === undefined) return '';
  return String(val);
};

const displayValueToApiValue = (displayValue: string, def: SettingDefinition): unknown => {
  if (def.type === 'number') {
    const num = parseFloat(displayValue);
    return isNaN(num) ? 0 : num;
  }
  if (def.type === 'comma-list') {
    return displayValue
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return displayValue;
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// --- Setting Row Component ---

interface SettingRowProps {
  definition: SettingDefinition;
  setting: SettingResponse | undefined;
  onSave: (key: string, value: unknown) => Promise<void>;
  isSaving: boolean;
}

const SettingRow = ({ definition, setting, onSave, isSaving }: SettingRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = settingToDisplayValue(setting, definition);

  const handleStartEdit = () => {
    setEditValue(displayValue);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleSave = async () => {
    const apiValue = displayValueToApiValue(editValue, definition);
    await onSave(definition.key, apiValue);
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">{definition.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{definition.description}</p>
        </div>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={handleStartEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          {definition.type === 'textarea' ? (
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder={`Enter ${definition.label.toLowerCase()}...`}
            />
          ) : (
            <Input
              type={definition.type === 'number' ? 'number' : 'text'}
              step={definition.key === 'rag_threshold' ? '0.01' : undefined}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="max-w-md text-sm"
              placeholder={
                definition.type === 'comma-list'
                  ? 'value1, value2, value3'
                  : `Enter ${definition.label.toLowerCase()}...`
              }
            />
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          {displayValue || <span className="italic text-muted-foreground">Not set</span>}
        </div>
      )}
    </div>
  );
};

// --- User Row Component ---

interface UserRowProps {
  user: UserResponse;
  onRoleChange: (id: string, role: string) => void;
  isUpdating: boolean;
  currentUserId: string | undefined;
}

const UserRow = ({ user, onRoleChange, isUpdating, currentUserId }: UserRowProps) => {
  const isSelf = user.id === currentUserId;

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        <div>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      </td>
      <td className="py-3 pr-4">
        {isSelf ? (
          <Badge variant="default" className="text-xs">
            {user.role}
          </Badge>
        ) : (
          <Select
            value={user.role}
            onValueChange={(val) => onRoleChange(user.id, val)}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="editor">editor</SelectItem>
              <SelectItem value="viewer">viewer</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="py-3 text-sm text-muted-foreground">{formatDate(user.created_at)}</td>
    </tr>
  );
};

// --- Main Settings Page ---

export const SettingsPage = () => {
  const { user, isAdmin } = useAuth();

  const { data: settings, isLoading: settingsLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const { data: users, isLoading: usersLoading } = useUsers();
  const updateUserRole = useUpdateUserRole();

  if (!isAdmin()) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          You need administrator privileges to access settings.
        </p>
      </div>
    );
  }

  const settingsArray = Array.isArray(settings) ? settings : [];
  const usersArray = Array.isArray(users) ? users : [];

  const getSettingByKey = (key: string): SettingResponse | undefined =>
    settingsArray.find((s) => s.key === key);

  const handleSaveSetting = async (key: string, value: unknown) => {
    try {
      await updateSetting.mutateAsync({ key, value });
      toast({ title: 'Setting updated', description: `"${key}" has been saved.` });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleRoleChange = (id: string, role: string) => {
    updateUserRole.mutate(
      { id, role },
      {
        onSuccess: () => {
          toast({ title: 'Role updated', description: 'User role has been changed.' });
        },
        onError: (err) => {
          toast({
            title: 'Update failed',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage application settings and user roles.
        </p>
      </div>

      {/* Application Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Application Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y">
              {SETTING_DEFINITIONS.map((def) => (
                <SettingRow
                  key={def.key}
                  definition={def}
                  setting={getSettingByKey(def.key)}
                  onSave={handleSaveSetting}
                  isSaving={updateSetting.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usersArray.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">User</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Role</th>
                    <th className="pb-3 font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {usersArray.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onRoleChange={handleRoleChange}
                      isUpdating={updateUserRole.isPending}
                      currentUserId={user?.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
