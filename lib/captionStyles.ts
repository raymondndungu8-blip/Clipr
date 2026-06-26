// Caption styles the user can pick for their clips. `accent` drives the
// highlighted/active word (karaoke) and the caption pill colour everywhere
// (preview + rendered MP4).

export type CaptionStyleName =
  | "Karaoke Green"
  | "Gold Pop"
  | "Classic White"
  | "Fire Red"
  | "Ice Blue"
  | "Hype Yellow";

export interface CaptionStyle {
  name: CaptionStyleName;
  accent: string;
}

export const CAPTION_STYLES: CaptionStyle[] = [
  { name: "Karaoke Green", accent: "#22e06a" },
  { name: "Gold Pop", accent: "#C9A84C" },
  { name: "Classic White", accent: "#FFFFFF" },
  { name: "Fire Red", accent: "#E05A5A" },
  { name: "Ice Blue", accent: "#3d7bff" },
  { name: "Hype Yellow", accent: "#F5D90A" },
];

export const DEFAULT_CAPTION_STYLE: CaptionStyleName = "Karaoke Green";

export function accentForStyle(name?: string | null): string {
  return CAPTION_STYLES.find((s) => s.name === name)?.accent ?? "#22e06a";
}
