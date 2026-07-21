export type WorkItem = {
  slug: string;
  title: string;
  artist: string;
  credit: string;
  roles: string[];
  sourceTitle: string;
  projectType: string;
  modalDescription: string;
  sourceUrl: string;
  clipSrc: string;
  clipStartSeconds: number;
  clipDurationSeconds: number;
  // Timestamp (seconds) of the canonical "still" frame for the clip. The
  // gallery shows this frame as a poster when the clip is idle and seeks back
  // to it whenever the hover crossfade completes. Defaults to 0 when omitted.
  posterTime?: number;
};

export const works: WorkItem[] = [
  {
    slug: "snoop-ten-til-midnight",
    title: "Ten Til Midnight",
    artist: "Snoop Dogg",
    credit: "Cowritten and directed",
    roles: ["Co-writer", "Director"],
    sourceTitle: "Snoop Dogg - Ten Til Midnight",
    projectType: "Music video",
    modalDescription:
      "A music video project for Snoop Dogg, with Yaslynn's contribution spanning both the writing and direction of the piece.",
    sourceUrl: "https://www.youtube.com/watch?v=DKIgoOVF914",
    clipSrc: "/work-clips/snoop-ten-til-midnight.mp4",
    clipStartSeconds: 5,
    clipDurationSeconds: 10,
  },
  {
    slug: "dani-offline-angel",
    title: "Angel (Official Video)",
    artist: "Dani Offline",
    credit: "Directed and produced",
    roles: ["Director", "Producer"],
    sourceTitle: "Dani Offline - Angel (Official Video)",
    projectType: "Official video",
    modalDescription:
      "A directed and produced music video for Dani Offline, built around Yaslynn's visual approach to performance, mood, and atmosphere.",
    sourceUrl: "https://www.youtube.com/watch?v=C9tFqe4EGEY",
    clipSrc: "/work-clips/dani-offline-angel.mp4",
    clipStartSeconds: 20,
    clipDurationSeconds: 10,
  },
  {
    slug: "blk-odyssy-possessed",
    title: "POSSESSED (Official Visualizer)",
    artist: "BLK ODYSSY",
    credit: "Directed, produced, and choreographed",
    roles: ["Director", "Producer", "Choreographer"],
    sourceTitle: "BLK ODYSSY - POSSESSED (Official Visualizer)",
    projectType: "Official visualizer",
    modalDescription:
      "One of Yaslynn's BLK ODYSSY visualizer collaborations, with her role extending across direction, production, and choreography.",
    sourceUrl: "https://www.youtube.com/watch?v=m1NGoBFtC-g",
    clipSrc: "/work-clips/blk-odyssy-possessed.mp4",
    clipStartSeconds: 70,
    clipDurationSeconds: 10,
  },
  {
    slug: "blk-odyssy-saturday",
    title: "SATURDAY (Official Visualizer)",
    artist: "BLK ODYSSY",
    credit: "Directed and produced",
    roles: ["Director", "Producer"],
    sourceTitle: "BLK ODYSSY - SATURDAY (Official Visualizer)",
    projectType: "Official visualizer",
    modalDescription:
      "A BLK ODYSSY visualizer directed and produced by Yaslynn as part of a larger body of music-driven moving-image work.",
    sourceUrl: "https://www.youtube.com/watch?v=EB4VqICMUow",
    clipSrc: "/work-clips/blk-odyssy-saturday.mp4",
    clipStartSeconds: 20,
    clipDurationSeconds: 10,
  },
  {
    slug: "blk-odyssy-nativity-of-chaos",
    title: "THE NATIVITY OF CHAOS (Official Visualizer)",
    artist: "BLK ODYSSY",
    credit: "Directed and produced",
    roles: ["Director", "Producer"],
    sourceTitle: "BLK ODYSSY - THE NATIVITY OF CHAOS (Official Visualizer)",
    projectType: "Official visualizer",
    modalDescription:
      "A BLK ODYSSY visualizer directed and produced by Yaslynn, sitting within the same visual language as her other work with the artist.",
    sourceUrl: "https://www.youtube.com/watch?v=Snvh_8xWehI",
    clipSrc: "/work-clips/blk-odyssy-nativity-of-chaos.mp4",
    clipStartSeconds: 20,
    clipDurationSeconds: 10,
  },
  {
    slug: "blk-odyssy-mood-control",
    title: "MOOD CONTROL (Official Visualizer)",
    artist: "BLK ODYSSY",
    credit: "Directed and produced",
    roles: ["Director", "Producer"],
    sourceTitle: "BLK ODYSSY - MOOD CONTROL (Official Visualizer)",
    projectType: "Official visualizer",
    modalDescription:
      "A BLK ODYSSY visualizer directed and produced by Yaslynn, connecting performance and atmosphere within the artist's visual world.",
    sourceUrl: "https://www.youtube.com/watch?v=893PEdU4_eY",
    clipSrc: "/work-clips/blk-odyssy-mood-control.mp4",
    clipStartSeconds: 20,
    clipDurationSeconds: 10,
  },
];

export const yaslynnBio = [
  "Yaslynn Rivera is a director, producer, and writer drawn to the surreal and the sacred. Her work in film, television, music video, and live performance threads a set of preoccupations: dark comedy, morality, mysticism, and ancestral memory.",
  "The past year has seen her co-write and direct 10 Til Midnight for Snoop Dogg and direct the Late Bloomer visual album for King Isis (Dirty Hit). Additional recent directing credits include projects with Blk Odyssy (Empire) and Dani Offline, and she is a recipient of the Panavision New Filmmaker Program Grant. She is currently preparing to direct her first narrative pilot, written by a Sundance Semi-Finalist - her next step into long-form storytelling.",
  "Queer, iconoclastic, and raised in a spiritual Puerto Rican household, Yaslynn trained at Emerson College and cut her teeth on set before spending the past several years inside the rooms that shape American television. Stops at Netflix, CBS, and Sony led to the production team at Apple TV+, where she has worked on over a dozen Emmy-nominated series and helped launch the studio's Directors Mid-Career Mentoring Program. Her own work aims outside the boundaries. Pulling indelible frames from strange, old films, and building worlds where the line between faith and delusion is nearly impossible to divine.",
];
