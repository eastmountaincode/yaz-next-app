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
      title: "Paragraphs",
      type: "array",
      of: [defineArrayMember({ type: "text", rows: 5 })],
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
          type: "string",
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Bio" }),
  },
});
