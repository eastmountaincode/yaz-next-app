import { defineArrayMember, defineField, defineType } from "sanity";

export const bioType = defineType({
  name: "bio",
  title: "Bio",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "body",
      title: "Bio text",
      type: "array",
      of: [
        defineArrayMember({
          type: "block",
          styles: [{ title: "Normal", value: "normal" }],
          lists: [],
          marks: {
            decorators: [],
            annotations: [
              {
                name: "link",
                title: "Link",
                type: "object",
                fields: [
                  defineField({
                    name: "href",
                    title: "URL",
                    type: "url",
                    validation: (rule) =>
                      rule.required().uri({ scheme: ["http", "https", "mailto"] }),
                  }),
                ],
              },
            ],
          },
        }),
      ],
      description: "Highlight text and use the link button to add or edit a link.",
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "image",
      title: "Portrait",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alternative text",
          description: "Describe the image for people using screen readers.",
          type: "string",
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Bio" }),
  },
});
