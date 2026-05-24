const FIREBASE_STORAGE_API_BASE = "https://firebasestorage.googleapis.com/v0/b";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.storageBucket,
);

export interface FirebaseVideoItem {
  fullPath: string;
  name: string;
  bucket: string;
  contentType: string | null;
  size: number;
  updatedAt: string | null;
  downloadUrl: string;
}

type FirebaseStorageObject = {
  name: string;
  bucket?: string;
  contentType?: string;
  size?: string;
  updated?: string;
  downloadTokens?: string;
  metadata?: {
    firebaseStorageDownloadTokens?: string;
  };
};

type FirebaseStorageListResponse = {
  items?: FirebaseStorageObject[];
  prefixes?: string[];
  nextPageToken?: string;
};

const getStorageBucket = () => {
  if (!firebaseConfig.storageBucket) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set");
  }

  return firebaseConfig.storageBucket;
};

const isVideoLike = (path: string, contentType?: string | null) => {
  if (contentType?.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|mkv)$/i.test(path);
};

const buildListUrl = ({
  bucket,
  prefix,
  pageToken,
}: {
  bucket: string;
  prefix?: string;
  pageToken?: string;
}) => {
  const url = new URL(`${FIREBASE_STORAGE_API_BASE}/${bucket}/o`);
  if (prefix) url.searchParams.set("prefix", prefix);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
};

const getObjectDownloadUrl = (bucket: string, object: FirebaseStorageObject) => {
  const encodedPath = encodeURIComponent(object.name);
  const token = object.downloadTokens || object.metadata?.firebaseStorageDownloadTokens;
  const url = new URL(`${FIREBASE_STORAGE_API_BASE}/${bucket}/o/${encodedPath}`);
  url.searchParams.set("alt", "media");
  if (token) url.searchParams.set("token", token.split(",")[0]);
  return url.toString();
};

const getObjectDownloadUrlFromPath = (bucket: string, fullPath: string) => {
  const url = new URL(`${FIREBASE_STORAGE_API_BASE}/${bucket}/o/${encodeURIComponent(fullPath)}`);
  url.searchParams.set("alt", "media");
  return url.toString();
};

const listObjectsPage = async ({
  bucket,
  prefix,
  pageToken,
}: {
  bucket: string;
  prefix?: string;
  pageToken?: string;
}) => {
  const response = await fetch(buildListUrl({ bucket, prefix, pageToken }));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      [
        `Firebase Storage list failed (${response.status}): ${errorText}`,
        "If object reads are allowed but list is denied, set FIREBASE_STORAGE_VIDEO_PATHS to exact video paths.",
      ].join("\n"),
    );
  }

  return response.json() as Promise<FirebaseStorageListResponse>;
};

const getObjectMetadata = async (bucket: string, fullPath: string) => {
  const response = await fetch(`${FIREBASE_STORAGE_API_BASE}/${bucket}/o/${encodeURIComponent(fullPath)}`);

  if (!response.ok) return null;

  return response.json() as Promise<FirebaseStorageObject>;
};

const configuredVideoPaths = () =>
  (process.env.FIREBASE_STORAGE_VIDEO_PATHS || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

export const getFirebaseVideoFromPath = async (fullPath: string): Promise<FirebaseVideoItem> => {
  const bucket = getStorageBucket();
  const metadata = await getObjectMetadata(bucket, fullPath);

  return {
    fullPath,
    name: fullPath.split("/").pop() || fullPath,
    bucket: metadata?.bucket || bucket,
    contentType: metadata?.contentType ?? null,
    size: Number(metadata?.size || 0),
    updatedAt: metadata?.updated ?? null,
    downloadUrl: metadata
      ? getObjectDownloadUrl(bucket, metadata)
      : getObjectDownloadUrlFromPath(bucket, fullPath),
  };
};

export const listFirebaseVideos = async (prefix = ""): Promise<FirebaseVideoItem[]> => {
  const bucket = getStorageBucket();
  const manualPaths = configuredVideoPaths();

  if (manualPaths.length > 0) {
    const manualItems = await Promise.all(manualPaths.map(getFirebaseVideoFromPath));
    return manualItems.filter((item) => isVideoLike(item.fullPath, item.contentType));
  }

  const videos: FirebaseVideoItem[] = [];
  const pendingPrefixes = [prefix].filter(Boolean);
  const rootPrefixes = pendingPrefixes.length > 0 ? pendingPrefixes : [""];

  for (const rootPrefix of rootPrefixes) {
    let pageToken: string | undefined;

    do {
      const page = await listObjectsPage({ bucket, prefix: rootPrefix, pageToken });

      for (const nestedPrefix of page.prefixes ?? []) {
        if (!pendingPrefixes.includes(nestedPrefix)) pendingPrefixes.push(nestedPrefix);
      }

      for (const item of page.items ?? []) {
        if (!isVideoLike(item.name, item.contentType)) continue;

        videos.push({
          fullPath: item.name,
          name: item.name.split("/").pop() || item.name,
          bucket: item.bucket || bucket,
          contentType: item.contentType ?? null,
          size: Number(item.size || 0),
          updatedAt: item.updated ?? null,
          downloadUrl: getObjectDownloadUrl(bucket, item),
        });
      }

      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  for (let index = 0; index < pendingPrefixes.length; index += 1) {
    const nestedPrefix = pendingPrefixes[index];
    if (rootPrefixes.includes(nestedPrefix)) continue;
    videos.push(...await listFirebaseVideos(nestedPrefix));
  }

  return videos;
};

export const listFirebaseAllFiles = async (prefix = ""): Promise<string[]> => {
  const bucket = getStorageBucket();
  const manualPaths = configuredVideoPaths();

  if (manualPaths.length > 0) return manualPaths;

  const paths: string[] = [];
  const pendingPrefixes = [prefix].filter(Boolean);
  const rootPrefixes = pendingPrefixes.length > 0 ? pendingPrefixes : [""];

  for (const rootPrefix of rootPrefixes) {
    let pageToken: string | undefined;

    do {
      const page = await listObjectsPage({ bucket, prefix: rootPrefix, pageToken });

      for (const nestedPrefix of page.prefixes ?? []) {
        if (!pendingPrefixes.includes(nestedPrefix)) pendingPrefixes.push(nestedPrefix);
      }

      for (const item of page.items ?? []) {
        paths.push(item.name);
      }

      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  for (let index = 0; index < pendingPrefixes.length; index += 1) {
    const nestedPrefix = pendingPrefixes[index];
    if (rootPrefixes.includes(nestedPrefix)) continue;
    paths.push(...await listFirebaseAllFiles(nestedPrefix));
  }

  return [...new Set(paths)];
};
