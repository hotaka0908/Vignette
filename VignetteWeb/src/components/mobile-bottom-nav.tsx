"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, SearchIcon, VideoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  {
    title: "Home",
    href: "/",
    icon: HomeIcon,
  },
  {
    title: "Search",
    href: "/search",
    icon: SearchIcon,
  },
  {
    title: "Studio",
    href: "/studio",
    icon: VideoIcon,
  },
];

export const MobileBottomNav = () => {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background md:hidden">
      <div className="grid h-16 grid-cols-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              prefetch
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground",
                isActive && "text-foreground",
              )}
            >
              <item.icon className="size-5" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
