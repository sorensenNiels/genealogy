import { Card, CardContent } from "@genealogy/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";

import { isImmichConfigured, listImmichAlbums } from "../../server/functions/immich.functions";

export const Route = createFileRoute("/photos/")({
  component: PhotosPage,
});

function PhotosPage() {
  const configured = useQuery({
    queryKey: ["immich", "isConfigured"],
    queryFn: () => isImmichConfigured(),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Photos</h1>
        <p className="text-sm text-muted-foreground">
          The family photo library, via{" "}
          <a
            href="https://immich.app"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Immich
          </a>
          . Photos are added through Immich itself — this page only browses and links what's already
          there.
        </p>
      </div>

      {configured.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : configured.data ? (
        <AlbumGrid />
      ) : (
        <NotConfigured />
      )}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">
        Immich isn't set up yet. Start it with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          docker compose --profile immich up -d
        </code>
        , create an API key in its own web UI, and set{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">IMMICH_URL</code>/
        <code className="rounded bg-muted px-1 py-0.5 text-xs">IMMICH_API_KEY</code> in the
        backend's environment.
      </p>
    </div>
  );
}

function AlbumGrid() {
  const albums = useQuery({
    queryKey: ["immich", "listAlbums"],
    queryFn: () => listImmichAlbums(),
  });

  if (albums.isPending) {
    return <p className="text-sm text-muted-foreground">Loading albums…</p>;
  }
  if (albums.isError) {
    return (
      <p className="text-sm text-destructive">Could not load albums: {albums.error.message}</p>
    );
  }
  if (albums.data.length === 0) {
    return <p className="text-sm text-muted-foreground">No albums in Immich yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {albums.data.map((album) => (
        <Link key={album.id} to="/photos/$albumId" params={{ albumId: album.id }}>
          <Card className="overflow-hidden py-0 transition-colors hover:border-foreground/30">
            <div className="aspect-square bg-muted">
              {album.albumThumbnailAssetId && (
                <img
                  src={`/api/immich/assets/${album.albumThumbnailAssetId}/thumbnail`}
                  alt=""
                  className="size-full object-cover"
                />
              )}
            </div>
            <CardContent className="space-y-0.5 px-3 py-3">
              <p className="truncate text-sm font-medium">{album.albumName}</p>
              <p className="text-xs text-muted-foreground">
                {album.assetCount} {album.assetCount === 1 ? "photo" : "photos"}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
