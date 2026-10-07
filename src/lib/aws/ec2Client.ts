import { EC2Client } from '@aws-sdk/client-ec2'

/**
 * Builds an EC2 client. When access keys are supplied they are used directly;
 * otherwise the AWS SDK default credential provider chain takes over —
 * environment variables, shared config files, container/instance roles, and
 * web-identity tokens (AWS_ROLE_ARN + AWS_WEB_IDENTITY_TOKEN_FILE, which is how
 * OIDC-based hosts such as EKS or Railway expose credentials).
 */
export const createEC2Client = ({
  region,
  accessKeyId,
  secretAccessKey,
}: {
  region: string
  accessKeyId?: string | null
  secretAccessKey?: string | null
}) => {
  const hasKeys = !!accessKeyId?.trim() && !!secretAccessKey?.trim()

  return new EC2Client({
    region,
    ...(hasKeys
      ? {
          credentials: {
            accessKeyId: accessKeyId!.trim(),
            secretAccessKey: secretAccessKey!.trim(),
          },
        }
      : {}),
  })
}
