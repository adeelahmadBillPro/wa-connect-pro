// Platform admin check
// Set PLATFORM_ADMIN_IDS as comma-separated user UUIDs in env
export function isPlatformAdmin(userId: string): boolean {
  const adminIds = process.env.PLATFORM_ADMIN_IDS || "";
  return adminIds.split(",").map((id) => id.trim()).includes(userId);
}
