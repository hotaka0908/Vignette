import Link from "next/link";

import { trpc } from "@/trpc/client";
import { UserAvatar } from "@/components/user-avatar";
import { SidebarHeader, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

export const StudioSidebarHeader = () => {
  const creator = trpc.creators.current.useQuery();
  const { state } = useSidebar();
  const name = creator.data?.name ?? "Vignette Creator";
  const imageUrl = creator.data?.imageUrl ?? "/user-placeholder.svg";

  if (state === "collapsed") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={name} asChild>
          <Link prefetch href="/studio">
            <UserAvatar
              imageUrl={imageUrl}
              name={name}
              size="xs"
            />
            <span className="text-sm">{name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarHeader className="flex items-center justify-center pb-4">
      <Link prefetch href="/studio">
        <UserAvatar
          imageUrl={imageUrl}
          name={name}
          className="size-[112px] hover:opacity-80 transition-opacity"
        />
      </Link>
      <div className="flex flex-col items-center mt-2 gap-y-1">
        <p className="text-sm font-medium">
          Your studio
        </p>
        <p className="text-xs text-muted-foreground">
          {name}
        </p>
      </div>
    </SidebarHeader>
  );
};
