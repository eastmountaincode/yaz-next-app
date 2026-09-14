import Image from "next/image";

export function StudioIcon() {
  return (
    <Image
      src="/image/goblet-icon.png"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}
