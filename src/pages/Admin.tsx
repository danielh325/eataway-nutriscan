import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { foodSpots as hardcodedSpots } from "@/data/foodSpots";
import { triggerBatchPhotoFetch } from "@/utils/batchPhotoFetch";
import { invalidatePlacesPhotoCache } from "@/hooks/usePlacesPhoto";
import {
  ArrowLeft, RefreshCw, Check, X, Image, Pencil, Trash2,
  Eye, EyeOff, Lock, CheckCircle2, Circle, LogIn
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type SpotStatus = { reviewed: boolean; hidden: boolean };

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [actionError, setActionError] = useState("");

  // Photos
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map());
  const [photoLoading, setPhotoLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState("");
  const [editingSpot, setEditingSpot] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [photoSearch, setPhotoSearch] = useState("");

  // Review
  const [statuses, setStatuses] = useState<Map<string, SpotStatus>>(new Map());
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "reviewed">("pending");

  // Check admin role
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setCheckingRole(false);
      return;
    }
    const checkRole = async () => {
      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(Boolean(data));
      setCheckingRole(false);
    };
    checkRole();
  }, [user, authLoading]);

  const runAdminAction = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-photo-actions", {
      body: payload,
    });

    if (error) throw new Error(error.message || "Admin action failed");
    if ((data as any)?.error) throw new Error((data as any).error);
  }, []);

  const loadPhotos = useCallback(async () => {
    setPhotoLoading(true);
    const { data } = await supabase.from("place_photos").select("spot_name, photo_url");
    const map = new Map<string, string | null>();
    if (data) (data as any[]).forEach((r) => map.set(r.spot_name, r.photo_url));
    setPhotos(map);
    setPhotoLoading(false);
  }, []);

  const loadStatuses = useCallback(async () => {
    const { data } = await supabase.from("admin_spot_status").select("spot_name, reviewed, hidden");
    const map = new Map<string, SpotStatus>();
    if (data) (data as any[]).forEach((r) => map.set(r.spot_name, { reviewed: r.reviewed ?? false, hidden: r.hidden ?? false }));
    setStatuses(map);
  }, []);

  useEffect(() => {
    if (isAdmin !== true) return;
    document.body.style.overflow = "auto";
    loadPhotos();
    loadStatuses();
    return () => { document.body.style.overflow = "hidden"; };
  }, [isAdmin, loadPhotos, loadStatuses]);

  const handleBatchFetch = async (refresh = false) => {
    if (refresh && !confirm("Smart-refresh ALL vendor photos? This will re-pick the best photo from Google for every vendor (replaces existing). Takes ~2-3 mins.")) return;
    setFetching(true);
    setFetchProgress(refresh ? "Smart-refreshing all photos..." : "Fetching missing photos...");
    setActionError("");
    try {
      const result = await triggerBatchPhotoFetch(refresh);
      setFetchProgress(
        refresh
          ? `Done! Refreshed ${result.totalFetched} photos (${result.totalFailed} failed)`
          : `Done! ${result.totalFetched} new, ${result.totalCached} cached`
      );
      invalidatePlacesPhotoCache();
      await loadPhotos();
    } catch (err: any) {
      setFetchProgress(err?.message || "Error during fetch");
    }
    setFetching(false);
  };

  const handleReplacePhoto = async (spotName: string, url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    try {
      await runAdminAction({ action: "upsertPhoto", spotName, photoUrl: trimmedUrl });
      setPhotos((p) => new Map(p).set(spotName, url));
      invalidatePlacesPhotoCache();
      setEditingSpot(null);
      setNewUrl("");
      setActionError("");
    } catch (err: any) {
      setActionError(err?.message || "Failed to save photo.");
    }
  };

  const handleDeletePhoto = async (spotName: string) => {
    try {
      await runAdminAction({ action: "deletePhoto", spotName });
      setPhotos((p) => { const m = new Map(p); m.delete(spotName); return m; });
      invalidatePlacesPhotoCache();
      setActionError("");
    } catch (err: any) {
      setActionError(err?.message || "Failed to delete photo.");
    }
  };

  const toggleReviewed = async (spotName: string) => {
    const current = statuses.get(spotName);
    const newVal = !(current?.reviewed ?? false);

    try {
      await runAdminAction({
        action: "upsertStatus",
        spotName,
        reviewed: newVal,
        hidden: current?.hidden ?? false,
      });
      setStatuses((p) => new Map(p).set(spotName, { reviewed: newVal, hidden: current?.hidden ?? false }));
      setActionError("");
    } catch (err: any) {
      setActionError(err?.message || "Failed to update review status.");
    }
  };

  const toggleHidden = async (spotName: string) => {
    const current = statuses.get(spotName);
    const newVal = !(current?.hidden ?? false);

    try {
      await runAdminAction({
        action: "upsertStatus",
        spotName,
        hidden: newVal,
        reviewed: current?.reviewed ?? false,
      });
      setStatuses((p) => new Map(p).set(spotName, { hidden: newVal, reviewed: current?.reviewed ?? false }));
      setActionError("");
    } catch (err: any) {
      setActionError(err?.message || "Failed to update visibility.");
    }
  };

  const mergedSpots = useMemo(() => {
    return hardcodedSpots.filter((s) => {
      const st = statuses.get(s.name);
      if (reviewFilter === "pending" && st?.reviewed) return false;
      if (reviewFilter === "reviewed" && !st?.reviewed) return false;
      if (photoSearch && !s.name.toLowerCase().includes(photoSearch.toLowerCase())) return false;
      return true;
    });
  }, [statuses, reviewFilter, photoSearch]);

  const totalSpots = hardcodedSpots.length;
  const withPhotos = hardcodedSpots.filter((s) => photos.has(s.name) && photos.get(s.name)).length;
  const reviewedCount = hardcodedSpots.filter((s) => statuses.get(s.name)?.reviewed).length;
  const hiddenCount = hardcodedSpots.filter((s) => statuses.get(s.name)?.hidden).length;

  // Loading state
  if (authLoading || checkingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f9fafb", color: "#111827" }}>
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm" style={{ color: "#6b7280" }}>Checking access...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f9fafb", color: "#111827" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb" }} className="rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "#fee2e2" }}>
            <Lock className="w-6 h-6" style={{ color: "#dc2626" }} />
          </div>
          <h1 className="text-lg font-bold mb-2">Admin Access</h1>
          <p className="text-sm mb-4" style={{ color: "#6b7280" }}>Please sign in with an admin account to access the dashboard.</p>
          <button
            onClick={() => navigate("/")}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
            style={{ background: "#2563eb" }}
          >
            <LogIn className="w-4 h-4" /> Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Logged in but not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f9fafb", color: "#111827" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb" }} className="rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "#fee2e2" }}>
            <Lock className="w-6 h-6" style={{ color: "#dc2626" }} />
          </div>
          <h1 className="text-lg font-bold mb-2">Access Denied</h1>
          <p className="text-sm mb-4" style={{ color: "#6b7280" }}>Your account does not have admin privileges.</p>
          <button
            onClick={() => navigate("/")}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "#2563eb" }}
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f9fafb", color: "#111827" }}>
      {/* Header */}
      <div className="sticky top-0 z-50 shadow-sm" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg" style={{ color: "#374151" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">📸 Admin Dashboard</h1>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
              {withPhotos} photos
            </span>
            <span className="px-3 py-1 rounded-full font-medium" style={{ background: "#dbeafe", color: "#1e40af" }}>
              {reviewedCount}/{totalSpots} reviewed
            </span>
            {hiddenCount > 0 && (
              <span className="px-3 py-1 rounded-full font-medium" style={{ background: "#fee2e2", color: "#991b1b" }}>
                {hiddenCount} hidden
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button onClick={() => handleBatchFetch(false)} disabled={fetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: fetching ? "#93c5fd" : "#2563eb" }}>
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Fetching..." : "Fetch Missing Photos"}
          </button>
          <button onClick={() => handleBatchFetch(true)} disabled={fetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: fetching ? "#c4b5fd" : "#7c3aed" }}
            title="Re-pick the best photo from Google for every vendor (replaces existing photos with smart-scored picks)">
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            🎯 Smart Refresh All
          </button>
          {fetchProgress && <span className="text-sm" style={{ color: "#6b7280" }}>{fetchProgress}</span>}
          {actionError && <span className="text-sm" style={{ color: "#dc2626" }}>{actionError}</span>}
          <div className="flex-1" />
          <input type="text" placeholder="Search..." value={photoSearch} onChange={(e) => setPhotoSearch(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm w-48" style={{ border: "1px solid #d1d5db", background: "#fff" }} />
          <div className="flex rounded-lg overflow-hidden text-sm" style={{ border: "1px solid #d1d5db" }}>
            {(["all", "pending", "reviewed"] as const).map((f) => (
              <button key={f} onClick={() => setReviewFilter(f)} className="px-3 py-2"
                style={{ background: reviewFilter === f ? "#1f2937" : "#fff", color: reviewFilter === f ? "#fff" : "#374151" }}>
                {f === "all" ? `All (${totalSpots})` : f === "pending" ? `Pending (${totalSpots - reviewedCount})` : `Reviewed (${reviewedCount})`}
              </button>
            ))}
          </div>
        </div>

        {photoLoading ? (
          <div className="text-center py-20" style={{ color: "#9ca3af" }}>Loading...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {mergedSpots.map((spot) => {
              const photoUrl = photos.get(spot.name);
              const isEditing = editingSpot === spot.name;
              const isReviewed = statuses.get(spot.name)?.reviewed ?? false;
              const isHidden = statuses.get(spot.name)?.hidden ?? false;
              return (
                <div key={spot.id} className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                  <div className="aspect-square relative" style={{ background: "#f3f4f6" }}>
                    {photoUrl ? (
                      <img src={photoUrl} alt={spot.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center" style={{ color: "#9ca3af" }}>
                        <Image className="w-8 h-8 mb-1" /><span className="text-xs">No photo</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full" style={{ background: photoUrl ? "#22c55e" : "#f87171" }} />
                    {isReviewed && (
                      <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#22c55e" }}>
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold truncate" title={spot.name}>{spot.name}</p>
                    {isEditing ? (
                      <div className="mt-2 space-y-1.5">
                        <input type="text" placeholder="Paste image URL..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded" style={{ border: "1px solid #d1d5db" }} autoFocus />
                        <div className="flex gap-1">
                          <button onClick={() => handleReplacePhoto(spot.name, newUrl)} disabled={!newUrl.trim()}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-white" style={{ background: "#16a34a" }}>
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => { setEditingSpot(null); setNewUrl(""); }}
                            className="px-2 py-1 rounded text-xs" style={{ background: "#e5e7eb", color: "#374151" }}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-1">
                        <button onClick={() => { setEditingSpot(spot.name); setNewUrl(photoUrl || ""); }}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs" style={{ background: "#f3f4f6", color: "#374151" }}>
                          <Pencil className="w-3 h-3" /> {photoUrl ? "Replace" : "Add"}
                        </button>
                        {photoUrl && (
                          <button onClick={() => handleDeletePhoto(spot.name)}
                            className="px-2 py-1 rounded text-xs" style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => toggleReviewed(spot.name)}
                          className="px-2 py-1 rounded text-xs" style={{ background: isReviewed ? "#dcfce7" : "#f3f4f6", color: isReviewed ? "#166534" : "#6b7280" }}>
                          {isReviewed ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                        </button>
                        <button onClick={() => toggleHidden(spot.name)}
                          className="px-2 py-1 rounded text-xs" style={{ background: isHidden ? "#fee2e2" : "#f3f4f6", color: isHidden ? "#991b1b" : "#6b7280" }}>
                          {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
