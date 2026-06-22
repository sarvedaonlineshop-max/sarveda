/** Standard Sarveda carton sizes (L × B × H cm) — selectable in admin shipment box UI. */
export type ShipBoxPreset = {
  id: string;
  label: string;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export const SHIP_BOX_PRESETS: ShipBoxPreset[] = [
  { id: "20x13x5", label: "20 × 13 × 5 cm", lengthCm: 20, breadthCm: 13, heightCm: 5 },
  { id: "25x15x10", label: "25 × 15 × 10 cm", lengthCm: 25, breadthCm: 15, heightCm: 10 },
  { id: "25x20x13", label: "25 × 20 × 13 cm", lengthCm: 25, breadthCm: 20, heightCm: 13 },
  { id: "28x23x13", label: "28 × 23 × 13 cm", lengthCm: 28, breadthCm: 23, heightCm: 13 },
  { id: "45x45x30", label: "45 × 45 × 30 cm", lengthCm: 45, breadthCm: 45, heightCm: 30 },
  { id: "45x35x35", label: "45 × 35 × 35 cm", lengthCm: 45, breadthCm: 35, heightCm: 35 },
  { id: "35x35x25", label: "35 × 35 × 25 cm", lengthCm: 35, breadthCm: 35, heightCm: 25 },
  { id: "75x12x12", label: "75 × 12 × 12 cm", lengthCm: 75, breadthCm: 12, heightCm: 12 },
  { id: "80x45x25", label: "80 × 45 × 25 cm", lengthCm: 80, breadthCm: 45, heightCm: 25 },
  { id: "80x25x25", label: "80 × 25 × 25 cm", lengthCm: 80, breadthCm: 25, heightCm: 25 }
];

export const DEFAULT_SHIP_BOX_PRESET = SHIP_BOX_PRESETS[0];
