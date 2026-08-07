import { defineArrayMember, defineField, defineType } from "sanity";

export const clientsType = defineType({
  name: "clients",
  title: "Clients",
  type: "document",
  fields: [
    defineField({
      name: "items",
      title: "Clients",
      description: "Drag clients and projects to change their order on the site.",
      type: "array",
      of: [
        defineArrayMember({
          name: "client",
          title: "Client",
          type: "object",
          fields: [
            defineField({
              name: "name",
              title: "Name",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "projects",
              title: "Projects",
              type: "array",
              of: [
                defineArrayMember({
                  name: "project",
                  title: "Project",
                  type: "object",
                  fields: [
                    defineField({
                      name: "title",
                      title: "Title",
                      type: "string",
                      validation: (rule) => rule.required(),
                    }),
                    defineField({
                      name: "slug",
                      title: "Internal slug",
                      type: "slug",
                      options: { source: "title" },
                      validation: (rule) => rule.required(),
                    }),
                    defineField({
                      name: "videoUrl",
                      title: "Vimeo or YouTube URL",
                      type: "url",
                      validation: (rule) => rule.required(),
                    }),
                  ],
                  preview: {
                    select: { title: "title" },
                  },
                }),
              ],
            }),
          ],
          preview: {
            select: { title: "name" },
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Clients" }),
  },
});
