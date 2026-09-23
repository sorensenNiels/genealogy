import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { listAlbumAssets, listImmichAlbums } from "../../server/functions/immich.functions";

export const Route = createFileRoute("/photos/$albumId")({
  component: AlbumRoute,
});

function AlbumRoute() {
  const { albumId } = Route.useParams();

  // Immich has no "get one album" call among the endpoints this app proxies
  // (see ImmichService) — the list is small and already fetched by the
  // gallery page this links from, so finding the name in it here is cheaper
  // than adding a second endpoint just for a page title.
  const albums = useQuery({
    queryKey: ["immich", "listAlbums"],
    queryFn: () => listImmichAlbums(),
  });
  const album = albums.data?.find((candidate) => candidate.id === albumId);

  const assets = useQuery({
    queryKey: ["immich", "albumAssets", albumId],
    queryFn: () => listAlbumAssets({ data: { albumId } }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to="/photos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Photos
        </Link>
        <h1 className="text-2xl font-semibold">{album?.albumName ?? "Album"}</h1>
      </div>

      {assets.isPending ? (
        <p className="text-sm text-muted-foreground">Loading photos…</p>
      ) : assets.isError ? (
        <p className="text-sm text-destructive">Could not load photos: {assets.error.message}</p>
      ) : assets.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos in this album.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {assets.data.map((asset) => (
            <div key={asset.id} className="aspect-square overflow-hidden rounded-md bg-muted">
              <img
                src={`/api/immich/assets/${asset.id}/thumbnail`}
                alt={asset.originalFileName}
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
