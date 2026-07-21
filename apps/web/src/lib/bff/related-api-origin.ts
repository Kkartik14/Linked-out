import {
  relatedProjects,
  type VercelRelatedProjects,
} from "@vercel/related-projects";

const API_PROJECT_NAME = "linked-out-api";

function httpsOrigin(host: string | undefined): string | undefined {
  if (!host) return undefined;
  return host.startsWith("https://") ? host : `https://${host}`;
}

/** Matching API preview origin for this Git-triggered web preview. */
export function relatedApiOrigin(
  fallback: string | undefined = process.env.INTERNAL_API_BASE_URL,
  environment: string | undefined = process.env.VERCEL_ENV,
  projects: VercelRelatedProjects = relatedProjects({ noThrow: true }),
): string | undefined {
  if (environment !== "preview") return fallback;
  const project = projects.find((candidate) => candidate.project.name === API_PROJECT_NAME);
  return (
    httpsOrigin(project?.preview.customEnvironment ?? project?.preview.branch) ?? fallback
  );
}
