import { ImageResponse } from "next/og";
import { getPortfolioContent } from "@/sanity/lib/portfolio";

export const alt = "Yaslynn Rivera — Director, Producer, and Writer";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const revalidate = 60;

export default async function OpenGraphImage() {
  const portfolio = await getPortfolioContent();

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
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Georgia, serif",
              fontSize: 82,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
            }}
          >
            Yaslynn Rivera
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "30px",
              fontFamily: "Arial, sans-serif",
              fontSize: 28,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Director · Producer · Writer
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
    size,
  );
}
