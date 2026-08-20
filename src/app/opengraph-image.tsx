import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getPortfolioContent } from "@/sanity/lib/portfolio";

export const alt = "Yaslynn Rivera";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const revalidate = 60;

export default async function OpenGraphImage() {
  const [portfolio, winkyFont] = await Promise.all([
    getPortfolioContent(),
    readFile(join(process.cwd(), "public/fonts/WinkyShowScript.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#f2eee5",
          color: "#15130f",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "58%",
            alignItems: "center",
            justifyContent: "center",
            padding: "72px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Yaz Winky Show",
              fontSize: 116,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            Yaslynn Rivera
          </div>
        </div>
        <div
          style={{
            display: "flex",
            width: "42%",
            height: "100%",
            overflow: "hidden",
            background: "#201b16",
          }}
        >
          {portfolio.bio.image ? (
            // ImageResponse renders regular image elements rather than next/image.
            <img
              src={portfolio.bio.image.url}
              alt=""
              width={504}
              height={630}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "50% 35%",
              }}
            />
          ) : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Yaz Winky Show",
          data: winkyFont,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
