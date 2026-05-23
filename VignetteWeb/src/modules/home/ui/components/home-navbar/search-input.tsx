"use client";

import { Suspense, useState } from "react";
import { SparklesIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { APP_URL } from "@/constants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const SearchInput = () => {
  return (
    <Suspense fallback={<Skeleton className="h-10 w-full" />}>
      <SearchInputSuspense />
    </Suspense>
  );
};

const SearchInputSuspense = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const query = searchParams.get("query") || searchParams.get("q") || "";
  const categoryId = searchParams.get("categoryId") || "";

  const [value, setValue] = useState(query);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const url = new URL("/search", APP_URL);
    const newQuery = value.trim();

    url.searchParams.set("query", newQuery);

    if (categoryId) {
      url.searchParams.set("categoryId", categoryId);
    }

    if (newQuery === "") {
      url.searchParams.delete("query");
    }

    setValue(newQuery);
    router.push(url.toString());
  }

  return (
    <form className="flex w-full max-w-[600px]" onSubmit={handleSearch}>
      <div className="relative w-full">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="text"
          placeholder="Search with AI"
          className="w-full rounded-l-full border py-2 pl-4 pr-12 focus:border-blue-500 focus:outline-none"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setValue("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
          >
            <XIcon className="text-gray-500" />
          </Button>
        )}
      </div>
      <button
        disabled={!value.trim()}
        type="submit"
        className="border border-l-0 bg-gray-100 px-5 py-2.5 rounded-r-full hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SparklesIcon className="size-5" />
      </button>
    </form>
  );
};
