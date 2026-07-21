import {
  relatedProjects,
  type VercelRelatedProjects,
} from '@vercel/related-projects';

const WEB_PROJECT_NAME = 'linked-out-fe';

function httpsOrigin(host: string | undefined): string | undefined {
  if (!host) return undefined;
  return host.startsWith('https://') ? host : `https://${host}`;
}

function relatedPreviewOrigin(
  projects: VercelRelatedProjects,
  projectName: string,
): string | undefined {
  const project = projects.find((candidate) => candidate.project.name === projectName);
  return httpsOrigin(project?.preview.customEnvironment ?? project?.preview.branch);
}

/**
 * Compose the branch-specific origins Vercel knows only at deployment time.
 *
 * Production and local environments keep their explicit configuration. On a Git preview,
 * `VERCEL_BRANCH_URL` names this API deployment while Related Projects names the matching web
 * deployment from the same branch. Applying those values before Zod parses the environment keeps
 * CORS, OAuth handoff redirects, and API self-identification on one exact pair of origins.
 */
export function deploymentEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  projects: VercelRelatedProjects = relatedProjects({ noThrow: true }),
): NodeJS.ProcessEnv {
  if (source.VERCEL_ENV !== 'preview') return source;

  const apiOrigin = httpsOrigin(source.VERCEL_BRANCH_URL ?? source.VERCEL_URL);
  const webOrigin = relatedPreviewOrigin(projects, WEB_PROJECT_NAME);

  return {
    ...source,
    ...(apiOrigin ? { API_BASE_URL: apiOrigin } : {}),
    ...(webOrigin
      ? {
          WEB_URL: webOrigin,
          ...(source.OAUTH_SESSION_MODE === 'handoff'
            ? { PUBLIC_OAUTH_CALLBACK_BASE_URL: webOrigin }
            : {}),
        }
      : {}),
  };
}
