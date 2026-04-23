import { ExternalLink } from "lucide-react";

interface DeliveryOrderButtonsProps {
  spotName: string;
  address?: string;
}

/**
 * Builds search-based deeplinks to Singapore's two major food delivery platforms.
 * Deliveroo exited the SG market in 2025, leaving Grab and Foodpanda as the duopoly.
 *
 * URL patterns verified:
 *  - Grab:      https://food.grab.com/sg/en/search?search={query}
 *  - Foodpanda: https://www.foodpanda.sg/restaurants/new?q={query}
 *
 * Search-based links are more reliable than slug-based ones because vendor
 * slugs differ across platforms and change over time.
 */
function buildLinks(spotName: string, address?: string) {
  const query = encodeURIComponent(spotName);
  // Foodpanda benefits from a postal code / area for accurate matches
  const fpQuery = address
    ? encodeURIComponent(`${spotName} ${address.split(",").pop()?.trim() ?? ""}`.trim())
    : query;

  return {
    grab: `https://food.grab.com/sg/en/search?search=${query}`,
    foodpanda: `https://www.foodpanda.sg/restaurants/new?q=${fpQuery}`,
  };
}

export function DeliveryOrderButtons({ spotName, address }: DeliveryOrderButtonsProps) {
  const links = buildLinks(spotName, address);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Order Delivery</h3>
        <span className="text-[10px] text-muted-foreground">Opens in delivery app</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Grab - Brand green #00B14F */}
        <a
          href={links.grab}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative overflow-hidden rounded-xl bg-[#00B14F] hover:bg-[#009A45] transition-colors p-3 flex items-center gap-2.5 shadow-sm hover:shadow-md"
        >
          <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            {/* Grab logo - stylized G */}
            <svg viewBox="0 0 32 32" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
              <path d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm5.5 16.8c-.5 1.4-1.6 2.5-3 3-.7.2-1.4.4-2.2.4-1.5 0-3-.5-4.2-1.5-1.5-1.2-2.4-3-2.4-4.9 0-3.5 2.9-6.4 6.4-6.4 2 0 3.8.9 5 2.4l-2.1 1.7c-.7-.9-1.7-1.4-2.9-1.4-2 0-3.7 1.7-3.7 3.7 0 1.1.5 2.2 1.4 2.9.9.7 2 1 3.1.7 1.1-.3 1.9-1.1 2.2-2.2h-3.6v-2.5h6.5c.1.6.1 1.1 0 1.7-.1.8-.3 1.6-.5 2.4z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-medium text-white/80 leading-none mb-0.5">Order on</p>
            <p className="text-sm font-bold text-white leading-tight">GrabFood</p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-white/70 group-hover:text-white transition-colors shrink-0" />
        </a>

        {/* Foodpanda - Brand pink #D70F64 */}
        <a
          href={links.foodpanda}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative overflow-hidden rounded-xl bg-[#D70F64] hover:bg-[#B80B53] transition-colors p-3 flex items-center gap-2.5 shadow-sm hover:shadow-md"
        >
          <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            {/* Foodpanda logo - panda silhouette */}
            <svg viewBox="0 0 32 32" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
              <path d="M16 5c-3.6 0-6.5 1.7-8.4 4.5C6.4 8.6 5 8 3.5 8 2.7 8 2 8.7 2 9.5c0 .3.1.6.3.9 1 1.4 2.5 2.3 4.2 2.6-.3 1-.5 2-.5 3 0 5.5 4.5 10 10 10s10-4.5 10-10c0-1-.2-2-.5-3 1.7-.3 3.2-1.2 4.2-2.6.2-.3.3-.6.3-.9 0-.8-.7-1.5-1.5-1.5-1.5 0-2.9.6-4.1 1.5C22.5 6.7 19.6 5 16 5zm-4 11c.8 0 1.5.7 1.5 1.5S12.8 19 12 19s-1.5-.7-1.5-1.5S11.2 16 12 16zm8 0c.8 0 1.5.7 1.5 1.5S20.8 19 20 19s-1.5-.7-1.5-1.5S19.2 16 20 16zm-4 3c1.7 0 3 1.1 3 2.5s-1.3 2.5-3 2.5-3-1.1-3-2.5 1.3-2.5 3-2.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-medium text-white/80 leading-none mb-0.5">Order on</p>
            <p className="text-sm font-bold text-white leading-tight">foodpanda</p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-white/70 group-hover:text-white transition-colors shrink-0" />
        </a>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        We don't process orders — you'll be taken to the delivery app to complete your purchase.
      </p>
    </div>
  );
}
