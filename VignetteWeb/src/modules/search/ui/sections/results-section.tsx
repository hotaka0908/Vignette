"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { trpc } from "@/trpc/client";
import { DEFAULT_LIMIT } from "@/constants";

import { InfiniteScroll } from "@/components/infinite-scroll";
import { VideoRowCard, VideoRowCardSkeleton } from "@/modules/videos/ui/components/video-row-card";
import { VideoGridCard, VideoGridCardSkeleton } from "@/modules/videos/ui/components/video-grid-card";

interface ResultsSectionProps {
  query: string | undefined;
  categoryId: string | undefined;
};

export const ResultsSection = (props: ResultsSectionProps) => {
  return (
    <Suspense 
      key={`${props.query}-${props.categoryId}`}  
      fallback={<ResultsSectionSkeleton />}
    >
      <ErrorBoundary fallback={<p>Error</p>}>
        <ResultsSectionSuspense {...props} />
      </ErrorBoundary>
    </Suspense>
  );
};

export const ResultsSectionSkeleton = () => {
  return (
    <div>
      <div className="hidden flex-col gap-4 md:flex">
        {Array.from({ length: 5 }).map((_, index) => (
          <VideoRowCardSkeleton key={index} />
        ))}
      </div>
      <div className="flex flex-col gap-4 p-4 gap-y-10 pt-6 md:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <VideoGridCardSkeleton key={index} />
        ))}
      </div>
    </div>
  )
}

const ResultsSectionSuspense = ({
  query,
  categoryId,
}: ResultsSectionProps) => {
  const [results, resultsQuery] = trpc.search.getMany.useSuspenseInfiniteQuery(
    { query, categoryId, limit: DEFAULT_LIMIT },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );
  const items = results.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center">
        <p className="text-sm font-medium">No matching videos.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try another search or upload the first public video.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 gap-y-10 md:hidden">
        {items.map((video) => (
            <VideoGridCard key={video.id} data={video} />
          ))
        }
      </div>
      <div className="hidden flex-col gap-4 md:flex">
        {items.map((video) => (
            <VideoRowCard key={video.id} data={video} />
          ))
        }
      </div>
      <InfiniteScroll
        hasNextPage={resultsQuery.hasNextPage}
        isFetchingNextPage={resultsQuery.isFetchingNextPage}
        fetchNextPage={resultsQuery.fetchNextPage}
      />
    </>
  )
}
