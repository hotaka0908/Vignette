import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { syncFirebaseStorageVideos } = await import("@/lib/firebase-video-sync");
  const result = await syncFirebaseStorageVideos({ log: true });

  if (result.skipped) {
    console.log("Firebase Storage sync skipped. Check database and Firebase configuration.");
    return;
  }

  console.log(
    [
      `Found ${result.found} Firebase Storage videos.`,
      `Inserted ${result.inserted}.`,
      `Updated ${result.updated}.`,
      `Generated ${result.thumbnailGenerated} thumbnails.`,
      result.thumbnailFailed > 0 ? `Thumbnail failures ${result.thumbnailFailed}.` : null,
    ].filter(Boolean).join(" "),
  );
}

main().catch((error) => {
  console.error("Firebase sync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
