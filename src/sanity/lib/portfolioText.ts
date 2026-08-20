import type { PortableTextBlock } from "@portabletext/react";

export const SITE_NAME = "Yaslynn Rivera";
export const SITE_URL = "https://www.yaslynnrivera.com";
export const FALLBACK_DESCRIPTION =
  "Yaslynn Rivera is a director, producer, and writer drawn to the surreal and the sacred.";

export function portableTextToPlainText(blocks: PortableTextBlock[]): string {
  return blocks
    .map((block) => {
      if (block._type !== "block" || !Array.isArray(block.children)) {
        return "";
      }

      return block.children
        .map((child) => (typeof child.text === "string" ? child.text : ""))
        .join("");
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getBioSummary(blocks: PortableTextBlock[]): string {
  const bioText = portableTextToPlainText(blocks);
  if (!bioText) {
    return FALLBACK_DESCRIPTION;
  }

  const firstSentence = bioText.match(/^.*?[.!?](?=\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= 180) {
    return firstSentence;
  }

  if (bioText.length <= 180) {
    return bioText;
  }

  const shortened = bioText.slice(0, 177);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 120 ? lastSpace : 177).trim()}…`;
}
