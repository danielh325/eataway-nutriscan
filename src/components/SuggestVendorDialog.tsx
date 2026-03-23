import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function SuggestVendorDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!name.trim() || !address.trim()) {
      toast({ title: "Missing info", description: "Please fill in the vendor name and address.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("vendor_suggestions" as any).insert({
        name: name.trim(),
        address: address.trim(),
        cuisine: cuisine.trim() || null,
        suggested_by: user?.id || null,
      });

      if (error) throw error;

      toast({ title: "Thanks!", description: "Your vendor suggestion has been submitted for review." });
      setName("");
      setAddress("");
      setCuisine("");
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Suggest Vendor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suggest a Healthy Food Spot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="vendor-name">Vendor Name *</Label>
            <Input id="vendor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SaladStop! (Fusionopolis)" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-address">Address *</Label>
            <Input id="vendor-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 1 Fusionopolis Way, Singapore" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-cuisine">Cuisine / Category</Label>
            <Input id="vendor-cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g. Salad Bar, High Protein, Halal" />
          </div>
          <Button onClick={handleSubmit} disabled={submitting} className="w-full rounded-xl">
            {submitting ? "Submitting..." : "Submit Suggestion"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
