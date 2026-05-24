import { redirect } from "next/navigation";

// Web upload is intentionally disabled — this flow lives in the mobile app.
// Anyone hitting /upload (e.g. bookmark, stale link) is redirected to the
// home feed.
const Page = () => {
  redirect("/");
};

export default Page;
