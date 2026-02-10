import { Store, UtensilsCrossed, DollarSign, Scaling } from "lucide-react";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

interface RestaurantContextProps {
  context: RestaurantContextData;
}

export const RestaurantContext = ({ context }: RestaurantContextProps) => {
  if (!context) return null;

  const items = [
    { icon: Store, label: context.type },
    { icon: UtensilsCrossed, label: context.cuisine },
    { icon: Scaling, label: context.portion_style },
    { icon: DollarSign, label: context.price_tier },
  ].filter((item) => item.label);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ icon: Icon, label }, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-full text-xs border border-border"
        >
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="capitalize">{label}</span>
        </div>
      ))}
    </div>
  );
};
