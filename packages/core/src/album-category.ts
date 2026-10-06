import { z } from "zod";

/**
 * A user-defined grouping for photo albums — a family name ("Sørensen"), a
 * theme ("Holidays"), whatever makes sense for the collection. An album can
 * be in any number of categories (a Sørensen–Jensen wedding album belongs to
 * both families), and categories are listed alphabetically, not in a manual
 * order. Its own table rather than a `configurableOptions` topic: categories
 * are created and renamed while organizing albums on the Photos page, carry a
 * color, and are user data, not a closed vocabulary a dropdown picks from —
 * see "Album categories" in TECH_STACK.md.
 */
export const albumCategoryIdSchema = z.uuid();

export const albumCategoryNameSchema = z.string().trim().min(1).max(60);

export const albumCategoryColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Expected a 6-digit hex color");

export const createAlbumCategorySchema = z.object({
  name: albumCategoryNameSchema,
  color: albumCategoryColorSchema,
});
export type CreateAlbumCategoryInput = z.infer<typeof createAlbumCategorySchema>;

export const updateAlbumCategorySchema = createAlbumCategorySchema.extend({
  id: albumCategoryIdSchema,
});
export type UpdateAlbumCategoryInput = z.infer<typeof updateAlbumCategorySchema>;

export interface AlbumCategory {
  id: string;
  name: string;
  color: string;
}
