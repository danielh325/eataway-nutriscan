import { buildDishDeliveryLinks } from "@/lib/deliveryLinks";

interface DishOrderLinksProps {
  spotName: string;
  dishName: string;
}

/**
 * Compact per-dish order chips. Tapping searches Grab/Foodpanda for
 * "{vendor} {dish}" — matches won't always be exact but get the user
 * to the right vendor's menu where they can find the dish.
 */
export function DishOrderLinks({ spotName, dishName }: DishOrderLinksProps) {
  const links = buildDishDeliveryLinks(spotName, dishName);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <span className="text-[10px] text-muted-foreground font-medium">Order:</span>
      <a
        href={links.grab}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#00B14F] hover:bg-[#009A45] text-white text-[10px] font-semibold transition-colors shadow-sm"
        aria-label={`Order ${dishName} on GrabFood`}
      >
        <svg viewBox="0 0 32 32" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          <path d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm5.5 16.8c-.5 1.4-1.6 2.5-3 3-.7.2-1.4.4-2.2.4-1.5 0-3-.5-4.2-1.5-1.5-1.2-2.4-3-2.4-4.9 0-3.5 2.9-6.4 6.4-6.4 2 0 3.8.9 5 2.4l-2.1 1.7c-.7-.9-1.7-1.4-2.9-1.4-2 0-3.7 1.7-3.7 3.7 0 1.1.5 2.2 1.4 2.9.9.7 2 1 3.1.7 1.1-.3 1.9-1.1 2.2-2.2h-3.6v-2.5h6.5c.1.6.1 1.1 0 1.7-.1.8-.3 1.6-.5 2.4z" />
        </svg>
        Grab
      </a>
      <a
        href={links.foodpanda}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D70F64] hover:bg-[#B80B53] text-white text-[10px] font-semibold transition-colors shadow-sm"
        aria-label={`Order ${dishName} on foodpanda`}
      >
        <svg viewBox="0 0 32 32" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          <path d="M16 5c-3.6 0-6.5 1.7-8.4 4.5C6.4 8.6 5 8 3.5 8 2.7 8 2 8.7 2 9.5c0 .3.1.6.3.9 1 1.4 2.5 2.3 4.2 2.6-.3 1-.5 2-.5 3 0 5.5 4.5 10 10 10s10-4.5 10-10c0-1-.2-2-.5-3 1.7-.3 3.2-1.2 4.2-2.6.2-.3.3-.6.3-.9 0-.8-.7-1.5-1.5-1.5-1.5 0-2.9.6-4.1 1.5C22.5 6.7 19.6 5 16 5zm-4 11c.8 0 1.5.7 1.5 1.5S12.8 19 12 19s-1.5-.7-1.5-1.5S11.2 16 12 16zm8 0c.8 0 1.5.7 1.5 1.5S20.8 19 20 19s-1.5-.7-1.5-1.5S19.2 16 20 16zm-4 3c1.7 0 3 1.1 3 2.5s-1.3 2.5-3 2.5-3-1.1-3-2.5 1.3-2.5 3-2.5z" />
        </svg>
        panda
      </a>
    </div>
  );
}
