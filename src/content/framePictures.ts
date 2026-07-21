export type FramePicture = {
  id: string;
  label: string;
  src: string;
  aspect: number;
  kind: "bio-frame" | "image-frame";
  defaultCaption: string;
  bioSlug?: "yaslynn";
};

export const bioFramePicture: FramePicture = {
  id: "yaslynn-bio",
  label: "Yaslynn Rivera — Bio portrait",
  src: "/image/yaz_headshot.jpeg",
  aspect: 2023 / 3051,
  kind: "bio-frame",
  defaultCaption: "Bio",
  bioSlug: "yaslynn",
};

export const familyFramePicture: FramePicture = {
  id: "family-portrait",
  label: "Family portrait",
  src: "/image/family_portrait.jpg",
  aspect: 1206 / 826,
  kind: "image-frame",
  defaultCaption: "",
};

export const framePictures: FramePicture[] = [bioFramePicture, familyFramePicture];
