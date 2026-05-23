"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlameIcon, HomeIcon, SearchIcon, VideoIcon } from "lucide-react";

import { 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem
} from "@/components/ui/sidebar";

const items = [
  {
    title: "Home",
    url: "/",
    icon: HomeIcon,
  },
  {
    title: "Trending",
    url: "/feed/trending",
    icon: FlameIcon,
  },
  {
    title: "Studio",
    url: "/studio",
    icon: VideoIcon,
  },
  {
    title: "Search",
    url: "/search",
    icon: SearchIcon,
  },
];

export const MainSection = () => {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                asChild
                isActive={pathname === item.url}
              >
                <Link prefetch href={item.url} className="flex items-center gap-4">
                  <item.icon />
                  <span className="text-sm">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
