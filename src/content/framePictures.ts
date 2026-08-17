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

export const stillsFramePicture: FramePicture = {
  id: "stills-something-dreadful",
  label: "Stills — Something Dreadful Is Going to Happen",
  src: "/image/stills_something_dreadful.jpg",
  aspect: 1,
  kind: "image-frame",
  defaultCaption: "Stills",
};

export const familyEasterBunnyPicture: FramePicture = {
  id: "family-easter-bunny",
  label: "Family — Easter Bunny",
  src: "/image/yaslynn_family_easter_bunny.jpg",
  aspect: 1683 / 2230,
  kind: "image-frame",
  defaultCaption: "",
};

export const familyLightTunnelPicture: FramePicture = {
  id: "family-light-tunnel",
  label: "Family — Light Tunnel",
  src: "/image/yaslynn_family_light_tunnel.jpg",
  aspect: 2331 / 3387,
  kind: "image-frame",
  defaultCaption: "",
};

export const familyFirstCommunionPicture: FramePicture = {
  id: "family-first-communion",
  label: "Family — First Communion",
  src: "/image/yaslynn_family_first_communion.jpg",
  aspect: 2333 / 3395,
  kind: "image-frame",
  defaultCaption: "",
};

export const familyCouchPortraitPicture: FramePicture = {
  id: "family-couch-portrait",
  label: "Family — Couch portrait",
  src: "/image/yaslynn_family_couch_portrait.jpg",
  aspect: 2400 / 1558,
  kind: "image-frame",
  defaultCaption: "",
};

export const snoopDoggClientsPicture: FramePicture = {
  id: "clients-snoop-dogg",
  label: "Clients — Snoop Dogg",
  src: "/image/snoop_dogg_clients.png",
  aspect: 1024 / 771,
  kind: "image-frame",
  defaultCaption: "Clients",
};

export const framePictures: FramePicture[] = [
  bioFramePicture,
  stillsFramePicture,
  snoopDoggClientsPicture,
  familyEasterBunnyPicture,
  familyLightTunnelPicture,
  familyFirstCommunionPicture,
  familyCouchPortraitPicture,
  familyFramePicture,
];
