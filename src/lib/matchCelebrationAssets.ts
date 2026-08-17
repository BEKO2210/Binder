export function matchCelebrationPhotoUrls(myPhotoUrl: string | null, theirPhotoUrl: string | null): string[] {
  return [...new Set([myPhotoUrl, theirPhotoUrl].filter((url): url is string => Boolean(url)))];
}
