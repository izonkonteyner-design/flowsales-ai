import { createPublicHealthResponse } from "@/server/services/health";

export async function GET() {
  return createPublicHealthResponse();
}
