import { useState, useCallback } from "react";
import { Upload, Camera, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuUploaderProps {
  onImageUpload: (file: File) => void;
  isProcessing: boolean;
}

export const MenuUploader = ({ onImageUpload, isProcessing }: MenuUploaderProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        setPreview(URL.createObjectURL(file));
        onImageUpload(file);
      }
    },
    [onImageUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setPreview(URL.createObjectURL(file));
        onImageUpload(file);
      }
    },
    [onImageUpload]
  );

  const clearPreview = () => {
    setPreview(null);
  };

  if (preview) {
    return (
      <div className="relative w-full animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <img
            src={preview}
            alt="Menu preview"
            className="w-full h-auto max-h-[400px] object-contain bg-secondary"
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="font-mono text-sm tracking-wide text-primary">ANALYZING MENU...</p>
              </div>
            </div>
          )}
          {!isProcessing && (
            <button
              onClick={clearPreview}
              className="absolute top-3 right-3 p-2 bg-card/80 backdrop-blur border border-border rounded-full hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "relative w-full border-2 border-dashed rounded-lg p-12 transition-all duration-300 cursor-pointer group",
        isDragOver
          ? "border-foreground bg-secondary"
          : "border-muted-foreground/30 hover:border-foreground hover:bg-secondary/50"
      )}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-primary-foreground transition-colors">
            <Upload className="w-8 h-8" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-medium tracking-tight">
            Drop your menu photo here
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse • PNG, JPG, HEIC
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Camera className="w-4 h-4" />
            Camera supported
          </span>
          <span className="flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4" />
            Any resolution
          </span>
        </div>
      </div>
    </div>
  );
};
