"use client";

import Link from "next/link";
import { ClapperboardIcon, UserCircleIcon } from "lucide-react"

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button"

export const AuthButton = () => {
  const creator = trpc.creators.current.useQuery();

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="secondary" className="hidden rounded-full shadow-none md:inline-flex">
        <Link prefetch href="/studio">
          <ClapperboardIcon />
          Studio
        </Link>
      </Button>
      <Button asChild variant="outline" className="rounded-full shadow-none">
        <Link prefetch href="/studio">
          <UserCircleIcon />
          <span className="hidden max-w-28 truncate sm:inline">
            {creator.data?.name ?? "Join"}
          </span>
        </Link>
      </Button>
    </div>
  )
}
