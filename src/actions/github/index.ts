'use server'

import { unstable_cache } from 'next/cache'

import { publicClient } from '@/lib/safe-action'

const GITHUB_REPO = process.env.GITHUB_REPO ?? 'Dvorinka/dflow'

const getRepoStars = unstable_cache(
  async () => {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })

    if (!res.ok) {
      throw new Error(`GitHub API responded with ${res.status}`)
    }

    const data = await res.json()
    return data.stargazers_count as number
  },
  ['github-repo-stars', GITHUB_REPO],
  { revalidate: 3600 },
)

export const getGithubStarsAction = publicClient
  .metadata({
    actionName: 'getGithubStarsAction',
  })
  .action(async () => {
    try {
      return { stars: await getRepoStars() }
    } catch {
      return { stars: null }
    }
  })
