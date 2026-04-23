import { ExternalLink, Zap, Search } from "lucide-react";
import { buildVendorDeliveryLinks } from "@/lib/deliveryLinks";

interface DeliveryOrderButtonsProps {
  spotName: string;
  address?: string;
}

/**
 * Big, glassmorphic delivery CTAs for the vendor detail page.
 * Each platform gets a primary deeplink + a "Find via Google" fallback because
 * Grab/Foodpanda search pages require a logged-in delivery address to render results.
 */
export function DeliveryOrderButtons({ spotName, address }: DeliveryOrderButtonsProps) {
  const links = buildVendorDeliveryLinks(spotName, address);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/50 backdrop-blur-xl p-4 shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.15)]">
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#D70F64]/10 blur-3xl" />

      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm leading-none">Order Delivery</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Tap to open the restaurant in app</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Grab */}
          <div className="space-y-1.5">
            <a
              href={links.grab}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl bg-[#00B14F] hover:bg-[#009A45] active:scale-[0.98] transition-all p-3.5 flex flex-col items-start gap-2 shadow-md hover:shadow-lg min-h-[88px]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15 pointer-events-none" />
              <div className="relative flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner">
                  <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="currentColor" aria-hidden="true">
                    <path d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm5.5 16.8c-.5 1.4-1.6 2.5-3 3-.7.2-1.4.4-2.2.4-1.5 0-3-.5-4.2-1.5-1.5-1.2-2.4-3-2.4-4.9 0-3.5 2.9-6.4 6.4-6.4 2 0 3.8.9 5 2.4l-2.1 1.7c-.7-.9-1.7-1.4-2.9-1.4-2 0-3.7 1.7-3.7 3.7 0 1.1.5 2.2 1.4 2.9.9.7 2 1 3.1.7 1.1-.3 1.9-1.1 2.2-2.2h-3.6v-2.5h6.5c.1.6.1 1.1 0 1.7-.1.8-.3 1.6-.5 2.4z" />
                  </svg>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-white/80 group-hover:text-white transition-colors" />
              </div>
              <div className="relative text-left">
                <p className="text-[10px] font-medium text-white/85 leading-none mb-1 uppercase tracking-wider">Order on</p>
                <p className="text-base font-extrabold text-white leading-none tracking-tight">GrabFood</p>
              </div>
            </a>
            <a
              href={links.grabGoogle}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-[#00B14F] transition-colors py-1"
            >
              <Search className="h-2.5 w-2.5" />
              Can't find it? Search Google
            </a>
          </div>

          {/* Foodpanda */}
          <div className="space-y-1.5">
            <a
              href={links.foodpanda}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl bg-[#D70F64] hover:bg-[#B80B53] active:scale-[0.98] transition-all p-3.5 flex flex-col items-start gap-2 shadow-md hover:shadow-lg min-h-[88px]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15 pointer-events-none" />
              <div className="relative flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner">
                  <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="currentColor" aria-hidden="true">
                    <path d="M16 5c-3.6 0-6.5 1.7-8.4 4.5C6.4 8.6 5 8 3.5 8 2.7 8 2 8.7 2 9.5c0 .3.1.6.3.9 1 1.4 2.5 2.3 4.2 2.6-.3 1-.5 2-.5 3 0 5.5 4.5 10 10 10s10-4.5 10-10c0-1-.2-2-.5-3 1.7-.3 3.2-1.2 4.2-2.6.2-.3.3-.6.3-.9 0-.8-.7-1.5-1.5-1.5-1.5 0-2.9.6-4.1 1.5C22.5 6.7 19.6 5 16 5zm-4 11c.8 0 1.5.7 1.5 1.5S12.8 19 12 19s-1.5-.7-1.5-1.5S11.2 16 12 16zm8 0c.8 0 1.5.7 1.5 1.5S20.8 19 20 19s-1.5-.7-1.5-1.5S19.2 16 20 16zm-4 3c1.7 0 3 1.1 3 2.5s-1.3 2.5-3 2.5-3-1.1-3-2.5 1.3-2.5 3-2.5z" />
                  </svg>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-white/80 group-hover:text-white transition-colors" />
              </div>
              <div className="relative text-left">
                <p className="text-[10px] font-medium text-white/85 leading-none mb-1 uppercase tracking-wider">Order on</p>
                <p className="text-base font-extrabold text-white leading-none tracking-tight">foodpanda</p>
              </div>
            </a>
            <a
              href={links.foodpandaGoogle}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-[#D70F64] transition-colors py-1"
            >
              <Search className="h-2.5 w-2.5" />
              Can't find it? Search Google
            </a>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/80 leading-relaxed text-center">
          Both apps require a delivery address to show results. We don't process orders.
        </p>
      </div>
    </div>
  );
}
