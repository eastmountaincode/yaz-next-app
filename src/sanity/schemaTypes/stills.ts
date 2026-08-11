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
              description: "Square image shown for this artist in the Stills grid.",
              type: "image",
              options: { hotspot: true },
              validation: (rule) => rule.required(),
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
            },
            prepare: ({ title, coverImage }) => ({
              title,
              media: coverImage,
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
