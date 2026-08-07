import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Yaslynn Rivera")
    .items([
      S.listItem()
        .title("Portfolio Content")
        .id("portfolio")
        .child(S.document().schemaType("portfolio").documentId("portfolio")),
    ]);
