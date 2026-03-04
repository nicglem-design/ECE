"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPatch } from "@/lib/apiClient";

export interface Profile {
  email: string;
  displayName: string;
  avatarUrl: string;
  theme: string;
  preferredCurrency: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Profile>("/api/v1/profile");
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      try {
        const data = await apiPatch<Profile>("/api/v1/profile", updates);
        setProfile(data);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to save" };
      }
    },
    []
  );

  return { profile, loading, error, refetch: fetchProfile, updateProfile };
}
