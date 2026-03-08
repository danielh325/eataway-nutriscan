import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DishData } from "@/components/DishCard";
import { format, startOfDay, endOfDay } from "date-fns";
import { Plus, Trash2, Target, TrendingUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface MealLog {
  id: string;
  dish_name: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string;
  portion_multiplier: number;
  logged_at: string;
}

interface DailyGoals {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface GoalBarProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
}

const GoalBar = ({ label, current, goal, unit, color }: GoalBarProps) => {
  const percentage = Math.min((current / goal) * 100, 100);
  const isOver = current > goal;

  const colorClasses: Record<string, string> = {
    foreground: "bg-foreground",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">
          <span className={isOver ? "text-destructive font-semibold" : ""}>{current}</span>
          <span className="text-muted-foreground"> / {goal} {unit}</span>
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-destructive" : colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export const DailyLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [goals, setGoals] = useState<DailyGoals>({ calories_kcal: 2000, protein_g: 150, carbs_g: 250, fat_g: 65 });
  const [editingGoals, setEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState(goals);
  const today = new Date();

  useEffect(() => {
    if (!user) return;
    fetchGoals();
    fetchTodayLogs();
  }, [user]);

  const fetchGoals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("daily_goals")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const g = { calories_kcal: data.calories_kcal, protein_g: data.protein_g, carbs_g: data.carbs_g, fat_g: data.fat_g };
      setGoals(g);
      setTempGoals(g);
    }
  };

  const fetchTodayLogs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("meal_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", startOfDay(today).toISOString())
      .lte("logged_at", endOfDay(today).toISOString())
      .order("logged_at", { ascending: false });
    if (data) setLogs(data as MealLog[]);
  };

  const saveGoals = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("daily_goals")
      .update(tempGoals)
      .eq("user_id", user.id);
    if (!error) {
      setGoals(tempGoals);
      setEditingGoals(false);
      toast({ title: "Goals Updated" });
    }
  };

  const deleteLog = async (id: string) => {
    await supabase.from("meal_logs").delete().eq("id", id);
    setLogs(prev => prev.filter(l => l.id !== id));
    toast({ title: "Entry Removed" });
  };

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories_kcal,
      protein: acc.protein + log.protein_g,
      carbs: acc.carbs + log.carbs_g,
      fat: acc.fat + log.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Date Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Daily Health Log</h2>
          <p className="text-xs text-muted-foreground font-mono">{format(today, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <button
          onClick={() => setEditingGoals(!editingGoals)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
        >
          <Target className="w-3.5 h-3.5" />
          {editingGoals ? "Cancel" : "Edit Goals"}
        </button>
      </div>

      {/* Goals Editor */}
      {editingGoals && (
        <div className="p-4 border-2 border-foreground rounded-xl space-y-4 animate-fade-in">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Daily Goals</p>
          {([
            { key: "calories_kcal" as const, label: "Calories", max: 4000, unit: "kcal" },
            { key: "protein_g" as const, label: "Protein", max: 300, unit: "g" },
            { key: "carbs_g" as const, label: "Carbs", max: 500, unit: "g" },
            { key: "fat_g" as const, label: "Fat", max: 200, unit: "g" },
          ]).map(({ key, label, max, unit }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>{label}</span>
                <span className="font-mono">{tempGoals[key]} {unit}</span>
              </div>
              <Slider
                value={[tempGoals[key]]}
                onValueChange={([v]) => setTempGoals(prev => ({ ...prev, [key]: v }))}
                min={0}
                max={max}
                step={key === "calories_kcal" ? 50 : 5}
              />
            </div>
          ))}
          <button
            onClick={saveGoals}
            className="w-full py-2 text-sm font-medium bg-foreground text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Save Goals
          </button>
        </div>
      )}

      {/* Progress Bars */}
      <div className="p-4 border-2 border-foreground rounded-xl space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4" />
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Today's Progress</p>
        </div>
        <GoalBar label="Calories" current={totals.calories} goal={goals.calories_kcal} unit="kcal" color="foreground" />
        <GoalBar label="Protein" current={totals.protein} goal={goals.protein_g} unit="g" color="success" />
        <GoalBar label="Carbs" current={totals.carbs} goal={goals.carbs_g} unit="g" color="warning" />
        <GoalBar label="Fat" current={totals.fat} goal={goals.fat_g} unit="g" color="destructive" />
      </div>

      {/* Meal Entries */}
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Logged Meals ({logs.length})
        </p>
        {logs.length === 0 ? (
          <div className="p-6 text-center border border-border rounded-xl">
            <p className="text-sm text-muted-foreground">No meals logged today.</p>
            <p className="text-xs text-muted-foreground mt-1">Scan a menu and save dishes to track them here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 border border-border rounded-xl hover:bg-secondary/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{log.dish_name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {log.calories_kcal} kcal • {log.protein_g}p • {log.carbs_g}c • {log.fat_g}f
                  </p>
                </div>
                <button
                  onClick={() => deleteLog(log.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
