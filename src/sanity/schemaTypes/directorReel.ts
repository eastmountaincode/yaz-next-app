import { defineField, defineType } from "sanity";

export const directorReelType = defineType({
  name: "directorReel",
  title: "Director's Reel",
  type: "document",
  fields: [
    defineField({
      name: "videoUrl",
      title: "Vimeo URL",
      type: "url",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    prepare: () => ({ title: "Director's Reel" }),
  },
});
