import { defineArrayMember, defineField, defineType } from "sanity";

export const stillsType = defineType({
  name: "stills",
  title: "Stills",
  type: "document",
  fields: [
    defineField({
      name: "artists",
      title: "Artists",
      description: "Group stills by artist. Drag artists and images to reorder them.",
      type: "array",
      of: [
        defineArrayMember({
          name: "stillArtist",
          title: "Artist",
          type: "object",
          fields: [
            defineField({
              name: "name",
              title: "Artist name",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "coverImage",
              title: "Cover image",
              description:
                "Optional square image for the artist grid. The first still is used when this is empty.",
              type: "image",
              options: { hotspot: true },
              fields: [
                defineField({
                  name: "alt",
                  title: "Alternative text",
                  type: "string",
                }),
              ],
            }),
            defineField({
              name: "images",
              title: "Stills",
              type: "array",
              options: { layout: "grid" },
              of: [
                defineArrayMember({
                  type: "image",
                  options: { hotspot: true },
                  fields: [
                    defineField({
                      name: "alt",
                      title: "Alternative text",
                      type: "string",
                    }),
                  ],
                }),
              ],
            }),
          ],
          preview: {
            select: {
              title: "name",
              coverImage: "coverImage",
              firstImage: "images.0",
            },
            prepare: ({ title, coverImage, firstImage }) => ({
              title,
              media: coverImage ?? firstImage,
            }),
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Stills" }),
  },
});
