import Link from "next/link";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

import { UserInfo } from "@/modules/users/ui/components/user-info";

import { VideoGetOneOutput } from "../../types";

interface VideoOwnerProps {
  user: VideoGetOneOutput["user"];
  videoId: string;
};

export const VideoOwner = ({ user, videoId }: VideoOwnerProps) => {
  const creator = trpc.creators.current.useQuery();
  const isOwner = creator.data?.id === user.id;

  return (
    <div className="flex items-center sm:items-start justify-between sm:justify-start gap-3 min-w-0">
      <Link prefetch href={`/users/${user.id}`}>
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar size="lg" imageUrl={user.imageUrl} name={user.name} />
          <div className="flex flex-col gap-1 min-w-0">
            <UserInfo size="lg" name={user.name} />
            <span className="text-sm text-muted-foreground line-clamp-1">
              Vignette creator
            </span>
          </div>
        </div>
      </Link>
      {isOwner ? (
        <Button
          variant="secondary"
          className="rounded-full"
          asChild
        >
          <Link prefetch href={`/studio/videos/${videoId}`}>
            Edit video
          </Link>
        </Button>
      ) : (
        <Button variant="secondary" className="rounded-full flex-none" asChild>
          <Link prefetch href={`/users/${user.id}`}>
            Creator page
          </Link>
        </Button>
      )}
    </div>
  );
};
