import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { listFirebaseVideos, listFirebaseAllFiles } = await import("@/lib/firebase");

  const argPrefix = process.argv[2];
  const prefix =
    argPrefix ?? process.env.FIREBASE_STORAGE_VIDEO_PREFIX ?? "videos/";
  console.log(`\n=== Listing under "${prefix}" ===\n`);

  const items = await listFirebaseVideos(prefix);
  if (items.length > 0) {
    for (const item of items) {
      console.log("---");
      console.log(`path     : ${item.fullPath}`);
      console.log(`bucket   : ${item.bucket}`);
      console.log(`type     : ${item.contentType ?? "?"}`);
      console.log(`size     : ${(item.size / 1_000_000).toFixed(2)} MB`);
      console.log(`updated  : ${item.updatedAt ?? "?"}`);
      console.log(`url      : ${item.downloadUrl}`);
    }
    console.log("---");
    console.log(`Total videos: ${items.length}`);
  } else {
    console.log("No video files matched the video extension/content-type filter.");
  }

  console.log(`\n=== All file paths under "${prefix}" (unfiltered) ===\n`);
  const allPaths = await listFirebaseAllFiles(prefix);
  if (allPaths.length === 0) {
    console.log("No files at all under this prefix.");
  } else {
    for (const path of allPaths) console.log(path);
    console.log(`---\nTotal files: ${allPaths.length}`);
  }
}

main().catch((error) => {
  console.error("Listing failed:", error);
  process.exit(1);
});
