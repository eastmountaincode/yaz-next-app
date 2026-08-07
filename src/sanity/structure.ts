import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Yaslynn Rivera")
    .items([
      S.listItem()
        .title("Director's Reel")
        .id("director-reel")
        .child(
          S.document()
            .title("Director's Reel")
            .schemaType("directorReel")
            .documentId("director-reel"),
        ),
      S.listItem()
        .title("Bio")
        .id("bio")
        .child(S.document().title("Bio").schemaType("bio").documentId("bio")),
      S.listItem()
        .title("Clients")
        .id("clients")
        .child(
          S.document().title("Clients").schemaType("clients").documentId("clients"),
        ),
      S.listItem()
        .title("Stills")
        .id("stills")
        .child(S.document().title("Stills").schemaType("stills").documentId("stills")),
    ]);
