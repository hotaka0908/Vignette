"use client";

import { useRouter } from "next/navigation";

import { trpc } from "@/trpc/client";
import { FilterCarousel } from "@/components/filter-carousel";

interface CategoriesSectionProps {
  categoryId?: string;
};

export const CategoriesSection = ({ categoryId }: CategoriesSectionProps) => {
  const router = useRouter();
  const categories = trpc.categories.getMany.useQuery();

  if (categories.isLoading) {
    return <CategoriesSectionSkeleton />;
  }

  if (categories.isError) {
    return <p>Error...</p>;
  }

  const data = (categories.data ?? []).map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const onSelect = (value: string | null) => {
    const url = new URL(window.location.href);

    if (value) {
      url.searchParams.set("categoryId", value);
    } else {
      url.searchParams.delete("categoryId");
    }

    router.push(url.toString());
  };

  return <FilterCarousel onSelect={onSelect} value={categoryId} data={data} />;
};

export const CategoriesSectionSkeleton = () => {
  return <FilterCarousel isLoading data={[]} onSelect={() => {}} />
};
