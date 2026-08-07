import { defineArrayMember, defineField, defineType } from "sanity";

const initialClients = [
  {
    _key: "snoop-dogg",
    _type: "client",
    name: "Snoop Dogg",
    projects: [
      {
        _key: "ten-til-midnight",
        _type: "project",
        title: "Ten Til Midnight",
        slug: { _type: "slug", current: "snoop-ten-til-midnight" },
        videoUrl: "https://www.youtube.com/watch?v=DKIgoOVF914",
      },
    ],
  },
  {
    _key: "blk-odyssy",
    _type: "client",
    name: "BLK ODYSSY",
    projects: [
      {
        _key: "possessed",
        _type: "project",
        title: "POSSESSED",
        slug: { _type: "slug", current: "blk-odyssy-possessed" },
        videoUrl: "https://www.youtube.com/watch?v=m1NGoBFtC-g",
      },
      {
        _key: "saturday",
        _type: "project",
        title: "SATURDAY",
        slug: { _type: "slug", current: "blk-odyssy-saturday" },
        videoUrl: "https://www.youtube.com/watch?v=EB4VqICMUow",
      },
      {
        _key: "nativity-of-chaos",
        _type: "project",
        title: "THE NATIVITY OF CHAOS",
        slug: { _type: "slug", current: "blk-odyssy-nativity-of-chaos" },
        videoUrl: "https://www.youtube.com/watch?v=Snvh_8xWehI",
      },
      {
        _key: "mood-control",
        _type: "project",
        title: "MOOD CONTROL",
        slug: { _type: "slug", current: "blk-odyssy-mood-control" },
        videoUrl: "https://www.youtube.com/watch?v=893PEdU4_eY",
      },
    ],
  },
  {
    _key: "dani-offline",
    _type: "client",
    name: "Dani Offline",
    projects: [
      {
        _key: "angel",
        _type: "project",
        title: "Angel",
        slug: { _type: "slug", current: "dani-offline-angel" },
        videoUrl: "https://www.youtube.com/watch?v=C9tFqe4EGEY",
      },
    ],
  },
];

export const portfolioType = defineType({
  name: "portfolio",
  title: "Portfolio Content",
  type: "document",
  initialValue: {
    directorReelUrl: "https://vimeo.com/1211833348",
    bioHeading: "Yaslynn Rivera",
    bioBody: [
      "Yaslynn Rivera is a director, producer, and writer drawn to the surreal and the sacred. Her work in film, television, music video, and live performance threads a set of preoccupations: dark comedy, morality, mysticism, and ancestral memory.",
      "The past year has seen her co-write and direct 10 Til Midnight for Snoop Dogg and direct the Late Bloomer visual album for King Isis (Dirty Hit). Additional recent directing credits include projects with Blk Odyssy (Empire) and Dani Offline, and she is a recipient of the Panavision New Filmmaker Program Grant. She is currently preparing to direct her first narrative pilot, written by a Sundance Semi-Finalist - her next step into long-form storytelling.",
      "Queer, iconoclastic, and raised in a spiritual Puerto Rican household, Yaslynn trained at Emerson College and cut her teeth on set before spending the past several years inside the rooms that shape American television. Stops at Netflix, CBS, and Sony led to the production team at Apple TV+, where she has worked on over a dozen Emmy-nominated series and helped launch the studio's Directors Mid-Career Mentoring Program. Her own work aims outside the boundaries. Pulling indelible frames from strange, old films, and building worlds where the line between faith and delusion is nearly impossible to divine.",
    ],
    clients: initialClients,
    stillProjects: [
      {
        _key: "something-dreadful",
        _type: "stillProject",
        title: "Something Dreadful Is Going to Happen",
        images: [],
      },
    ],
  },
  fields: [
    defineField({
      name: "directorReelUrl",
      title: "Director's Reel — Vimeo URL",
      type: "url",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "bioHeading",
      title: "Bio heading",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "bioBody",
      title: "Bio paragraphs",
      type: "array",
      of: [defineArrayMember({ type: "text", rows: 5 })],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "bioImage",
      title: "Bio image",
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
      name: "clients",
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
    defineField({
      name: "stillProjects",
      title: "Stills",
      description: "Group images by project. Drag projects and images to reorder them.",
      type: "array",
      of: [
        defineArrayMember({
          name: "stillProject",
          title: "Still project",
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
    prepare: () => ({ title: "Portfolio Content" }),
  },
});
