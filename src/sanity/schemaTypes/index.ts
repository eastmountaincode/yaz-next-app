import { bioType } from "@/sanity/schemaTypes/bio";
import { clientsType } from "@/sanity/schemaTypes/clients";
import { directorReelType } from "@/sanity/schemaTypes/directorReel";
import { stillsType } from "@/sanity/schemaTypes/stills";

export const schemaTypes = [directorReelType, bioType, clientsType, stillsType];
