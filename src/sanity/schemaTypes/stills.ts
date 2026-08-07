import { defineArrayMember, defineField, defineType } from "sanity";

export const stillsType = defineType({
  name: "stills",
  title: "Stills",
  type: "document",
  fields: [
    defineField({
      name: "projects",
      title: "Projects",
      description: "Group images by project. Drag projects and images to reorder them.",
      type: "array",
      of: [
        defineArrayMember({
          name: "stillProject",
          title: "Project",
          type: "object",
          fields: [
            defineField({
              name: "title",
              title: "Project title",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "images",
              title: "Images",
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
            select: { title: "title", media: "images.0" },
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Stills" }),
  },
});
