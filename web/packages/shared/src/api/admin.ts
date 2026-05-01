import { api } from "./client";
import type {
  AdminActionResponse,
  CreateAdminUserRequest,
  AdminUserAccount,
  ResetAdminUserPasswordRequest,
  ServerRuntimeSettings,
  UpdateAdminUserRequest,
  UpdateServerRuntimeSettingsRequest,
} from "../types";

export const adminApi = {
  createUser: (request: CreateAdminUserRequest): Promise<AdminUserAccount> => {
    return api.post<AdminUserAccount>("/settings/users", request);
  },

  listUsers: (): Promise<AdminUserAccount[]> => {
    return api.get<AdminUserAccount[]>("/settings/users");
  },

  getUser: (userId: string): Promise<AdminUserAccount> => {
    return api.get<AdminUserAccount>(`/settings/users/${userId}`);
  },

  updateUser: (
    userId: string,
    request: UpdateAdminUserRequest,
  ): Promise<AdminUserAccount> => {
    return api.put<AdminUserAccount>(`/settings/users/${userId}`, request);
  },

  resetUserPassword: (
    userId: string,
    request: ResetAdminUserPasswordRequest,
  ): Promise<AdminActionResponse> => {
    return api.post<AdminActionResponse>(`/settings/users/${userId}/reset-password`, request);
  },

  deleteUser: (userId: string): Promise<AdminActionResponse> => {
    return api.delete<AdminActionResponse>(`/settings/users/${userId}`);
  },

  getServerRuntimeSettings: (): Promise<ServerRuntimeSettings> => {
    return api.get<ServerRuntimeSettings>("/settings/server-runtime");
  },

  updateServerRuntimeSettings: (
    request: UpdateServerRuntimeSettingsRequest,
  ): Promise<ServerRuntimeSettings> => {
    return api.put<ServerRuntimeSettings>("/settings/server-runtime", request);
  },
};
