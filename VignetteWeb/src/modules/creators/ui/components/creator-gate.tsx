"use client";

import { useState } from "react";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface CreatorGateProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export const CreatorGate = ({
  children,
  title = "Join Vignette",
  description = "Create a lightweight creator profile to upload and manage videos.",
}: CreatorGateProps) => {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const currentCreator = trpc.creators.current.useQuery();
  const startSession = trpc.creators.startSession.useMutation({
    onSuccess: async () => {
      await utils.creators.current.invalidate();
      toast.success("Creator profile ready");
    },
    onError: (error) => {
      toast.error(error.message || "Could not start creator session");
    },
  });

  if (currentCreator.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (currentCreator.data) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          startSession.mutate({ name, inviteCode });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="creator-name">Creator name</Label>
          <Input
            id="creator-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your channel name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-code">Invite code</Label>
          <Input
            id="invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="VIGNETTE2026"
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={startSession.isPending || name.trim().length < 2 || !inviteCode.trim()}
        >
          {startSession.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UserPlusIcon />
          )}
          Continue
        </Button>
      </form>
    </div>
  );
};
