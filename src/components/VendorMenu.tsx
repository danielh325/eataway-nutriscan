import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Utensils, Flame, Beef, Wheat, Droplets, RefreshCw, Star, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MenuItem {
  id: string;
  dish_name: string;
  description: string | null;
  price: string | null;
  category: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: string;
  ingredients: string[] | null;
  is_popular: boolean;
  image_url: string | null;
}

interface VendorMenuProps {
  spotName: string;
  address?: string;
  menuHighlights?: string[];
}

const CATEGORY_ORDER = ["Main", "Bowl", "Salad", "Wrap", "Side", "Snack", "Drink", "Dessert"];

function MacroPill({ icon: Icon, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-[11px] font-semibold text-foreground">{value}g</span>
      <span className="text-[10px] text-muted-foreground hidden sm:inline">{label}</span>
    </div>
  );
}

export function VendorMenu({ spotName, address, menuHighlights }: VendorMenuProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const loadFromDB = useCallback(async () => {
    const { data } = await supabase
      .from("vendor_menu_items")
      .select("*")
      .eq("spot_name", spotName);
    if (data && data.length > 0) {
      setItems(data.map((item: any) => ({
        ...item,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      })));
      return true;
    }
    return false;
  }, [spotName]);

  const discoverMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("discover-vendor-menu", {
        body: { spotName, address, menuHighlights, forceRefresh: true },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      const menuItems = (data?.items || []).map((item: any) => ({
        ...item,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      }));
      setItems(menuItems);
    } catch (e: any) {
      console.error("Menu fetch error:", e);
      setError(e?.message || "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, [spotName, address, menuHighlights]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const categories = ["All", ...CATEGORY_ORDER.filter((cat) => items.some((i) => i.category === cat))];
  const filtered = activeCategory === "All" ? items : items.filter((i) => i.category === activeCategory);
  const popular = items.filter((i) => i.is_popular);

  if (loading) {
    return (
      <div className="py-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Discovering menu...</p>
            <p className="text-xs text-muted-foreground">Researching {spotName} for nutrition data</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchMenu(true)} className="rounded-xl gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">No menu data available yet.</p>
        <Button variant="outline" size="sm" onClick={() => fetchMenu(true)} className="mt-3 rounded-xl gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Discover Menu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          Menu ({items.length} items)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchMenu(true)}
          className="text-xs text-muted-foreground hover:text-foreground rounded-lg h-8 gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Popular picks */}
      {popular.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">🔥 Popular</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {popular.map((item) => (
              <button
                key={item.id}
                onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                className="shrink-0 w-[160px] rounded-xl border border-border/50 bg-card p-2.5 text-left hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight flex-1">{item.dish_name}</p>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0 ml-1" />
                </div>
                {item.price && <p className="text-xs font-bold text-primary mb-1">{item.price}</p>}
                <div className="flex items-center gap-1.5">
                  <Flame className="h-2.5 w-2.5 text-orange-500" />
                  <span className="text-[10px] font-semibold text-foreground">{item.calories_kcal} kcal</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat} {cat !== "All" ? `(${items.filter((i) => i.category === cat).length})` : ""}
          </button>
        ))}
      </div>

      {/* Menu items */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const isExpanded = expandedItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setExpandedItem(isExpanded ? null : item.id)}
              className="w-full text-left rounded-xl border border-border/40 bg-card overflow-hidden hover:border-primary/20 transition-all"
            >
              <div className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h4 className="text-sm font-semibold text-foreground truncate">{item.dish_name}</h4>
                      {item.is_popular && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1.5">{item.description}</p>
                    )}
                    <div className="flex items-center gap-3">
                      {item.price && <span className="text-xs font-bold text-primary">{item.price}</span>}
                      <div className="flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-500" />
                        <span className="text-[11px] font-semibold text-foreground">{item.calories_kcal} kcal</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 h-4 ${
                          item.confidence === "high"
                            ? "border-green-500/30 text-green-600"
                            : item.confidence === "medium"
                            ? "border-amber-500/30 text-amber-600"
                            : "border-red-500/30 text-red-500"
                        }`}
                      >
                        {item.confidence}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-3 animate-fade-in">
                    {/* Macros bar */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                        <p className="text-sm font-bold text-orange-600">{item.calories_kcal}</p>
                        <p className="text-[10px] text-muted-foreground">kcal</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <p className="text-sm font-bold text-blue-600">{item.protein_g}g</p>
                        <p className="text-[10px] text-muted-foreground">protein</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                        <p className="text-sm font-bold text-amber-600">{item.carbs_g}g</p>
                        <p className="text-[10px] text-muted-foreground">carbs</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30">
                        <p className="text-sm font-bold text-rose-600">{item.fat_g}g</p>
                        <p className="text-[10px] text-muted-foreground">fat</p>
                      </div>
                    </div>

                    {/* Macro bar visual */}
                    <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                      {(() => {
                        const total = item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;
                        if (total === 0) return null;
                        const proteinPct = ((item.protein_g * 4) / total) * 100;
                        const carbsPct = ((item.carbs_g * 4) / total) * 100;
                        const fatPct = ((item.fat_g * 9) / total) * 100;
                        return (
                          <>
                            <div className="bg-blue-500 h-full" style={{ width: `${proteinPct}%` }} />
                            <div className="bg-amber-500 h-full" style={{ width: `${carbsPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${fatPct}%` }} />
                          </>
                        );
                      })()}
                    </div>

                    {/* Ingredients */}
                    {item.ingredients && item.ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.ingredients.slice(0, 8).map((ing, j) => (
                          <span
                            key={j}
                            className="text-[10px] px-2 py-0.5 bg-secondary rounded-full text-muted-foreground"
                          >
                            {ing}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
