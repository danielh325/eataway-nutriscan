import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, Camera, X, CheckCircle2, MapPin, Loader2, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function SuggestVendorDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [menuImage, setMenuImage] = useState<File | null>(null);
  const [menuPreview, setMenuPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ verified: boolean; menuItemsCount: number } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setMenuImage(file);
      setMenuPreview(URL.createObjectURL(file));
    }
  }, []);

  const clearImage = () => {
    if (menuPreview) URL.revokeObjectURL(menuPreview);
    setMenuImage(null);
    setMenuPreview(null);
  };

  const resetForm = () => {
    setName("");
    setAddress("");
    setCuisine("");
    clearImage();
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !address.trim()) {
      toast({ title: "Missing info", description: "Please fill in the vendor name and address.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      let menuImageBase64: string | null = null;
      let menuImageMimeType: string | null = null;

      if (menuImage) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(menuImage);
        });
        menuImageBase64 = base64;
        menuImageMimeType = menuImage.type;
      }

      const { data, error } = await supabase.functions.invoke("submit-vendor", {
        body: {
          name: name.trim(),
          address: address.trim(),
          cuisine: cuisine.trim() || null,
          userId: user?.id || null,
          menuImageBase64,
          menuImageMimeType,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setResult({
        verified: data.verified,
        menuItemsCount: data.menuItemsCount,
      });

      toast({
        title: data.verified ? "✅ Vendor verified & added!" : "Submitted for review",
        description: data.verified
          ? `${name} was found on Google Maps and added with ${data.menuItemsCount} menu items.`
          : "We couldn't verify this vendor automatically. An admin will review it.",
      });
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Spot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Add a Healthy Food Spot
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-6 text-center space-y-4 animate-fade-in">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${result.verified ? "bg-green-100 dark:bg-green-950/40" : "bg-amber-100 dark:bg-amber-950/40"}`}>
              <CheckCircle2 className={`h-8 w-8 ${result.verified ? "text-green-600" : "text-amber-600"}`} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                {result.verified ? "Verified & Added!" : "Submitted for Review"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {result.verified
                  ? `${name} has been verified on Google Maps${result.menuItemsCount > 0 ? ` with ${result.menuItemsCount} menu items analyzed` : ""}.`
                  : "An admin will review and verify this spot."}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { resetForm(); }}>
                Add Another
              </Button>
              <Button size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">Restaurant Name *</Label>
              <Input
                id="vendor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SaladStop! (Fusionopolis)"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-address">Address *</Label>
              <Input
                id="vendor-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 1 Fusionopolis Way, Singapore"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-cuisine">Cuisine / Category</Label>
              <Input
                id="vendor-cuisine"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                placeholder="e.g. Salad Bar, High Protein, Halal"
                disabled={submitting}
              />
            </div>

            {/* Menu image upload */}
            <div className="space-y-2">
              <Label>Menu Photo (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Upload a photo of their menu and we'll auto-extract nutrition data
              </p>
              {menuPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={menuPreview} alt="Menu preview" className="w-full h-40 object-cover" />
                  {!submitting && (
                    <button
                      onClick={clearImage}
                      className="absolute top-2 right-2 p-1.5 bg-card/80 backdrop-blur border border-border rounded-full hover:bg-secondary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-muted-foreground/20 rounded-xl cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={submitting}
                  />
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">Tap to upload menu photo</span>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Camera</span>
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Gallery</span>
                  </div>
                </label>
              )}
            </div>

            <div className="bg-secondary/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">What happens next:</p>
              <p>1. We verify the restaurant on Google Maps</p>
              <p>2. Auto-fetch photos, ratings & hours</p>
              <p>3. {menuImage ? "Analyze your menu photo for nutrition data" : "Auto-discover menu & nutrition data"}</p>
              <p>4. Add it to the map for everyone!</p>
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full rounded-xl gap-2">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying & Analyzing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Submit & Verify
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
